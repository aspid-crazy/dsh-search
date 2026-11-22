import { extractPortalResults, portalSearchUrl } from './portal.js';
import { launchBrowser, navigateAndSettle, evalValue } from './driver.js';

export function registerPortalSearch(ctx, config) {
  const portals = config.portals ?? {};
  const names = Object.keys(portals);
  if (!names.length) return;
  ctx.tools.register({
    name: 'portal_search',
    description: 'Search a configured portal and return titles, links and snippets.',
    parameters: {
      type: 'object',
      properties: { source: { type: 'string', enum: names }, query: { type: 'string' } },
      required: ['source', 'query'],
    },
    async execute({ source, query }, exec) {
      if (!Object.hasOwn(portals, source)) throw new Error('Unknown portal');
      const schema = portals[source];
      const url = portalSearchUrl(schema, query);
      const session = await launchBrowser({ executable: config.browserPath ?? undefined, headless: config.headless, signal: exec?.signal });
      try {
        const finalUrl = await navigateAndSettle(session.page, url, config.timeoutMs, exec?.signal);
        if (new URL(finalUrl).origin !== new URL(url).origin) return { status: 'redirected', sources: [] };
        const expression = '(' + extractPortalResults.toString() + ')(' + JSON.stringify(schema) + ')';
        return await evalValue(session.page, expression, exec?.signal);
      } finally {
        await session.close();
      }
    },
  });
}
