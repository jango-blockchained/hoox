"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AmbientBackgroundProps {
  children: React.ReactNode;
}

export function AmbientBackground({ children }: AmbientBackgroundProps) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Grid background */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none grid-bg opacity-45"
      />

      {/* Noise overlay */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-50 opacity-[0.03]"
        style={{ mixBlendMode: "overlay" }}
      >
        <svg
          className="h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
          width="100%"
          height="100%"
        >
          <filter id="noise-dash">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.65"
              numOctaves="3"
              stitchTiles="stitch"
            />
          </filter>
          <rect
            width="100%"
            height="100%"
            filter="url(#noise-dash)"
            opacity="1"
          />
        </svg>
      </div>

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
