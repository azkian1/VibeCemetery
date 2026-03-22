import { test, expect } from '@playwright/test';

/**
 * VibeCemetery Mobile Audit Tests
 *
 * Tests verify the CURRENT state of the app against the mobile.md checklist.
 * [TODO] tests verify items not yet implemented — they are expected to fail
 * and serve as acceptance criteria for the mobile optimization agent.
 */

async function waitForApp(page: import('@playwright/test').Page) {
  await page.waitForSelector('canvas', { timeout: 15_000 });
  await page.waitForTimeout(3000);
}

// ===========================================================================
// MOBILE (390×844)
// ===========================================================================

test.describe('Mobile (390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
  });

  // ---- Already working ----

  test('Phaser canvas renders', async ({ page }) => {
    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('ChatLog is hidden on mobile', async ({ page }) => {
    const souls = page.getByText(/souls buried/i);
    expect(await souls.count()).toBe(0);
  });

  test('Minimap is hidden on mobile', async ({ page }) => {
    expect(await page.locator('canvas').count()).toBe(1);
  });

  test('HoverTooltip is hidden on mobile', async ({ page }) => {
    expect(await page.locator('[data-testid="hover-tooltip"]').count()).toBe(0);
  });

  test('TopBar is visible on mobile', async ({ page }) => {
    await expect(page.locator('button').filter({ hasText: '☰' }).first()).toBeVisible();
  });

  test('BurgerMenu opens on mobile', async ({ page }) => {
    await page.getByLabel('Menu').click();
    await expect(page.getByRole('heading', { name: 'The Cemetery Guide' })).toBeVisible({ timeout: 5000 });
  });

  // ---- [TODO] — Not yet implemented (expected to FAIL) ----

  test('[TODO] CTA buttons are hidden on mobile', async ({ page }) => {
    expect(await page.getByRole('button', { name: /BURY/ }).count()).toBe(0);
    expect(await page.getByRole('button', { name: /SKILL/ }).count()).toBe(0);
  });

  test('[TODO] Login button is hidden for unauth users', async ({ page }) => {
    expect(await page.getByText('Login', { exact: true }).count()).toBe(0);
  });

  test('[TODO] viewport has user-scalable=no', async ({ page }) => {
    const content = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(content).toBeTruthy();
    expect(content!).toContain('user-scalable=no');
    expect(content!).toContain('maximum-scale=1');
  });

  test('[TODO] viewport-fit=cover', async ({ page }) => {
    const content = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(content).toBeTruthy();
    expect(content!).toContain('viewport-fit=cover');
  });

  test('[TODO] canvas has touch-action: none', async ({ page }) => {
    const canvas = page.locator('canvas').first();
    const parent = page.locator('canvas >> xpath=..');
    const canvasTA = await canvas.evaluate(el => getComputedStyle(el).touchAction);
    const parentTA = await parent.evaluate(el => getComputedStyle(el).touchAction);
    expect(canvasTA === 'none' || parentTA === 'none').toBe(true);
  });

  test('[TODO] root uses 100dvh', async ({ page }) => {
    // Find the root flex-column container by evaluating all divs
    const result = await page.evaluate(() => {
      const divs = document.querySelectorAll('div');
      for (const div of divs) {
        const s = div.style;
        if (s.display === 'flex' && s.flexDirection === 'column' && s.height && s.height.includes('dvh')) {
          return s.height;
        }
      }
      return null;
    });
    expect(result).toBeTruthy();
    expect(result!).toContain('dvh');
  });
});

// ===========================================================================
// DESKTOP (1440×900)
// ===========================================================================

test.describe('Desktop (1440×900)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
  });

  test('Phaser canvas renders', async ({ page }) => {
    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('CTA buttons are visible on desktop', async ({ page }) => {
    await expect(page.getByRole('button', { name: /BURY/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /SKILL/ })).toBeVisible();
  });

  test('Login button is visible on desktop', async ({ page }) => {
    await expect(page.getByText('Login', { exact: true })).toBeVisible();
  });

  test('Minimap canvas exists on desktop', async ({ page }) => {
    // Minimap canvas may take extra time to render
    await page.waitForTimeout(2000);
    expect(await page.locator('canvas').count()).toBeGreaterThanOrEqual(2);
  });

  test('TopBar elements visible', async ({ page }) => {
    await expect(page.locator('button').filter({ hasText: '☰' }).first()).toBeVisible();
    await expect(page.getByText('Login', { exact: true })).toBeVisible();
  });

  test('BurgerMenu opens on desktop', async ({ page }) => {
    await page.getByLabel('Menu').click();
    await expect(page.getByRole('heading', { name: 'The Cemetery Guide' })).toBeVisible({ timeout: 10_000 });
  });
});

// ===========================================================================
// DEEP LINKS
// ===========================================================================

test.describe('Deep links (mobile)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('?grave=meta loads without crash', async ({ page }) => {
    await page.goto('/?grave=meta');
    await waitForApp(page);
    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('/grave/nonexistent does not 500', async ({ page }) => {
    const res = await page.goto('/grave/nonexistent-id');
    expect(res?.status()).toBeLessThan(500);
  });
});

test.describe('Deep links (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('?grave=meta loads and animates', async ({ page }) => {
    await page.goto('/?grave=meta');
    await waitForApp(page);
    await page.waitForTimeout(5000);
    await expect(page.locator('canvas').first()).toBeVisible();
  });
});
