import { notFound } from 'next/navigation';
import RektPreview from '@/components/rekt/RektPreview';

export const dynamic = 'force-dynamic';
export default async function RektPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV !== 'development' && process.env.PLAYWRIGHT_E2E !== '1') notFound();
  const query = await searchParams;
  return <RektPreview key={`${query.scenario}:${query.view}`} scenario={typeof query.scenario === 'string' ? query.scenario : undefined} initialView={typeof query.view === 'string' ? query.view : undefined} />;
}
