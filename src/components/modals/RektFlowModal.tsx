'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGame, useModal } from '@/context/GameContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cemeteryEvents } from '@/game/events';
import { savePendingBurialCeremony } from '@/lib/pending-burial-ceremony';
import { REKT_VOICE } from '@/gravedigger/rekt';
import ModalOverlay from './ModalOverlay';
import StoneFrame from '@/components/ui/StoneFrame';
import CloseButton from '@/components/ui/CloseButton';
import RektFlow from '@/components/rekt/RektFlow';

export default function RektFlowModal() {
  const { close } = useModal();
  const { dispatch } = useGame();
  const router = useRouter();
  const mobile = useIsMobile();
  const [writing, setWriting] = useState(false);
  const delivered = useRef(new Set<string>());
  return <ModalOverlay onClose={writing ? () => {} : close} labelledBy="rekt-modal-title">
    <StoneFrame isMobile={mobile} maxWidth={520}>
      <span id="rekt-modal-title" className="sr-only">Bury REKT</span>
      {!writing && <CloseButton onClick={close} />}
      <RektFlow onBusyChange={setWriting} onCreated={grave => {
        if (delivered.current.has(grave.id)) return;
        delivered.current.add(grave.id);
        dispatch({ type: 'ADD_GRAVE', grave });
        const ceremony = { slot_id: grave.slot_id, id: grave.id, name: grave.name, grave_gid: grave.grave_gid, chatText: REKT_VOICE.done, gravediggerPhrase: REKT_VOICE.ceremony };
        if (window.location.pathname === '/cemetery') cemeteryEvents.emit('burial_ceremony', ceremony);
        else router.push(savePendingBurialCeremony(ceremony) ? '/cemetery' : `/cemetery?grave=${encodeURIComponent(grave.id)}`);
        close();
      }} />
    </StoneFrame>
  </ModalOverlay>;
}
