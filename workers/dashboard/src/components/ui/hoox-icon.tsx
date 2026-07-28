/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Reicon from "reicon-react";
import { cn } from "@/lib/utils";

export const hooxIcons = {
  // Core navigation
  overview: Reicon.Monitor,
  positions: Reicon.Chart,
  signalFlow: Reicon.BranchUp,
  analytics: Reicon.Activity,
  logs: Reicon.DocText,
  signals: Reicon.Radio,
  notifications: Reicon.Bell,
  reports: Reicon.File,
  database: Reicon.Database,
  agent: Reicon.Cpu,
  settings: Reicon.Setting2,
  setup: Reicon.Setting2,
  help: Reicon.Help,
  search: Reicon.Search,

  // Trading & finance specific
  bitcoin: Reicon.Bitcoin,
  wallet: Reicon.Wallet,
  target: Reicon.Bullseye,
  rocket: Reicon.Rocket,
  trendUp: Reicon.TrendUp,
  trendDown: Reicon.TrendDown,
  shield: Reicon.Shield,
  lock: Reicon.Lock,
  bolt: Reicon.Bolt,
  chart: Reicon.Chart,
  chartBar: Reicon.ChartBar,
  bank: Reicon.Bank,
  coin: Reicon.Coin2,
  crypto: Reicon.BitcoinCircle,

  // Status & actions
  alert: Reicon.Alert,
  check: Reicon.Check,
  plus: Reicon.Plus,
  refresh: Reicon.Refresh,
  play: Reicon.Play,
  pause: Reicon.Pause,
  eye: Reicon.Eye,
  zap: Reicon.Bolt,
  pulse: Reicon.Pulse,
  activity: Reicon.Activity,

  // Misc
  user: Reicon.User,
  key: Reicon.Key,
  cloud: Reicon.Cloud,
  network: (Reicon.CloudConnect ?? Reicon.Cloud) as typeof Reicon.Globe2,
  globe: Reicon.Globe2,
  file: Reicon.File,
  doc: Reicon.DocText,
  inbox: Reicon.Bell,
  download: Reicon.Refresh,
} as const;

export type HooxIconName = keyof typeof hooxIcons;

export interface HooxIconProps extends React.SVGProps<SVGSVGElement> {
  name: HooxIconName;
  size?: "xs" | "sm" | "md" | "lg" | number;
}

const sizeClasses: Record<string, string> = {
  xs: "size-3",
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

export function HooxIcon({
  name,
  size = "sm",
  className,
  ...props
}: HooxIconProps) {
  const IconComp = hooxIcons[name];
  if (!IconComp) {
    console.warn(`HooxIcon: unknown icon "${name}"`);
    return null;
  }
  const sizeClass =
    typeof size === "number"
      ? `size-${size}`
      : (sizeClasses[size] ?? sizeClasses.sm);
  return <IconComp className={cn(sizeClass, className)} {...props} />;
}

// Convenience re-exports for direct use when needed
export { hooxIcons as icons };
