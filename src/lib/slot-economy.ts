export const SOUL_SLOT_THRESHOLDS = [30, 100] as const;
export const NORMAL_SLOT_MAX = 4;
export const AUTO_ASSIGNABLE_GRAVE_SLOT_TYPES = ['grave', 'grave_tall'] as const;

const AUTO_ASSIGNABLE_GRAVE_SLOT_TYPE_SET = new Set<string>(AUTO_ASSIGNABLE_GRAVE_SLOT_TYPES);

export type CremationSource = 'github' | 'skill';

export interface CremationForSouls {
  source: CremationSource;
}

export interface UserSlotEconomyInput {
  souls: number;
  slotsUsed: number;
  hasSharedFirstGrave: boolean;
}

export interface UserSlotEconomy {
  souls: number;
  slotsUsed: number;
  slotsUnlocked: number;
  availableSlots: number;
  nextSoulThreshold: number | null;
  allSlotsMaxed: boolean;
  canCreateGrave: boolean;
}

export interface SlotUnlockProgress {
  socialLabel: string;
  unlockedSoulLabels: string[];
  nextSoulLabel: string | null;
}

export function calculateSouls(cremations: CremationForSouls[]): number {
  return cremations.reduce((total, cremation) => {
    if (cremation.source === 'github') {
      return total + 3;
    }

    if (cremation.source === 'skill') {
      return total + 1;
    }

    return total;
  }, 0);
}

export function isAutoAssignableGraveSlotType(type: string): boolean {
  return AUTO_ASSIGNABLE_GRAVE_SLOT_TYPE_SET.has(type);
}

export function calculateUserSlotEconomy({
  souls,
  slotsUsed,
  hasSharedFirstGrave,
}: UserSlotEconomyInput): UserSlotEconomy {
  const soulSlots = SOUL_SLOT_THRESHOLDS.filter((threshold) => souls >= threshold).length;
  const socialSlot = hasSharedFirstGrave ? 1 : 0;
  const slotsUnlocked = Math.min(NORMAL_SLOT_MAX, 1 + socialSlot + soulSlots);
  const availableSlots = Math.max(0, slotsUnlocked - slotsUsed);
  const nextSoulThreshold = SOUL_SLOT_THRESHOLDS[soulSlots] ?? null;

  return {
    souls,
    slotsUsed,
    slotsUnlocked,
    availableSlots,
    nextSoulThreshold,
    allSlotsMaxed: slotsUnlocked >= NORMAL_SLOT_MAX,
    canCreateGrave: availableSlots > 0,
  };
}

export function getSlotUnlockProgress({
  souls,
  hasSharedFirstGrave,
}: Pick<UserSlotEconomyInput, 'souls' | 'hasSharedFirstGrave'>): SlotUnlockProgress {
  const unlockedSoulLabels = SOUL_SLOT_THRESHOLDS
    .map((threshold, index) => ({ threshold, index }))
    .filter(({ threshold }) => souls >= threshold)
    .map(({ threshold, index }) => `Souls slot ${index + 1} unlocked (${threshold} Souls)`);
  const nextSoulIndex = SOUL_SLOT_THRESHOLDS.findIndex((threshold) => souls < threshold);

  return {
    socialLabel: hasSharedFirstGrave ? 'Social slot unlocked' : 'Social slot coming soon',
    unlockedSoulLabels,
    nextSoulLabel: nextSoulIndex === -1
      ? null
      : `Souls slot ${nextSoulIndex + 1}: ${SOUL_SLOT_THRESHOLDS[nextSoulIndex]} Souls`,
  };
}
