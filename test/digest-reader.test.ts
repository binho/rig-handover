import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { countStatuses, readNight } from '../src/digest/read.js';

const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('reads 5 jobs sorted by job and counts the bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.skipped).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('keeps the last error after a later ok', () => {
    expect(row('fixtures/refresh')).toMatchObject({ runs: 1, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(row('lane/sync')).toMatchObject({ runs: 7, retries: 1, lastError: 'lock held' });
  });

  it('keeps fails and null owners', () => {
    expect(row('notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(row('digest/render')?.owner).toBeNull();
    expect(row('rig/rotate-logs')?.lastError).toBeNull();
  });

  it('keeps the offset in first and last', () => {
    expect(row('lane/sync')?.first).toBe('2026-10-28T23:00:06+01:00');
    expect(row('lane/sync')?.last).toBe('2026-10-29T05:00:04+01:00');
  });
});

describe('readNight edge cases', () => {
  it('returns null when the night has no file', () => {
    expect(readNight(tmp, '2026-01-01')).toBeNull();
    expect(readNight(tmp, 'bad\0night')).toBeNull();
  });

  it('reads an empty file as no rows', () => {
    writeFileSync(join(tmp, 'empty.jsonl'), '');
    expect(readNight(tmp, 'empty')).toEqual({ night: 'empty', rows: [], skipped: 0 });
  });

  it('skips a line with a bad status, ignores blank lines, treats a missing owner as null', () => {
    writeFileSync(
      join(tmp, 'bad.jsonl'),
      [
        '{"at":"2026-10-30T01:00:00+01:00","job":"a/job","status":"ok"}',
        '',
        '   ',
        '{"at":"2026-10-30T02:00:00+01:00","job":"a/job","status":"weird","owner":"rook"}',
        '{"at":"2026-10-30T03:00:00+01:00","job":"","status":"ok","owner":"rook"}',
        '[]',
        '',
      ].join('\n'),
    );
    const night = readNight(tmp, 'bad');
    expect(night?.skipped).toBe(3);
    expect(night?.rows).toEqual([
      {
        job: 'a/job',
        owner: null,
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        first: '2026-10-30T01:00:00+01:00',
        last: '2026-10-30T01:00:00+01:00',
      },
    ]);
    expect(countStatuses(tmp, 'bad')).toEqual({ ok: 1, retry: 0, fail: 0 });
  });

  it('sorts by plain string order', () => {
    writeFileSync(
      join(tmp, 'order.jsonl'),
      ['b', 'B', 'a', 'A'].map((job) => JSON.stringify({ at: 't', job, status: 'ok', owner: null })).join('\n'),
    );
    expect(readNight(tmp, 'order')?.rows.map((r) => r.job)).toEqual(['A', 'B', 'a', 'b']);
  });
});

describe('countStatuses', () => {
  it('counts valid lines for 2026-10-28', () => {
    expect(countStatuses('runs', '2026-10-28')).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('returns null when the night has no file', () => {
    expect(countStatuses(tmp, '2026-01-01')).toBeNull();
  });
});
