'use client';

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { GraveData, CrematedData } from '@/types/game';
import type { SlotPositionData } from '@/game/events';

// ── Types ──────────────────────────────────────────────

export type ModalType =
  | 'grave'
  | 'crematory'
  | 'mausoleum'
  | 'leaderboard'
  | 'bury'
  | 'skill'
  | 'burger'
  | 'profile'
  | 'urn';

export interface ModalData {
  slotId?: number;
  slotType?: string;
  graveData?: GraveData;
  buildingName?: string;
  crematedItem?: CrematedData;
}

export interface ChatMessage {
  id: string;
  type: 'system' | 'gravedigger' | 'burial' | 'stat';
  text: string;
  timestamp: number;
}

export interface GameState {
  graves: Map<number, GraveData>;
  cremated: CrematedData[];
  totalBuried: number;
  gravesLoading: boolean;
  crematedLoading: boolean;

  modalStack: Array<{ modal: ModalType; data: ModalData | null }>;
  activeModal: ModalType | null;    // derived from stack top
  modalData: ModalData | null;      // derived from stack top

  chatMessages: ChatMessage[];

  user: { github_username: string; image: string; name: string } | null;

  slotPositions: SlotPositionData[];

  fVotes: Set<string>;
  fStatusLoaded: boolean;
}

export type GameAction =
  | { type: 'SET_GRAVES'; graves: Map<number, GraveData> }
  | { type: 'SET_CREMATED'; cremated: CrematedData[] }
  | { type: 'ADD_CREMATED'; cremated: CrematedData }
  | { type: 'ADD_GRAVE'; grave: GraveData }
  | { type: 'OPEN_MODAL'; modal: ModalType; data?: ModalData }
  | { type: 'PUSH_MODAL'; modal: ModalType; data?: ModalData }
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
  cremated: [],
  totalBuried: 0,
  gravesLoading: true,
  crematedLoading: true,
  modalStack: [],
  activeModal: null,
  modalData: null,
  chatMessages: [],
  user: null,
  slotPositions: [],
  fVotes: new Set(),
  fStatusLoaded: false,
};

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
        totalBuried: graves.size + state.cremated.length,
        gravesLoading: false,
      };
    }
    case 'SET_CREMATED': {
      return {
        ...state,
        cremated: action.cremated,
        totalBuried: state.graves.size + action.cremated.length,
        crematedLoading: false,
      };
    }
    case 'ADD_CREMATED': {
      const cremated = [...state.cremated, action.cremated];
      return {
        ...state,
        cremated,
        totalBuried: state.graves.size + cremated.length,
      };
    }
    case 'ADD_GRAVE': {
      const graves = new Map(state.graves);
      graves.set(action.grave.slot_id, action.grave);
      return {
        ...state,
        graves,
        totalBuried: graves.size + state.cremated.length,
      };
    }
    case 'OPEN_MODAL':
      return withStackTop(state, [{ modal: action.modal, data: action.data ?? null }]);
    case 'PUSH_MODAL': {
      const filtered = state.modalStack.filter((e) => e.modal !== action.modal);
      return withStackTop(state, [...filtered, { modal: action.modal, data: action.data ?? null }]);
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
} | null>(null);

// ── Provider ───────────────────────────────────────────

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  return (
    <GameContext.Provider value={useMemo(() => ({ state, dispatch }), [state, dispatch])}>
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

export function useModal() {
  const { state, dispatch } = useGame();

  const open = useCallback(
    (modal: ModalType, data?: ModalData) => {
      dispatch({ type: 'OPEN_MODAL', modal, data });
    },
    [dispatch],
  );

  const push = useCallback(
    (modal: ModalType, data?: ModalData) => {
      dispatch({ type: 'PUSH_MODAL', modal, data });
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

export function useGraves() {
  const { state, dispatch } = useGame();

  const fetchGraves = useCallback(async () => {
    try {
      const res = await fetch('/api/graves');
      if (!res.ok) {
        console.error('[VibeCemetery] Failed to fetch graves:', res.status);
        dispatch({ type: 'SET_GRAVES', graves: new Map() });
        return;
      }
      const data: GraveData[] = await res.json();
      const map = new Map<number, GraveData>();
      for (const g of data) map.set(g.slot_id, g);
      dispatch({ type: 'SET_GRAVES', graves: map });
    } catch (err) {
      console.error('[VibeCemetery] Failed to fetch graves:', err);
      dispatch({ type: 'SET_GRAVES', graves: new Map() });
    }
  }, [dispatch]);

  useEffect(() => {
    fetchGraves();
  }, [fetchGraves]);

  return {
    graves: state.graves,
    totalBuried: state.totalBuried,
    loading: state.gravesLoading,
    refetch: fetchGraves,
  };
}

export function useCremated() {
  const { state, dispatch } = useGame();

  const fetchCremated = useCallback(async () => {
    try {
      const res = await fetch('/api/cremated');
      if (!res.ok) {
        console.error('[VibeCemetery] Failed to fetch cremated:', res.status);
        dispatch({ type: 'SET_CREMATED', cremated: [] });
        return;
      }
      const data: CrematedData[] = await res.json();
      dispatch({ type: 'SET_CREMATED', cremated: data });
    } catch (err) {
      console.error('[VibeCemetery] Failed to fetch cremated:', err);
      dispatch({ type: 'SET_CREMATED', cremated: [] });
    }
  }, [dispatch]);

  // Refetch when user changes (login/logout)
  const currentUser = state.user?.github_username ?? null;
  useEffect(() => {
    fetchCremated();
  }, [fetchCremated, currentUser]);

  return {
    cremated: state.cremated,
    loading: state.crematedLoading,
    refetch: fetchCremated,
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
  const { state, dispatch } = useGame();

  useEffect(() => {
    if (state.gravesLoading || state.fStatusLoaded) return;
    fetch('/api/f-status')
      .then((r) => r.json().catch(() => ({ myVotes: [] })))
      .then((data: { myVotes: string[] }) => {
        dispatch({ type: 'SET_F_STATUS', myVotes: data.myVotes ?? [] });
      })
      .catch(() => {
        dispatch({ type: 'SET_F_STATUS', myVotes: [] });
      });
  }, [state.gravesLoading, state.fStatusLoaded, dispatch]);
}
