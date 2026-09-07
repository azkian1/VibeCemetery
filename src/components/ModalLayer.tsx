'use client';

import dynamic from 'next/dynamic';
import { useModal, type ModalType } from '@/context/GameContext';
import { ModalOverlayTopContext } from './modals/ModalOverlay';

const GraveModal = dynamic(() => import('./modals/GraveModal'), { ssr: false });
const CrematoryModal = dynamic(() => import('./modals/CrematoryModal'), { ssr: false });
const CaretakerModal = dynamic(() => import('./modals/CaretakerModal'), { ssr: false });
const MausoleumModal = dynamic(() => import('./modals/MausoleumModal'), { ssr: false });
const BuryFlowModal = dynamic(() => import('./modals/BuryFlowModal'), { ssr: false });
const BurgerMenu = dynamic(() => import('./hud/BurgerMenu'), { ssr: false });
const LeaderboardModal = dynamic(() => import('./modals/LeaderboardModal'), { ssr: false });
const AgentAshesModal = dynamic(() => import('./modals/AgentAshesModal'), { ssr: false });
const SkillModal = dynamic(() => import('./modals/SkillModal'), { ssr: false });
const AgentSkillModal = dynamic(() => import('./modals/AgentSkillModal'), { ssr: false });
const ProfileModal = dynamic(() => import('./modals/ProfileModal'), { ssr: false });

const MODAL_MAP: Record<ModalType, React.ComponentType> = {
  grave: GraveModal,
  crematory: CrematoryModal,
  caretaker: CaretakerModal,
  mausoleum: MausoleumModal,
  burger: BurgerMenu,
  leaderboard: LeaderboardModal,
  agentAshes: AgentAshesModal,
  agentSkill: AgentSkillModal,
  bury: BuryFlowModal,
  skill: SkillModal,
  profile: ProfileModal,
};

export function ModalLayer() {
  const { modalStack } = useModal();
  if (modalStack.length === 0) return null;
  return (
    <>
      {modalStack.map((entry, i) => {
        const C = MODAL_MAP[entry.modal];
        if (!C) return null;
        const isTop = i === modalStack.length - 1;
        return (
          <div
            key={entry.id}
            style={{ display: isTop ? 'contents' : 'none' }}
            aria-hidden={!isTop}
            inert={!isTop || undefined}
          >
            <ModalOverlayTopContext.Provider value={isTop}>
              <C />
            </ModalOverlayTopContext.Provider>
          </div>
        );
      })}
    </>
  );
}
