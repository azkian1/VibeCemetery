import { expect, test } from '@playwright/test';
import { compareDecimal, isWalletAddress, safeProofUrl, UNAVAILABLE_REKT, usd } from '../src/components/rekt/contracts';
import { REKT_EPITAPHS, REKT_REASONS } from '../src/gravedigger/rekt';

test('REKT display preserves large decimal values and rounds only for display', () => {
  expect(usd('9007199254740993.995')).toBe('$9,007,199,254,740,994.00');
  expect(usd('249.999')).toBe('$250.00');
  expect(compareDecimal('249.999', '250')).toBeLessThan(0);
  expect(compareDecimal('9007199254740993.01', '9007199254740993.001')).toBeGreaterThan(0);
  expect(usd('NaN')).toBe('Unavailable');
});
test('REKT entry rejects malformed addresses and dangerous proof links', () => {
  expect(isWalletAddress(`0x${'a'.repeat(40)}`)).toBe(true);
  expect(isWalletAddress(`0x${'g'.repeat(40)}`)).toBe(false);
  expect(safeProofUrl('javascript:alert(1)')).toBeUndefined();
  expect(safeProofUrl('https://user:password@example.com')).toBeUndefined();
  expect(safeProofUrl('https://example.com/tx/1')).toBe('https://example.com/tx/1');
});
test('UI rollout is closed until real services are integrated', () => {
  expect(UNAVAILABLE_REKT.networks.every(n => !n.available)).toBe(true);
  expect(UNAVAILABLE_REKT.verificationAvailable).toBe(false);
  expect(UNAVAILABLE_REKT.creationAvailable).toBe(false);
  expect(new Set(REKT_REASONS.map(([id]) => id)).size).toBe(10);
  expect(REKT_EPITAPHS.length).toBeGreaterThanOrEqual(15);
});
