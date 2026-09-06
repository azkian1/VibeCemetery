'use client';

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useSession } from 'next-auth/react';
import type { GraveData, DeadRepo } from '@/types/game';
import type { SlotPositionData } from '@/game/events';
import type { BuryFlowMode } from '@/components/modals/BuryFlowModal';
import {
  abortLatestRequest,
  beginLatestRequest,
  createLatestRequestState,
  finishLatestRequest,
  isLatestRequest,
  type LatestRequestState,
} from '@/lib/latest-request';

// ── Types ──────────────────────────────────────────────

export type ModalType =
  | 'grave'
  | 'crematory'
  | 'mausoleum'
  | 'leaderboard'
  | 'agentAshes'
  | 'agentSkill'
  | 'bury'
  | 'skill'
  | 'burger'
  | 'profile';

export interface ModalData {
  slotId?: number;
  slotType?: string;
  graveData?: GraveData;
  initialDeadRepos?: DeadRepo[];
  flowMode?: BuryFlowMode;
  buildingName?: string;
  authorFilter?: string;
}

export type ModalInstanceId = string;
export type CemeteryMapVersion = 'v1' | 'v2';

export interface ModalStackEntry {
  id: ModalInstanceId;
  modal: ModalType;
  data: ModalData | null;
}

export interface ChatMessage {
  id: string;
  type: 'system' | 'gravedigger' | 'burial' | 'stat';
  text: string;
  timestamp: number;
}

export interface GameState {
  graves: Map<number, GraveData>;
  totalBuried: number;
  gravesLoading: boolean;
  gravesError: string | null;

  modalStack: ModalStackEntry[];
  activeModal: ModalType | null;    // derived from stack top
  modalData: ModalData | null;      // derived from stack top

  chatMessages: ChatMessage[];

  user: { github_username: string; image: string; name: string } | null;

  slotPositions: SlotPositionData[];

  fVotes: Set<string>;
  fStatusLoaded: boolean;
}

export type GameAction =
  | { type: 'SET_GRAVES'; graves: Map<number, GraveData>; error?: string | null }
  | { type: 'SET_GRAVES_LOADING' }
  | { type: 'SET_GRAVES_ERROR'; error: string | null }
  | { type: 'ADD_GRAVE'; grave: GraveData }
  | { type: 'OPEN_MODAL'; id: ModalInstanceId; modal: ModalType; data?: ModalData }
  | { type: 'PUSH_MODAL'; id: ModalInstanceId; modal: ModalType; data?: ModalData }
  | { type: 'CLOSE_MODAL' }
  | { type: 'CLOSE_ALL_MODALS' }
  | { type: 'ADD_CHAT_MESSAGE'; message: ChatMessage }
  | { type: 'SET_USER'; user: GameState['user'] }
  | { type: 'SET_SLOT_POSITIONS'; slots: SlotPositionData[] }
  | { type: 'UPDATE_F_COUNT'; slotId: number; fCount: number }
  | { type: 'SET_F_STATUS'; myVotes: string[] }
  | { type: 'ADD_F_VOTE'; graveId: string; slotId: number }
  | { type: 'REMOVE_F_VOTE'; graveId: string; slotId: number; fCount: number };

// ── Reducer ────────────────────────────────────────────

const initialState: GameState = {
  graves: new Map(),
  totalBuried: 0,
  gravesLoading: true,
  gravesError: null,
  modalStack: [],
  activeModal: null,
  modalData: null,
  chatMessages: [],
  user: null,
  slotPositions: [],
  fVotes: new Set(),
  fStatusLoaded: false,
};

export function createModalInstanceId(): ModalInstanceId {
  return crypto.randomUUID();
}

