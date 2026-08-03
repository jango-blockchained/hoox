/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { FULL_LEGAL_NOTICE } from "@hoox-sh/hoox-shared/legal";

export function Footer() {
  return (
    <footer
      className="mt-auto border-t border-border/50 bg-sidebar/40 px-4 py-4 text-xs text-muted-foreground sm:px-6"
      role="contentinfo"
    >
      <div className="mx-auto max-w-7xl">
        <p className="whitespace-pre-line leading-relaxed text-balance">
          {FULL_LEGAL_NOTICE}
        </p>
      </div>
    </footer>
  );
}
