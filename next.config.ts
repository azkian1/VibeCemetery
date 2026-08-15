import type { NextConfig } from "next";

function browserRpcOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

export function createContentSecurityPolicy(
  nodeEnv = process.env.NODE_ENV,
  baseReadRpcUrl = process.env.NEXT_PUBLIC_BASE_READ_RPC_URL,
): string {
  const scriptSrc = ["script-src 'self' 'unsafe-inline'"];
  const connectSrc = ["connect-src 'self' *.supabase.co"];
  if (nodeEnv === 'development') {
    scriptSrc.push("'unsafe-eval'");
  }
  const readRpcOrigin = browserRpcOrigin(baseReadRpcUrl);
  if (readRpcOrigin) connectSrc.push(readRpcOrigin);

  return [
    "default-src 'self'",
    scriptSrc.join(' '),
    "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
    "font-src 'self' fonts.gstatic.com",
    "img-src 'self' data: blob: avatars.githubusercontent.com *.supabase.co",
    connectSrc.join(' '),
    "frame-src 'none'",
    "object-src 'none'",
  ].join('; ');
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['phaser'],
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingIncludes: {
    '/skills/bury/v1/\\[\\.\\.\\.path\\]': ['./SKILL/**/*'],
    '/agents/gitlawb/v1/\\[\\.\\.\\.path\\]': [
      './SKILL/skills/gitlawb/**/*',
      './SKILL/agent-install/install-gitlawb.sh',
      './SKILL/agent-install/install-gitlawb.ps1',
      './SKILL/agent-install/install-gitlawb-runner.mjs',
    ],
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=()',
        },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains',
        },
        {
          key: 'Content-Security-Policy',
          value: createContentSecurityPolicy(),
        },
      ],
    },
  ],
};

export default nextConfig;