function withStackTop(state: GameState, stack: GameState['modalStack']): GameState {
  const top = stack.length > 0 ? stack[stack.length - 1] : null;
  return { ...state, modalStack: stack, activeModal: top?.modal ?? null, modalData: top?.data ?? null };
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_GRAVES': {
      const graves = action.graves;
      return {
        ...state,
        graves,
        totalBuried: graves.size,
        gravesLoading: false,
        gravesError: action.error ?? null,
      };
    }
    case 'SET_GRAVES_LOADING':
      return {
        ...state,
        gravesLoading: true,
        gravesError: null,
      };
    case 'SET_GRAVES_ERROR':
      return {
        ...state,
        gravesLoading: false,
        gravesError: action.error,
      };
    case 'ADD_GRAVE': {
      const graves = new Map(state.graves);
      graves.set(action.grave.slot_id, action.grave);
      return {
        ...state,
        graves,
        totalBuried: graves.size,
        gravesError: null,
      };
    }
    case 'OPEN_MODAL':
      return withStackTop(state, [{ id: action.id, modal: action.modal, data: action.data ?? null }]);
    case 'PUSH_MODAL': {
      const filtered = state.modalStack.filter((e) => e.modal !== action.modal);
      return withStackTop(state, [...filtered, { id: action.id, modal: action.modal, data: action.data ?? null }]);
    }
    case 'CLOSE_MODAL':
      return withStackTop(state, state.modalStack.slice(0, -1));
    case 'CLOSE_ALL_MODALS':
      return withStackTop(state, []);
    case 'ADD_CHAT_MESSAGE':
      return { ...state, chatMessages: [...state.chatMessages, action.message].slice(-100) };
    case 'SET_USER':
      return {
        ...state,
        user: action.user,
        fVotes: new Set<string>(),
        fStatusLoaded: false,
      };
    case 'SET_SLOT_POSITIONS':
      return { ...state, slotPositions: action.slots };
    case 'UPDATE_F_COUNT': {
      const grave = state.graves.get(action.slotId);
      if (!grave) return state;
      const graves = new Map(state.graves);
      graves.set(action.slotId, { ...grave, f_count: action.fCount });
      return { ...state, graves };
    }
    case 'SET_F_STATUS': {
      return {
        ...state,
        fVotes: new Set(action.myVotes),
        fStatusLoaded: true,
      };
    }
    case 'ADD_F_VOTE': {
      const fVotes = new Set(state.fVotes);
      fVotes.add(action.graveId);
      const grave = state.graves.get(action.slotId);
      if (!grave) return { ...state, fVotes };
      const graves = new Map(state.graves);
      graves.set(action.slotId, { ...grave, f_count: (grave.f_count ?? 0) + 1 });
      return { ...state, graves, fVotes };
    }
    case 'REMOVE_F_VOTE': {
      const fVotes = new Set(state.fVotes);
      fVotes.delete(action.graveId);
      const grave = state.graves.get(action.slotId);
      if (!grave) return { ...state, fVotes };
      const graves = new Map(state.graves);
      graves.set(action.slotId, { ...grave, f_count: action.fCount });
      return { ...state, graves, fVotes };
    }
  }
}

// ── Context ────────────────────────────────────────────

const GameContext = createContext<{
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  gravesRequestStateRef: { current: LatestRequestState };
  fStatusRequestStateRef: { current: LatestRequestState };
} | null>(null);

export const CemeteryMapVersionContext = createContext<CemeteryMapVersion>('v1');

// ── Provider ───────────────────────────────────────────

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, reducerDispatch] = useReducer(gameReducer, initialState);
  const gravesRequestStateRef = useRef<LatestRequestState>(createLatestRequestState());
  const fStatusRequestStateRef = useRef<LatestRequestState>(createLatestRequestState());
  const dispatch = useCallback((action: GameAction) => {
    if (
      action.type === 'ADD_GRAVE'
      || action.type === 'UPDATE_F_COUNT'
      || action.type === 'ADD_F_VOTE'
      || action.type === 'REMOVE_F_VOTE'
    ) {
      abortLatestRequest(gravesRequestStateRef.current);
    }
    if (action.type === 'SET_USER') {
      abortLatestRequest(fStatusRequestStateRef.current);
    }
    reducerDispatch(action);
  }, []);
  const { data: session, status } = useSession();
  const githubUsername = session?.user?.github_username ?? null;

  useEffect(() => {
    if (status === 'loading') return;

    dispatch({
      type: 'SET_USER',
      user: githubUsername
        ? {
            github_username: githubUsername,
            image: session?.user?.image ?? '',
            name: session?.user?.name ?? '',
          }
        : null,
    });
  }, [status, githubUsername, session?.user?.image, session?.user?.name, dispatch]);

  useEffect(() => () => {
    abortLatestRequest(gravesRequestStateRef.current);
    abortLatestRequest(fStatusRequestStateRef.current);
  }, []);

  return (
    <GameContext.Provider value={useMemo(() => ({
      state,
      dispatch,
      gravesRequestStateRef,
      fStatusRequestStateRef,
    }), [state, dispatch])}>
      {children}
    </GameContext.Provider>
  );
}

// ── Hooks ──────────────────────────────────────────────

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}

export function useCemeteryMapVersion(): CemeteryMapVersion {
  return useContext(CemeteryMapVersionContext);
}

