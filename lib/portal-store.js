import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const fields = ['description', 'searchUrl', 'queryParam', 'result', 'link', 'title', 'snippet', 'login', 'challenge', 'empty'];
export const schemaProperties = Object.fromEntries(fields.map(key => [key, { type: 'string', minLength: 1, maxLength: 2048 }]));
export const requiredFields = ['description', 'searchUrl', 'queryParam', 'result', 'link', 'title'];

export function validateSchema(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a portal schema');
  for (const key of requiredFields) if (!value[key]) throw new Error('Missing portal field: ' + key);
  for (const [key, field] of Object.entries(value)) {
    if (!fields.includes(key) || typeof field !== 'string' || !field.trim() || field.length > 2048) throw new Error('Invalid portal field: ' + key);
  }
  const url = new URL(value.searchUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Expected an HTTPS search address without credentials or fragment');
  return value;
}

export function portalStore(root = join(homedir(), '.kvant', 'search-portals')) {
  function filename(source) {
    if (!/^[a-z][a-z0-9-]{0,47}$/.test(source) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(source)) throw new Error('Invalid portal name');
    return join(root, source + '.json');
  }
  async function get(source) {
    return validateSchema(JSON.parse(await readFile(filename(source), 'utf8')));
  }
  return {
    get,
    async list() {
      let names;
      try { names = await readdir(root); }
      catch (error) { if (error.code === 'ENOENT') return []; throw error; }
      return Promise.all(names.filter(name => name.endsWith('.json')).sort().map(async name => {
        const source = name.slice(0, -5);
        return { source, description: (await get(source)).description };
      }));
    },
    async save(source, schema) {
      const target = filename(source);
      validateSchema(schema);
      await mkdir(root, { recursive: true, mode: 0o700 });
      const temporary = join(root, randomUUID() + '.tmp');
      try {
        await writeFile(temporary, JSON.stringify(schema), { flag: 'wx', mode: 0o600 });
        await rename(temporary, target);
      } finally { await rm(temporary, { force: true }); }
    },
  };
}
