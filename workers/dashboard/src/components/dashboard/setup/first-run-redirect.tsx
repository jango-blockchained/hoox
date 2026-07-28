"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isSetupCompleted } from "./setup-progress";

/**
 * Auto-redirects first-time visitors to the setup wizard.
 *
 * On every dashboard page render (except the setup page itself), if the user
 * hasn't completed initial setup, replace the URL with `/dashboard/setup`.
 * The wizard marks itself complete via localStorage; subsequent renders skip
 * the redirect.
 */
export function FirstRunRedirect() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname?.startsWith("/dashboard/setup")) return;
    if (isSetupCompleted()) return;
    router.replace("/dashboard/setup");
  }, [pathname, router]);

  return null;
}
