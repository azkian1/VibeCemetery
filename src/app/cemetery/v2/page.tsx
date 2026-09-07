import { permanentRedirect } from 'next/navigation';
import { canonicalCemeteryPath } from '@/lib/cemetery-navigation';

export const dynamic = 'force-dynamic';

export default async function CemeteryV2Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  permanentRedirect(canonicalCemeteryPath(await searchParams));
}
