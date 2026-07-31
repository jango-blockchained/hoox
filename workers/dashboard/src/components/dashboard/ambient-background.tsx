"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface AmbientBackgroundProps {
  children: React.ReactNode;
  className?: string;
}

export function AmbientBackground({
  children,
  className,
}: AmbientBackgroundProps) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <div className={cn("relative min-h-svh", className)}>
      {/* Subtle grid — static, decorative */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 grid-bg opacity-40"
      />

      {/* Soft accent glows — disabled when reduced motion is preferred */}
      {!reduceMotion && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none fixed -left-32 top-0 size-[28rem] rounded-full bg-accent/5 blur-[100px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none fixed -right-24 bottom-0 size-[24rem] rounded-full bg-accent/[0.04] blur-[90px]"
          />
        </>
      )}

      {/* Film grain — static SVG filter, very low opacity */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none fixed inset-0 z-[1] opacity-[0.025]",
          reduceMotion && "hidden"
        )}
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

      <div className="relative z-10 flex min-h-svh flex-col">{children}</div>
    </div>
  );
}
