import type { GraveData } from '@/types/game';

export function filterGravesByAuthor(graves: GraveData[], authorFilter?: string): GraveData[] {
  if (!authorFilter) return graves;

  const normalizedAuthor = authorFilter.toLowerCase();
  return graves.filter((grave) => (grave.author_github || 'anonymous').toLowerCase() === normalizedAuthor);
}
