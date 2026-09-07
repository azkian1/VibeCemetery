import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Source contracts complement the mocked create/ceremony/reload browser scenarios
// in simplification.e2e.spec.ts. No live database writes or auth are used here.

test('queued ceremonies keep scene input disabled until the next ceremony starts', () => {
  const sceneSource = readFileSync('src/game/scenes/CemeterySceneV2.ts', 'utf8');
  const finishMethod = sceneSource.slice(
    sceneSource.indexOf('private finishBurialCeremony'),
    sceneSource.indexOf('  shutdown()'),
  );

  expect(finishMethod).toContain('this.ceremonyScheduled = true');
  expect(finishMethod).toContain('this.input.enabled = false');
  expect(finishMethod).toContain('return;');
  expect(finishMethod).toContain('this.input.enabled = !this.modalOpen');
});

test('scheduled ceremonies disable scene input before delayed start', () => {
  const sceneSource = readFileSync('src/game/scenes/CemeterySceneV2.ts', 'utf8');
  const modalStateMethod = sceneSource.slice(
    sceneSource.indexOf('private onModalState'),
    sceneSource.indexOf('private onHighlightSlot'),
  );
  const onBurialCeremonyMethod = sceneSource.slice(
    sceneSource.indexOf('private onBurialCeremony'),
    sceneSource.indexOf('private stopCameraMotion'),
  );

  expect(modalStateMethod).toContain('this.ceremonyScheduled = true');
  expect(modalStateMethod).toContain('this.input.enabled = false');
  expect(modalStateMethod).toContain('!this.ceremonyScheduled && !this.ceremonyInProgress && !this.pendingCeremony');
  expect(onBurialCeremonyMethod).toContain('this.ceremonyScheduled = true');
  expect(onBurialCeremonyMethod).toContain('this.input.enabled = false');
});

test('HUD camera controls are ignored while a ceremony is scheduled or pending', () => {
  const sceneSource = readFileSync('src/game/scenes/CemeterySceneV2.ts', 'utf8');
  const blockingHelper = sceneSource.slice(
    sceneSource.indexOf('private isCeremonyBlockingInput'),
    sceneSource.indexOf('private onMinimapClick'),
  );
  const minimapHandler = sceneSource.slice(
    sceneSource.indexOf('private onMinimapClick'),
    sceneSource.indexOf('private onModalState'),
  );
  const zoomHandler = sceneSource.slice(
    sceneSource.indexOf('private onZoomChange'),
    sceneSource.indexOf('private onBurialCeremony'),
  );

  expect(blockingHelper).toContain('this.ceremonyScheduled || this.ceremonyInProgress || !!this.pendingCeremony');
  expect(minimapHandler).toContain('if (this.isCeremonyBlockingInput()) return;');
  expect(zoomHandler).toContain('if (this.isCeremonyBlockingInput()) return;');
});

test('grave modal opens one second after burial ceremony completes', () => {
  const canvasSource = readFileSync('src/components/PhaserCanvasV2.tsx', 'utf8');
  const doneHandler = canvasSource.slice(
    canvasSource.indexOf('const handleBurialCeremonyDone'),
    canvasSource.indexOf('useEffect(() => {', canvasSource.indexOf('const handleBurialCeremonyDone')),
  );

  expect(doneHandler).toContain('scheduleCeremonyDoneTimer(() => openWhenReady(), 1000)');
  expect(doneHandler).toContain('1000');
  expect(doneHandler).toContain("modal: 'grave'");
  expect(doneHandler).toContain('data: { slotId: data.slot_id }');
});

test('grave modal auto-open waits for final ceremony, grave data, and no active modal', () => {
  const canvasSource = readFileSync('src/components/PhaserCanvasV2.tsx', 'utf8');
  const sceneSource = readFileSync('src/game/scenes/CemeterySceneV2.ts', 'utf8');
  const doneHandler = canvasSource.slice(
    canvasSource.indexOf('const handleBurialCeremonyDone'),
    canvasSource.indexOf('useEffect(() => {', canvasSource.indexOf('const handleBurialCeremonyDone')),
  );
  const finishMethod = sceneSource.slice(
    sceneSource.indexOf('private finishBurialCeremony'),
    sceneSource.indexOf('  shutdown()'),
  );

  expect(finishMethod).toContain('willContinue');
  expect(doneHandler).toContain('data.willContinue');
  expect(doneHandler).toContain('activeModalRef.current');
  expect(doneHandler).toContain('gravesRef.current.has(data.slot_id)');
});

test('missing-slot ceremony fallback uses the shared ceremony cleanup path', () => {
  const sceneSource = readFileSync('src/game/scenes/CemeterySceneV2.ts', 'utf8');
  const playMethodStart = sceneSource.indexOf('private playBurialCeremony');
  const fallbackBlock = sceneSource.slice(
    sceneSource.indexOf('if (!slot)', playMethodStart),
    sceneSource.indexOf('this.ceremonyInProgress = true', playMethodStart),
  );

  expect(fallbackBlock).toContain('this.finishBurialCeremony(data.slot_id)');
  expect(fallbackBlock).not.toContain("cemeteryEvents.emit('burial_ceremony_done'");
  expect(fallbackBlock).not.toContain('this.ceremonyQueue.shift()');
});

test('gate epitaph clears delayed fade timers on unmount', () => {
  const source = readFileSync('src/components/hud/GateEpitaph.tsx', 'utf8');
  const cleanupStart = source.indexOf('useEffect(() => () => {');
  const cleanupBlock = source.slice(cleanupStart, source.indexOf('}, []);', cleanupStart));

  expect(source).toContain('hideTimerRef');
  expect(source).toContain('sceneReadyTimerRef');
  expect(cleanupBlock).toContain('clearTimeout(hideTimerRef.current)');
  expect(cleanupBlock).toContain('clearTimeout(sceneReadyTimerRef.current)');
});
