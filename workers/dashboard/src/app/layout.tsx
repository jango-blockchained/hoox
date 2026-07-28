/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { IBM_Plex_Sans, IBM_Plex_Mono, Bebas_Neue } from "next/font/google";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const dynamic = "force-dynamic";

const ibmPlexSans = IBM_Plex_Sans({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-sans",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
});

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
});

export const metadata: Metadata = {
  title: { default: "Hoox Dashboard", template: "%s | Hoox Dashboard" },
  description: "Hoox trading system dashboard",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${bebasNeue.variable} dark bg-background`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
