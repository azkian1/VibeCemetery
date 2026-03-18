import { redirect } from 'next/navigation';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /grave/[id] → redirect to home with ?grave=id to navigate camera to the grave
export default async function GravePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    redirect('/');
  }
  redirect(`/?grave=${id}`);
}
