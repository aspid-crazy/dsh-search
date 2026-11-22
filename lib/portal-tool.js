import { extractPortalResults, portalSearchUrl } from './portal.js';
import { launchBrowser, navigateAndSettle, evalValue } from './driver.js';
import { portalStore, requiredFields, schemaProperties, validateSchema } from './portal-store.js';

async function search(schema, query, config, signal) {
  const url = portalSearchUrl(schema, query);
  const session = await launchBrowser({ executable: config.browserPath ?? undefined, headless: config.headless, signal });
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
      return search(await get(source), query, config, exec?.signal);
    },
  });
  ctx.tools.register({
    name: 'portal_search_schema',
    description: 'List, read or save named portal schemas. Save requires a sample search that returns results before replacing a saved schema.',
    parameters: {
      type: 'object', required: ['action'], properties: {
        action: { type: 'string', enum: ['list', 'get', 'save'] }, source: sourceParam,
        sampleQuery: { type: 'string' },
        schema: { type: 'object', additionalProperties: false, required: requiredFields, properties: schemaProperties },
      },
    },
    async execute({ action, source, schema, sampleQuery }, exec) {
      if (action === 'list') return [...Object.entries(presets).map(([source, entry]) => ({ source, description: entry.description })), ...await store.list()];
      if (action === 'get') return get(source);
      if (action !== 'save' || Object.hasOwn(presets, source)) throw new Error('Expected a writable portal source');
      const verified = await search(validateSchema(schema), sampleQuery, config, exec?.signal);
      if (verified.status !== 'ok') return { saved: false, status: verified.status };
      await store.save(source, schema);
      return { saved: true, source, sample: verified.sources.slice(0, 3) };
    },
  });
}
