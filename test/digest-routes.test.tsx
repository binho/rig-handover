import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// Fixtures live in a temp runs dir; runs/ is read-only and never touched here.
let runsDir: string;
let previousMarker: string | undefined;

const config = () => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
});

const LANE_MARKER = 'DIGEST-TEST-MARKER';

// Pulls the job names out of the page's table cells, in document order.
// Job names are the only cells shaped like "<group>/<name>"; owners, times and errors are not.
function jobsFromHtml(html: string): string[] {
  const cells = [...html.matchAll(/<td[^>]*>\s*([^<]+?)\s*<\/td>/g)].map((m) => m[1]);
  return cells.filter((cell) => /^[\w.-]+\/[\w.-]+$/.test(cell));
}

beforeAll(() => {
  runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-runs-'));

  // Two jobs, out of order in the file (b/job first), a retry, a null owner, and one bad line.
  fs.writeFileSync(
    path.join(runsDir, '2026-11-01.jsonl'),
    [
      JSON.stringify({ at: '2026-11-01T01:00:00+01:00', job: 'b/job', status: 'ok', owner: 'rook' }),
      JSON.stringify({ at: '2026-11-01T01:05:00+01:00', job: 'a/job', status: 'retry', owner: null, error: 'boom' }),
      JSON.stringify({ at: '2026-11-01T01:10:00+01:00', job: 'a/job', status: 'ok', owner: null }),
      '{"at":"x","job":"a/jo',
      '',
    ].join('\n'),
  );

  // Empty night: the file exists but nothing ran.
  fs.writeFileSync(path.join(runsDir, '2026-11-02.jsonl'), '');

  previousMarker = process.env.LANE_MARKER;
  process.env.LANE_MARKER = LANE_MARKER;
});

afterAll(() => {
  if (previousMarker === undefined) delete process.env.LANE_MARKER;
  else process.env.LANE_MARKER = previousMarker;
  fs.rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('answers 200 with an HTML page carrying the lane banner', async () => {
    const res = await createApp(config()).request('/digest/2026-11-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html).toContain(LANE_MARKER);
  });

  it('renders one table row per job, with a null owner as an em dash and the bad line counted', async () => {
    const res = await createApp(config()).request('/digest/2026-11-01');
    const html = await res.text();
    expect(html).toContain('a/job');
    expect(html).toContain('b/job');
    expect(html).toContain('—');
    expect(html).toContain('1 line skipped');
  });

  it('lists the jobs in the same order as the JSON', async () => {
    const app = createApp(config());
    const html = await (await app.request('/digest/2026-11-01')).text();
    const json = (await (await app.request('/api/digest/2026-11-01')).json()) as Night;
    expect(jobsFromHtml(html)).toEqual(json.rows.map((row) => row.job));
    expect(jobsFromHtml(html)).toEqual(['a/job', 'b/job']);
  });

  it('says "nothing ran" for an empty night file', async () => {
    const res = await createApp(config()).request('/digest/2026-11-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await createApp(config()).request('/digest/2026-11-03');
    expect(res.status).toBe(404);
  });

  it.each(['latest', '2026-10-2', '..%2Fpackage'])('answers 404 for a malformed night %s', async (night) => {
    const res = await createApp(config()).request(`/digest/${night}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/digest/:night', () => {
  it('answers 200 with { night, rows, skipped }, rows sorted by job', async () => {
    const res = await createApp(config()).request('/api/digest/2026-11-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.night).toBe('2026-11-01');
    expect(body.skipped).toBe(1);
    expect(body.rows.map((row) => row.job)).toEqual(['a/job', 'b/job']);
  });

  it('reports a/job with its runs, retries, last error and null owner', async () => {
    const body = (await (await createApp(config()).request('/api/digest/2026-11-01')).json()) as Night;
    const aJob = body.rows.find((row) => row.job === 'a/job');
    expect(aJob).toMatchObject({
      job: 'a/job',
      owner: null,
      runs: 1,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'boom',
      first: '2026-11-01T01:05:00+01:00',
      last: '2026-11-01T01:10:00+01:00',
    });
  });

  it('reports b/job with its owner and no retries', async () => {
    const body = (await (await createApp(config()).request('/api/digest/2026-11-01')).json()) as Night;
    const bJob = body.rows.find((row) => row.job === 'b/job');
    expect(bJob).toMatchObject({ job: 'b/job', owner: 'rook', runs: 1, retries: 0, lastStatus: 'ok', lastError: null });
  });

  it('answers 200 with no rows and no skipped lines for an empty night', async () => {
    const res = await createApp(config()).request('/api/digest/2026-11-02');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-11-02', rows: [], skipped: 0 });
  });

  it('answers 404 for a night with no file', async () => {
    const res = await createApp(config()).request('/api/digest/2026-11-03');
    expect(res.status).toBe(404);
  });

  it.each(['latest', '2026-10-2', '..%2Fpackage'])('answers 404 for a malformed night %s', async (night) => {
    const res = await createApp(config()).request(`/api/digest/${night}`);
    expect(res.status).toBe(404);
  });
});
