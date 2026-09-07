'use client';

import { useModal } from '@/context/GameContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import StoneFrame from '@/components/ui/StoneFrame';
import CloseButton from '@/components/ui/CloseButton';
import ModalOverlay from './ModalOverlay';
import styles from './LedgerModal.module.css';

export default function CaretakerModal() {
  const { close } = useModal();
  const isMobile = useIsMobile();

  return (
    <ModalOverlay onClose={close}>
      <StoneFrame isMobile={isMobile} maxWidth={420}>
        <div className={styles.body}>
          <CloseButton onClick={close} />
          <h2 className={styles.title}>Gravedigger&apos;s Lodge</h2>
          <p className={styles.empty}>This is the cemetery caretaker&apos;s house.</p>
        </div>
      </StoneFrame>
    </ModalOverlay>
  );
}
