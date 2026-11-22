import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchBrowser, navigateAndSettle, browserFetch } from '../lib/driver.js';
import { portalStore } from '../lib/portal-store.js';

test('a dedicated portal profile survives login and stays isolated from a second source', async t => {
  const root = await mkdtemp(join(tmpdir(), 'portal-session-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
  const server = createServer((req, res) => {
    const signedIn = req.headers.cookie === 'fixture=verified';
    if (req.url === '/signin') res.setHeader('set-cookie', 'fixture=verified; HttpOnly; Max-Age=90; Path=/; SameSite=Strict');
    res.setHeader('content-type', 'text/html');
    res.end('<article>' + (signedIn ? 'Subscribed article' : 'Sign in') + '</article>');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const origin = 'http://127.0.0.1:' + server.address().port;
  const store = portalStore(root);
  const userDataDir = store.profile('docs', origin);
  const login = await launchBrowser({ userDataDir });
  try { await navigateAndSettle(login.page, origin + '/signin'); }
  finally { await login.close(); }
  const url = origin + '/article';
  assert.match((await browserFetch({ url, userDataDir })).text, /Subscribed article/);
  assert.match((await browserFetch({ url, userDataDir: store.profile('other', origin) })).text, /Sign in/);
  assert.notEqual(store.profile('docs', 'https://elsewhere.example'), userDataDir);
});
