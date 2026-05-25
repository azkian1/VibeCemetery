import { redirect } from 'next/navigation';

// /urn/[id] → redirect to cemetery with ?urn=id to open the urn modal
export default async function UrnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // cremated IDs are numeric
  if (!/^\d+$/.test(id)) {
    redirect('/');
  }
  redirect(`/cemetery?urn=${id}`);
}
