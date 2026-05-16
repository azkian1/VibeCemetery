import { buildGraveOpenGraphResponse } from '../opengraph-image'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  return buildGraveOpenGraphResponse(id, 'classic')
}
