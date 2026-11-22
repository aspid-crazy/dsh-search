import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { portalStore } from '../lib/portal-store.js';

test('a saved source survives reopening, a failed edit preserves the previous schema', async t => {
  const root = await mkdtemp(join(tmpdir(), 'kvant-portals-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const schema = { description: 'Documentation', searchUrl: 'https://portal.example/search', queryParam: 'q', result: 'article', link: 'a', title: 'h2' };
  await portalStore(root).save('docs', schema);
  const reopened = portalStore(root);
  assert.deepEqual(await reopened.list(), [{ source: 'docs', description: 'Documentation' }]);
  await assert.rejects(reopened.save('docs', { ...schema, script: 'invalid' }));
  assert.deepEqual(await reopened.get('docs'), schema);
  const changed = { ...schema, title: 'h3' };
  await reopened.save('docs', changed);
  assert.deepEqual(await portalStore(root).get('docs'), changed);
  for (const name of ['../docs', undefined, 'con']) await assert.rejects(reopened.save(name, schema));
});