export function useModal() {
  const { state, dispatch } = useGame();

  const open = useCallback(
    (modal: ModalType, data?: ModalData) => {
      dispatch({ type: 'OPEN_MODAL', id: createModalInstanceId(), modal, data });
    },
    [dispatch],
  );

  const push = useCallback(
    (modal: ModalType, data?: ModalData) => {
      dispatch({ type: 'PUSH_MODAL', id: createModalInstanceId(), modal, data });
    },
    [dispatch],
  );

  const close = useCallback(() => {
    dispatch({ type: 'CLOSE_MODAL' });
  }, [dispatch]);

  const closeAll = useCallback(() => {
    dispatch({ type: 'CLOSE_ALL_MODALS' });
  }, [dispatch]);

  return {
    open,
    push,
    close,
    closeAll,
    activeModal: state.activeModal,
    modalData: state.modalData,
    modalStack: state.modalStack,
  };
}

export function useGraves(options?: { auto?: boolean; mapVersion?: 'v1' | 'v2' }) {
  const { state, dispatch, gravesRequestStateRef } = useGame();
  const auto = options?.auto ?? true;
  const mapVersion = options?.mapVersion ?? 'v1';

  const fetchGraves = useCallback(async () => {
    const request = beginLatestRequest(gravesRequestStateRef.current);
    dispatch({ type: 'SET_GRAVES_LOADING' });

    try {
      const res = await fetch(`/api/graves?map_version=${mapVersion}`, { signal: request.controller.signal });
      if (!isLatestRequest(gravesRequestStateRef.current, request)) return;
      if (!res.ok) {
        console.error('[VibeCemetery] Failed to fetch graves:', res.status);
        dispatch({ type: 'SET_GRAVES_ERROR', error: 'The cemetery records could not be loaded.' });
        return;
      }
      const data: GraveData[] = await res.json();
      if (!isLatestRequest(gravesRequestStateRef.current, request)) return;
      const map = new Map<number, GraveData>();
      for (const g of data) map.set(g.slot_id, g);
      dispatch({ type: 'SET_GRAVES', graves: map, error: null });
    } catch (err) {
      if (!isLatestRequest(gravesRequestStateRef.current, request)) return;
      console.error('[VibeCemetery] Failed to fetch graves:', err);
      dispatch({ type: 'SET_GRAVES_ERROR', error: 'The cemetery records could not be loaded.' });
    } finally {
      finishLatestRequest(gravesRequestStateRef.current, request);
    }
  }, [dispatch, gravesRequestStateRef, mapVersion]);

  useEffect(() => {
    if (!auto) return;
    fetchGraves();
  }, [auto, fetchGraves]);

  return {
    graves: state.graves,
    totalBuried: state.totalBuried,
    loading: state.gravesLoading,
    error: state.gravesError,
    refetch: fetchGraves,
  };
}

export function useChat() {
  const { state, dispatch } = useGame();

  const addMessage = useCallback(
    (message: ChatMessage) => {
      dispatch({ type: 'ADD_CHAT_MESSAGE', message });
    },
    [dispatch],
  );

  return {
    messages: state.chatMessages,
    addMessage,
  };
}

export function useFStatus() {
  const { state, dispatch, fStatusRequestStateRef } = useGame();
  const { data: session, status } = useSession();
  const sessionUsername = status === 'authenticated' ? session?.user?.github_username ?? null : null;
  const currentUser = state.user?.github_username ?? null;

  useEffect(() => {
    if (status === 'loading' || currentUser !== sessionUsername || state.gravesLoading || state.fStatusLoaded) return;

    const fStatusRequestState = fStatusRequestStateRef.current;
    const request = beginLatestRequest(fStatusRequestState);

    async function loadFStatus() {
      try {
        const response = await fetch('/api/f-status', {
          cache: 'no-store',
          signal: request.controller.signal,
        });
        if (!isLatestRequest(fStatusRequestState, request)) return;
        const data = await response.json().catch(() => ({ myVotes: [] })) as { myVotes?: unknown };
        if (!isLatestRequest(fStatusRequestState, request)) return;
        const myVotes = Array.isArray(data.myVotes)
          ? data.myVotes.filter((vote): vote is string => typeof vote === 'string')
          : [];
        dispatch({ type: 'SET_F_STATUS', myVotes });
      } catch {
        if (!isLatestRequest(fStatusRequestState, request)) return;
        dispatch({ type: 'SET_F_STATUS', myVotes: [] });
      } finally {
        finishLatestRequest(fStatusRequestState, request);
      }
    }

    void loadFStatus();
    return () => {
      abortLatestRequest(fStatusRequestState);
    };
  }, [currentUser, dispatch, fStatusRequestStateRef, sessionUsername, state.fStatusLoaded, state.gravesLoading, status]);
}
