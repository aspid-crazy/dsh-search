/** Runs in the portal document. Schema values are selectors, never scripts. */
export function extractPortalResults(schema) {
  const text = (node) => node?.textContent?.trim() ?? '';
  const present = (selector) => Boolean(selector && document.querySelector(selector));
  if (present(schema.login)) return { status: 'login_required', sources: [] };
  if (present(schema.challenge)) return { status: 'interaction_required', sources: [] };
  const sources = [];
  for (const row of document.querySelectorAll(schema.result)) {
    const link = row.querySelector(schema.link);
    const title = text(row.querySelector(schema.title));
    if (!title || !link?.href || !/^https?:\/\//i.test(link.href)) continue;
    sources.push({ title, url: link.href, snippet: schema.snippet ? text(row.querySelector(schema.snippet)) : '' });
  }
  const status = sources.length ? 'ok' : present(schema.empty) ? 'empty' : 'unrecognized_page';
  return { status, sources };
}

export function portalAddress(address) {
  const url = new URL(address);
  const loopback = url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !loopback) || url.username || url.password || url.hash) {
    throw new Error('Portal requires HTTPS or a loopback HTTP address without credentials or fragment');
  }
  return url;
}

export function portalSearchUrl(source, query) {
  const url = portalAddress(source.searchUrl);
  if (!source.queryParam || !query.trim()) throw new Error('Expected a query parameter and search text');
  url.searchParams.set(source.queryParam, query.trim());
  return url.href;
}
