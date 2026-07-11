import type { Metadata, Viewport } from "next";
import { getSiteUrl } from '@/lib/site';
import AppProviders from '@/components/AppProviders';
import "./globals.css";

const siteUrl = getSiteUrl();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "VibeCemetery",
  description: "A cemetery for abandoned vibe-coded projects",
  icons: {
    icon: "/icon.png",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "VibeCemetery",
    description: "A cemetery for abandoned vibe-coded projects",
    url: siteUrl,
    images: [{ url: "/og-brand-v2.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "VibeCemetery",
    description: "A cemetery for abandoned vibe-coded projects",
    images: ["/og-brand-v2.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "VibeCemetery",
              "description": "Interactive pixel-art cemetery for dead vibe-coded projects. Bury your abandoned GitHub repos with a proper funeral.",
              "url": siteUrl,
              "applicationCategory": "Game",
              "operatingSystem": "Web",
            }),
          }}
        />
      </head>
      <body className="antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
