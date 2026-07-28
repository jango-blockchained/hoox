/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { FULL_LEGAL_NOTICE } from "@jango-blockchained/hoox-shared/legal";

export function Footer() {
  return (
    <footer className="border-t border-border/40 px-6 py-4 text-xs text-muted-foreground">
      <div className="mx-auto max-w-7xl">
        <p className="whitespace-pre-line leading-relaxed">
          {FULL_LEGAL_NOTICE}
        </p>
      </div>
    </footer>
  );
}
