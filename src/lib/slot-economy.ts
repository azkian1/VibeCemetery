export const NORMAL_SLOT_MAX = 4;
export const AUTO_ASSIGNABLE_GRAVE_SLOT_TYPES = ['grave', 'grave_tall'] as const;
export const AUTO_ASSIGNABLE_GRAVE_SLOT_TYPES_V2 = ['grave_tall'] as const;

const AUTO_ASSIGNABLE_GRAVE_SLOT_TYPE_SET = new Set<string>(AUTO_ASSIGNABLE_GRAVE_SLOT_TYPES);
const AUTO_ASSIGNABLE_GRAVE_SLOT_TYPE_SET_V2 = new Set<string>(AUTO_ASSIGNABLE_GRAVE_SLOT_TYPES_V2);

export interface UserSlotEconomyInput {
  slotsUsed: number;
  hasSharedFirstGrave: boolean;
}

export interface UserSlotEconomy {
  slotsUsed: number;
  slotsUnlocked: number;
  availableSlots: number;
  allSlotsMaxed: boolean;
  canCreateGrave: boolean;
}

export interface SlotUnlockProgress {
  socialLabel: string;
}

export function isAutoAssignableGraveSlotType(type: string): boolean {
  return AUTO_ASSIGNABLE_GRAVE_SLOT_TYPE_SET.has(type);
}

export function isAutoAssignableGraveSlotTypeV2(type: string): boolean {
  return AUTO_ASSIGNABLE_GRAVE_SLOT_TYPE_SET_V2.has(type);
}

export function calculateUserSlotEconomy({
  slotsUsed,
  hasSharedFirstGrave,
}: UserSlotEconomyInput): UserSlotEconomy {
  const socialSlot = hasSharedFirstGrave ? 1 : 0;
  const normalSlotsUnlocked = NORMAL_SLOT_MAX + socialSlot;
  const slotsUnlocked = normalSlotsUnlocked;
  const availableSlots = Math.max(0, slotsUnlocked - slotsUsed);

  return {
    slotsUsed,
    slotsUnlocked,
    availableSlots,
    allSlotsMaxed: true,
    canCreateGrave: availableSlots > 0,
  };
}

export function getSlotUnlockProgress({
  hasSharedFirstGrave,
}: Pick<UserSlotEconomyInput, 'hasSharedFirstGrave'>): SlotUnlockProgress {
  return {
    socialLabel: hasSharedFirstGrave ? 'Shared your Grave: +1 Slot' : 'Share your Grave for +1 Slot',
  };
}
