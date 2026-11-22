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

export function portalSearchUrl(source, query) {
  const url = new URL(source.searchUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Expected an HTTPS search URL');
  if (!source.queryParam || !query.trim()) throw new Error('Expected a query parameter and search text');
  url.searchParams.set(source.queryParam, query.trim());
  return url.href;
}
