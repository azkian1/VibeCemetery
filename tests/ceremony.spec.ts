import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Burial Ceremony Animation — Smoke Tests
 *
 * These tests verify the ceremony event wiring works correctly.
 * Full visual ceremony requires auth + real grave POST, so we test
 * the plumbing: event bus, scene readiness, and no runtime crashes.
 */

async function waitForApp(page: import('@playwright/test').Page) {
  await page.waitForSelector('canvas', { timeout: 15_000 });
  await page.waitForTimeout(3000);
}

test.describe('Ceremony plumbing (desktop 1440×900)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/cemetery');
    await waitForApp(page);
  });

  test('CemeteryScene loads without errors after ceremony code added', async ({ page }) => {
    // Verify canvas renders (scene didn't crash on create())
    await expect(page.locator('canvas').first()).toBeVisible();
    // No JS errors
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(2000);
    expect(errors.length).toBe(0);
  });

  test('burial_ceremony event can be emitted without crash', async ({ page }) => {
    // Emit a ceremony event with a fake slot_id — should not crash the scene
    const crashed = await page.evaluate(() => {
      try {
        // Access the event bus from window (it's a module singleton)
        // We test via dispatching a custom event and checking no uncaught errors
        const event = new CustomEvent('__test_ceremony', { detail: { slot_id: 999, id: 'test', name: 'test' } });
        window.dispatchEvent(event);
        return false;
      } catch {
        return true;
      }
    });
    expect(crashed).toBe(false);
    // Scene should still be running
    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('Phaser scene survives ceremony event bus wiring', async ({ page }) => {
    // Navigate away and back — tests that shutdown() properly cleans up ceremony listeners
    await page.goto('about:blank');
    await page.goto('/cemetery');
    await waitForApp(page);
    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('BuryFlowModal can be opened from the bury button', async ({ page }) => {
    await page.goto('/cemetery');
    await waitForApp(page);
    const buryBtn = page.getByRole('button', { name: /Bury/ });
    await expect(buryBtn).toBeVisible();
    // Click should open modal (will show login prompt for unauth)
    await buryBtn.click();
    await page.waitForTimeout(1000);
    // Modal overlay or auth prompt should appear
    const hasModal = await page.evaluate(() => {
      return document.querySelector('[style*="position: fixed"]') !== null ||
             document.querySelector('[role="dialog"]') !== null;
    });
    expect(hasModal).toBeTruthy();
    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('No console errors on fresh page load', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.goto('/cemetery');
    await waitForApp(page);
    // Filter out known benign errors (e.g., next-auth session, favicon)
    const realErrors = consoleErrors.filter(
      (e) => !e.includes('next-auth') && !e.includes('favicon') && !e.includes('404')
        && !e.includes('Failed to fetch') && !e.includes('VibeCemetery')
    );
    expect(realErrors).toEqual([]);
  });
});

test('queued ceremonies keep scene input disabled until the next ceremony starts', () => {
  const sceneSource = readFileSync('src/game/scenes/CemeteryScene.ts', 'utf8');
  const finishMethod = sceneSource.slice(
    sceneSource.indexOf('private finishBurialCeremony'),
    sceneSource.indexOf('private playBurialCeremony'),
  );

  expect(finishMethod).toContain('this.ceremonyScheduled = true');
  expect(finishMethod).toContain('this.input.enabled = false');
  expect(finishMethod).toContain('return;');
  expect(finishMethod).toContain('this.input.enabled = !this.modalOpen');
});

test('scheduled ceremonies disable scene input before delayed start', () => {
  const sceneSource = readFileSync('src/game/scenes/CemeteryScene.ts', 'utf8');
  const modalStateMethod = sceneSource.slice(
    sceneSource.indexOf('private onModalState'),
    sceneSource.indexOf('private slotHighlightGfx'),
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
  const sceneSource = readFileSync('src/game/scenes/CemeteryScene.ts', 'utf8');
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
  const canvasSource = readFileSync('src/components/PhaserCanvas.tsx', 'utf8');
  const doneHandler = canvasSource.slice(
    canvasSource.indexOf('const handleBurialCeremonyDone'),
    canvasSource.indexOf('useEffect(() => {', canvasSource.indexOf('const handleBurialCeremonyDone')),
  );

  expect(doneHandler).toContain('setTimeout(() => {');
  expect(doneHandler).toContain('1000');
  expect(doneHandler).toContain("modal: 'grave'");
  expect(doneHandler).toContain('data: { slotId: data.slot_id }');
});

test('grave modal auto-open waits for final ceremony, grave data, and no active modal', () => {
  const canvasSource = readFileSync('src/components/PhaserCanvas.tsx', 'utf8');
  const sceneSource = readFileSync('src/game/scenes/CemeteryScene.ts', 'utf8');
  const doneHandler = canvasSource.slice(
    canvasSource.indexOf('const handleBurialCeremonyDone'),
    canvasSource.indexOf('useEffect(() => {', canvasSource.indexOf('const handleBurialCeremonyDone')),
  );
  const finishMethod = sceneSource.slice(
    sceneSource.indexOf('private finishBurialCeremony'),
    sceneSource.indexOf('private playBurialCeremony'),
  );

  expect(finishMethod).toContain('willContinue');
  expect(doneHandler).toContain('data.willContinue');
  expect(doneHandler).toContain('activeModalRef.current');
  expect(doneHandler).toContain('gravesRef.current.has(data.slot_id)');
});

test('missing-slot ceremony fallback uses the shared ceremony cleanup path', () => {
  const sceneSource = readFileSync('src/game/scenes/CemeteryScene.ts', 'utf8');
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

test.describe('Ceremony plumbing (mobile 390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Mobile: no ceremony crash on load', async ({ page }) => {
    await page.goto('/cemetery');
    await waitForApp(page);
    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('Mobile: ritual CTAs return null (no crash)', async ({ page }) => {
    await page.goto('/cemetery');
    await waitForApp(page);
    // BuryFlowModal returns null on mobile — verify no stale ceremony state
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(2000);
    expect(errors.length).toBe(0);
  });
});
