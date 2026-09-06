import { redirect } from 'next/navigation';
import HomeScannerLanding from '@/components/HomeScannerLanding';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();

  for (const key of ['grave', 'modal']) {
    const value = params[key];
    if (typeof value === 'string') query.set(key, value);
  }

  if (query.has('grave') || query.get('modal') === 'bury') {
    redirect(`/cemetery?${query.toString()}`);
  }

  return <HomeScannerLanding />;
}
