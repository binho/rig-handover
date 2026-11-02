import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { countStatuses } from './digest/read.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type NightSummary = {
  night: string;
  counts: { ok: number; retry: number; fail: number } | null;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((n) => ({
      night: n,
      counts: countStatuses(config.runsDir, n),
    })),
  };
}
