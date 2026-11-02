import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestPage } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/api/digest/:night', (c) => {
    const date = c.req.param('night');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ error: 'not found' }, 404);
    }
    const night = readNight(config.runsDir, date);
    if (night === null) {
      return c.json({ error: 'not found' }, 404);
    }
    return c.json(night);
  });

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return c.notFound();
    const digest = readNight(config.runsDir, night);
    if (digest === null) return c.notFound();
    return c.html(
      <Layout title={`digest · ${night}`} lane={lane()}>
        <DigestPage night={digest} />
      </Layout>,
    );
  });

  return app;
}
