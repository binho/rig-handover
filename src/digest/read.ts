import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

// One run-log line after parsing at the edge.
type LogLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

type Parsed = { lines: LogLine[]; skipped: number };

export type StatusCounts = { ok: number; retry: number; fail: number };

// Errors that mean "no log for this night" rather than a broken disk.
const NO_FILE = new Set(['ENOENT', 'ENOTDIR', 'EISDIR', 'ENAMETOOLONG', 'ERR_INVALID_ARG_VALUE', 'ERR_INVALID_ARG_TYPE']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStatus(value: unknown): value is RunStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

// null when the line is not a valid run-log entry.
function parseLine(raw: string): LogLine | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { at, job, status, owner, error } = value;
  if (typeof at !== 'string') return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  return { at, job, status, owner: owner ?? null, error: error ?? null };
}

function readText(runsDir: string, night: string): string | null {
  try {
    return readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    const code = isRecord(err) && typeof err.code === 'string' ? err.code : '';
    if (NO_FILE.has(code)) return null;
    throw err;
  }
}

// Reads and parses runs/<night>.jsonl; null when there is no file. Blank lines are ignored.
function parseNight(runsDir: string, night: string): Parsed | null {
  const text = readText(runsDir, night);
  if (text === null) return null;
  const lines: LogLine[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) skipped++;
    else lines.push(line);
  }
  return { lines, skipped };
}

export const readNight: ReadNight = (runsDir, night) => {
  const parsed = parseNight(runsDir, night);
  if (parsed === null) return null;
  const byJob = new Map<string, DigestRow>();
  for (const line of parsed.lines) {
    const row = byJob.get(line.job);
    if (row === undefined) {
      byJob.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: line.status === 'retry' ? 0 : 1,
        retries: line.status === 'retry' ? 1 : 0,
        lastStatus: line.status,
        lastError: line.error,
        first: line.at,
        last: line.at,
      });
      continue;
    }
    if (line.status === 'retry') row.retries++;
    else row.runs++;
    row.owner = line.owner;
    row.lastStatus = line.status;
    if (line.error !== null) row.lastError = line.error;
    row.last = line.at;
  }
  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, skipped: parsed.skipped };
};

// Per valid log line: how many were ok / retry / fail. Skipped lines are not counted.
export function countStatuses(runsDir: string, night: string): StatusCounts | null {
  const parsed = parseNight(runsDir, night);
  if (parsed === null) return null;
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  for (const line of parsed.lines) counts[line.status]++;
  return counts;
}
