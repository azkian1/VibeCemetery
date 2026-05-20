import type { NextConfig } from "next";

export function createContentSecurityPolicy(nodeEnv = process.env.NODE_ENV): string {
  const scriptSrc = ["script-src 'self' 'unsafe-inline'"];
  if (nodeEnv === 'development') {
    scriptSrc.push("'unsafe-eval'");
  }

  return [
    "default-src 'self'",
    scriptSrc.join(' '),
    "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
    "font-src 'self' fonts.gstatic.com",
    "img-src 'self' data: blob: avatars.githubusercontent.com *.supabase.co",
    "connect-src 'self' *.supabase.co",
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
