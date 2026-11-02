// One status per run-log line.
export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job for a night. Times are the log's strings, offset kept.
export type DigestRow = {
  job: string;
  owner: string | null; // null renders as —
  runs: number; // lines whose status is not 'retry'
  retries: number; // lines with status 'retry'
  lastStatus: RunStatus;
  lastError: string | null; // last error seen that night, even if a later line was ok
  first: string;
  last: string;
};

// A night's digest. skipped = lines that don't parse or lack a valid at/job/status (blank lines not counted).
export type Night = {
  night: string;
  rows: DigestRow[];
  skipped: number;
};

// Reads runs/<night>.jsonl; null when there is no file for that night.
export type ReadNight = (runsDir: string, night: string) => Night | null;
