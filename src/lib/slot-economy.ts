export const GITHUB_SLOT_MAX = 1;
export const LOCAL_SLOT_MAX = 1;
// Supported footprints; map-slots also enforces the approved active slot IDs.
export const AUTO_ASSIGNABLE_GRAVE_SLOT_TYPES_V2 = ['grave_tall', 'grave_wide', 'grave_large'] as const;

const AUTO_ASSIGNABLE_GRAVE_SLOT_TYPE_SET_V2 = new Set<string>(AUTO_ASSIGNABLE_GRAVE_SLOT_TYPES_V2);

export interface UserSlotEconomyInput {
  githubSlotsUsed: number;
  localSlotsUsed: number;
}

export interface UserSlotEconomy {
  slotsUsed: number;
  slotsUnlocked: number;
  availableSlots: number;
  allSlotsMaxed: boolean;
  canCreateGrave: boolean;
  githubSlotsUsed: number;
  localSlotsUsed: number;
  githubAvailableSlots: number;
  localAvailableSlots: number;
  canCreateGithubGrave: boolean;
  canCreateLocalGrave: boolean;
}

export function isAutoAssignableGraveSlotTypeV2(type: string): boolean {
  return AUTO_ASSIGNABLE_GRAVE_SLOT_TYPE_SET_V2.has(type);
}

export function calculateUserSlotEconomy({
  githubSlotsUsed,
  localSlotsUsed,
}: UserSlotEconomyInput): UserSlotEconomy {
  const slotsUsed = githubSlotsUsed + localSlotsUsed;
  const slotsUnlocked = GITHUB_SLOT_MAX + LOCAL_SLOT_MAX;
  const githubAvailableSlots = Math.max(0, GITHUB_SLOT_MAX - githubSlotsUsed);
  const localAvailableSlots = Math.max(0, LOCAL_SLOT_MAX - localSlotsUsed);
  const availableSlots = githubAvailableSlots + localAvailableSlots;

  return {
    slotsUsed,
    slotsUnlocked,
    availableSlots,
    allSlotsMaxed: availableSlots === 0,
    canCreateGrave: availableSlots > 0,
    githubSlotsUsed,
    localSlotsUsed,
    githubAvailableSlots,
    localAvailableSlots,
    canCreateGithubGrave: githubAvailableSlots > 0,
    canCreateLocalGrave: localAvailableSlots > 0,
  };
}
