import { extractPortalResults, portalSearchUrl } from './portal.js';
import { launchBrowser, navigateAndSettle, evalValue } from './driver.js';
import { portalStore, requiredFields, schemaProperties, validateSchema } from './portal-store.js';

async function search(schema, query, config, signal, userDataDir) {
  const url = portalSearchUrl(schema, query);
  const session = await launchBrowser({ executable: config.browserPath ?? undefined, headless: config.headless, signal, userDataDir });
  try {
    const finalUrl = await navigateAndSettle(session.page, url, config.timeoutMs, signal);
    if (new URL(finalUrl).origin !== new URL(url).origin) return { status: 'redirected', sources: [] };
    const expression = '(' + extractPortalResults.toString() + ')(' + JSON.stringify(schema) + ')';
    return await evalValue(session.page, expression, signal);
  } finally {
    await session.close();
  }
}

export function registerPortalSearch(ctx, config) {
  const store = portalStore(config.portalDirectory);
  const presets = config.portals ?? {};
  const sourceParam = { type: 'string', pattern: '^[a-z][a-z0-9-]{0,47}$' };
  const get = source => Object.hasOwn(presets, source) ? validateSchema(presets[source]) : store.get(source);
  ctx.tools.register({
    name: 'portal_search',
    description: 'Search a named portal. Discover available sources with portal_search_schema list.',
    parameters: { type: 'object', properties: { source: sourceParam, query: { type: 'string' } }, required: ['source', 'query'] },
    async execute({ source, query }, exec) {
      const schema = await get(source);
      return search(schema, query, config, exec?.signal, store.profile(source, schema.searchUrl));
    },
  });
  ctx.tools.register({
    name: 'portal_search_schema',
    description: 'List, read or save named portal schemas. Save requires a sample search that returns results before replacing a saved schema.',
    parameters: {
      type: 'object', required: ['action'], properties: {
        action: { type: 'string', enum: ['list', 'get', 'save', 'login'] }, source: sourceParam,
        sampleQuery: { type: 'string' },
        schema: { type: 'object', additionalProperties: false, required: requiredFields, properties: schemaProperties },
      },
    },
    async execute({ action, source, schema, sampleQuery }, exec) {
      if (action === 'list') return [...Object.entries(presets).map(([source, entry]) => ({ source, description: entry.description })), ...await store.list()];
      if (action === 'get') return get(source);
      if (action === 'login') {
        const loginSchema = schema ? validateSchema(schema) : await get(source);
        const login = await launchBrowser({ executable: config.browserPath ?? undefined, headless: false, userDataDir: store.profile(source, loginSchema.searchUrl), signal: exec?.signal });
        try {
          const start = sampleQuery ? portalSearchUrl(loginSchema, sampleQuery) : loginSchema.searchUrl;
          await login.page.send('Page.navigate', { url: start });
          if (sampleQuery) {
            const origin = new URL(start).origin;
            const inspect = '(' + extractPortalResults.toString() + ')(' + JSON.stringify(loginSchema) + ').status';
            while (!login.page.closed) {
              exec?.signal?.throwIfAborted();
              const status = await evalValue(login.page, 'location.origin === ' + JSON.stringify(origin) + ' ? ' + inspect + ' : null', exec?.signal).catch(() => null);
              if (status === 'ok' || status === 'empty') return { source, status: 'ready' };
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }
          await login.exited;
          return { source, status: 'window_closed' };
        } finally { await login.close(); }
      }
      if (action !== 'save' || Object.hasOwn(presets, source)) throw new Error('Expected a writable portal source');
      const verified = await search(validateSchema(schema), sampleQuery, config, exec?.signal, store.profile(source, schema.searchUrl));
      if (verified.status !== 'ok') return { saved: false, status: verified.status };
      await store.save(source, schema);
      return { saved: true, source, sample: verified.sources.slice(0, 3) };
    },
  });
  return async (source, address) => {
    const schema = await get(source);
    if (new URL(schema.searchUrl).origin !== new URL(address).origin) throw new Error('Article origin differs from portal');
    return store.profile(source, address);
  };
}
