import { UNAVAILABLE_REKT } from '@/components/rekt/contracts';

export function GET() {
  // Do not enable a network based on RPC presence or the research CLI alone.
  return Response.json(UNAVAILABLE_REKT, { headers: { 'Cache-Control': 'no-store' } });
}
