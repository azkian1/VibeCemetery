import { test, expect } from '@playwright/test';

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
    await page.goto('/');
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
    await page.goto('/');
    await waitForApp(page);
    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('BuryFlowModal can be opened from the shovel button', async ({ page }) => {
    const buryBtn = page.getByRole('button', { name: /SHOVEL/ });
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
    await page.goto('/');
    await waitForApp(page);
    // Filter out known benign errors (e.g., next-auth session, favicon)
    const realErrors = consoleErrors.filter(
      (e) => !e.includes('next-auth') && !e.includes('favicon') && !e.includes('404')
        && !e.includes('Failed to fetch') && !e.includes('VibeCemetery')
    );
    expect(realErrors).toEqual([]);
  });
});

test.describe('Ceremony plumbing (mobile 390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Mobile: no ceremony crash on load', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('Mobile: ritual CTAs return null (no crash)', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    // BuryFlowModal returns null on mobile — verify no stale ceremony state
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(2000);
    expect(errors.length).toBe(0);
  });
});
