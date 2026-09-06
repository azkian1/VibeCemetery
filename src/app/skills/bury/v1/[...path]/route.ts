// Retired download URLs must fail, including when used by piped installers.
export async function GET() {
  return new Response(
    'This download is no longer available. Read https://vibecemetery.app/agent-instructions\n',
    {
      status: 410,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  )
}
