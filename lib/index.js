import { randomUUID } from 'node:crypto';
/**
 * dsh-local-browser-search РІР‚вЂќ web search and page fetching powered by the
 * user's LOCAL browser (Edge/Chrome) over the Chrome DevTools Protocol.
 *
 * No API key, no cloud search provider, no bundled browser download: the
 * plugin drives the installed browser with Node built-ins only and registers
 * two model-facing tools:
 *   - `web_search`: organic results (title/url/snippet) for a query.
 *   - `web_fetch`: the text content of a URL, rendered via the browser.
 *
 * @module dsh-local-browser-search
 */
import { registerPortalSearch } from './portal-tool.js';
import { browserSearch, browserFetch, browserIllustration, findBrowserPath } from './driver.js';

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-local-browser-search';

/** Services required by the tool suite. */
export const inject = ['tools', 'systemPrompt'];

/** Defaults applied when a profile config omits a field. */
const DEFAULTS = {
  headless: true,
  engine: 'bing',
  maxResults: 8,
  timeoutMs: 30000,
};

// ---------------------------------------------------------------------------
// Model-facing surface
// ---------------------------------------------------------------------------
/** Render search sources as the same markdown list the built-in web_search uses. */
function formatSources(sources, engine, truncated) {
  const parts = [];
  if (!sources || sources.length === 0) {
    parts.push('No results found.');
  } else {
    const lines = sources.map((s, i) => {
      const label = s.title && s.title.length > 0 ? s.title : s.url;
      const snippet = s.snippet && s.snippet.length > 0 ? ` РІР‚вЂќ ${s.snippet}` : '';
      return `${i + 1}. [${label}](${s.url})${snippet}`;
    });
    parts.push(`Sources (${engine}):\n${lines.join('\n')}`);
  }
  if (truncated) parts.push('(Results truncated. Refine the query for more.)');
  parts.push('Cite the relevant URLs above as markdown links in your answer.');
  return parts.join('\n\n');
}

/**
 * Register the `web_search` tool and its system-prompt guidance.
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the registrations.
 * @param config - resolved profile config (headless / engine / maxResults / timeoutMs / browserPath).
 */
function applyBrowserSearchTool(ctx, config) {
  ctx.systemPrompt.section({
    name: 'tool:web_search',
    order: 112,
    text: 'Use the web_search tool to search the web by driving the LOCAL browser (Edge/Chrome). It returns organic result titles, URLs and snippets. It needs no API key and works even where public search APIs are unavailable. Cite the relevant URLs as markdown links in your answer.',
  });
  ctx.tools.register({
    name: 'web_search',
    description: 'Search the web using the local browser. Returns organic result titles, URLs and snippets for a query.',
    // Compiled JSON Schema (the form defineTool would produce): raw parameter
    // specs are passed through verbatim to the wire and rejected by providers.
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query.' },
        engine: {
          type: 'string',
          description: 'Search engine to use: bing, duckduckgo, google or yandex. Defaults to the configured engine (bing).',
        },
        maxResults: { type: 'integer', description: 'Maximum number of results to return (default 8).' },
      },
      required: ['query'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['query', 'engine', 'examinedUrl', 'sources', 'truncated'],
        properties: {
          query: { type: 'string' },
          engine: { type: 'string' },
          examinedUrl: { type: 'string' },
          sources: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'url'],
              properties: {
                title: { type: 'string' },
                url: { type: 'string' },
                snippet: { type: 'string' },
              },
            },
          },
          truncated: { type: 'boolean' },
        },
      },
      render: (_args, value) => [
        { type: 'text', text: formatSources(value.sources, value.engine, value.truncated) },
      ],
      presentationMeta: (_args, value) => ({
        sources: value.sources,
        truncated: value.truncated,
      }),
    },
    timeoutMs: config.timeoutMs,
    async execute(args, exec) {
      const query = String(args?.query ?? '').trim();
      if (query.length === 0) throw new Error('query must be a non-empty string');
      const engine = typeof args?.engine === 'string' && ['bing', 'duckduckgo', 'google', 'yandex'].includes(args.engine)
        ? args.engine
        : config.engine;
      const maxResults = Number.isInteger(args?.maxResults) && args.maxResults > 0
        ? Math.min(args.maxResults, 20)
        : config.maxResults;
      const out = await browserSearch({
        query,
        engine,
        maxResults,
        headless: config.headless,
        executable: findBrowserPath(config.browserPath),
        timeoutMs: config.timeoutMs,
        signal: exec?.signal,
      });
      return {
        query,
        engine: out.engine,
        examinedUrl: out.examinedUrl,
        sources: out.sources.map((s) => ({ title: s.title, url: s.url, snippet: s.snippet ?? '' })),
        truncated: out.sources.length > maxResults,
      };
    },
    presentCall: (args) => ({
      card: 'generic',
      title: String(args?.query ?? ''),
      kind: 'search',
      rawInput: String(args?.query ?? ''),
    }),
    presentResult: (args, result) => {
      if (result.isError) return undefined;
      const meta = result.meta;
      if (!meta || !Array.isArray(meta.sources)) return undefined;
      return {
        card: 'web',
        kind: 'search',
        title: String(args?.query ?? ''),
        sources: meta.sources,
        truncated: meta.truncated === true,
        ...(typeof meta.answer === 'string' ? { answer: meta.answer } : {}),
      };
    },
  });
}

/**
 * Register the `web_fetch` tool and its system-prompt guidance.
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the registrations.
 * @param config - resolved profile config.
 */
function applyBrowserFetchTool(ctx, config, profileForArticle, imageSink) {
  const articles = new Map();
  ctx.tools.register({
    name: 'web_fetch_image',
    description: 'Read one illustration by pageId and imageId from web_fetch.',
    parameters: { type: 'object', required: ['pageId', 'imageId'], properties: { pageId: { type: 'string' }, imageId: { type: 'string' } } },
    output: { schema: { type: 'object', properties: { attachment: { type: 'object' } }, required: ['attachment'] }, render: (_args, value) => [{ type: 'image', attachment: value.attachment }] },
    async execute({ pageId, imageId }, exec) {
      const article = articles.get(pageId);
      const image = article?.images.find(entry => entry.id === imageId);
      if (!image || article.session !== exec?.agent?.session) throw new Error('Unknown illustration in this session');
      const saveImage = await imageSink(exec);
      const { data, mediaType } = await browserIllustration({ articleUrl: article.url, imageUrl: image.url, userDataDir: article.userDataDir, executable: config.browserPath ?? undefined, signal: exec.signal, timeoutMs: config.timeoutMs });
      return saveImage(data, mediaType);
    },
  });
  ctx.systemPrompt.section({
    name: 'tool:web_fetch',
    order: 113,
    text: 'Use the web_fetch tool to open a specific HTTP(S) URL in the local browser and return the page text (rendered, like a human sees it). Cite the URL as a markdown link when you use its content.',
  });
  ctx.tools.register({
    name: 'web_fetch',
    description: 'Open a specific HTTP(S) URL in the local browser and return the rendered page text.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The HTTP(S) URL to open.' },
        source: { type: 'string', description: 'Optional named portal whose session owns this article.' },
        maxChars: { type: 'integer', description: 'Maximum characters of text to return (default 120000).' },
      },
      required: ['url'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['url', 'finalUrl', 'text', 'truncated'],
        properties: {
          url: { type: 'string' },
          pageId: { type: 'string' },
          finalUrl: { type: 'string' },
          title: { type: 'string' },
          text: { type: 'string' },
          truncated: { type: 'boolean' },
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          text: 'Page ID: ' + value.pageId + '\n' + (value.title && value.title.length > 0
            ? `Title: ${value.title}\nFetched ${value.finalUrl}\n\n${value.text}${value.truncated ? '\n\n(Content truncated.)' : ''}`
            : `Fetched ${value.finalUrl}\n\n${value.text}${value.truncated ? '\n\n(Content truncated.)' : ''}`),
        },
      ],
      presentationMeta: (_args, value) => ({
        url: value.finalUrl,
        truncated: value.truncated,
      }),
    },
    timeoutMs: config.timeoutMs,
    async execute(args, exec) {
      const url = String(args?.url ?? '').trim();
      const maxChars = Number.isInteger(args?.maxChars) && args.maxChars > 0 ? args.maxChars : 120000;
      const userDataDir = args?.source ? await profileForArticle(args.source, url) : undefined;
      const out = await browserFetch({
        userDataDir,
        url,
        maxChars,
        headless: config.headless,
        executable: findBrowserPath(config.browserPath),
        timeoutMs: config.timeoutMs,
        signal: exec?.signal,
      });
      const pageId = randomUUID();
      if (articles.size >= 128) articles.delete(articles.keys().next().value);
      articles.set(pageId, { url: out.finalUrl, userDataDir, images: out.images, session: exec?.agent?.session });
      return { pageId, url, finalUrl: out.finalUrl, title: out.title, text: out.text, truncated: out.truncated };
    },
    presentCall: (args) => ({
      card: 'generic',
      title: String(args?.url ?? ''),
      kind: 'fetch',
      rawInput: String(args?.url ?? ''),
    }),
    presentResult: (args, result) => {
      if (result.isError) return undefined;
      const meta = result.meta;
      if (!meta || typeof meta.url !== 'string') return undefined;
      return { card: 'web', kind: 'fetch', title: String(args?.url ?? ''), url: meta.url, truncated: meta.truncated === true };
    },
  });
}

/**
 * Plugin entry: register the browser-backed search fetch tools.
 * @param ctx - host context.
 * @param config - profile config (front-loaded by the cordis loader).
 */
function registerTools(ctx, config, imageSink) {
  const resolved = {
    ...DEFAULTS,
    ...(config ?? {}),
    maxResults: Number.isInteger(config?.maxResults) && config.maxResults > 0 ? config.maxResults : DEFAULTS.maxResults,
    timeoutMs: Number.isInteger(config?.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : DEFAULTS.timeoutMs,
    headless: config?.headless !== false,
  };
  applyBrowserSearchTool(ctx, resolved);
  const profileForArticle = registerPortalSearch(ctx, resolved);
  applyBrowserFetchTool(ctx, resolved, profileForArticle, imageSink);
}

export { browserSearch, browserFetch, findBrowserPath };

/** One catalogue per Kvant chat. The bridge handles consent, cancellation and MCP image blocks. */
export function createPortalCatalog(config = {}) {
  const definitions = [];
  registerTools({
    tools: { register: definition => definitions.push(definition) },
    systemPrompt: { section() {} },
  }, config, () => (data, mediaType) => ({
    kind: 'tool-image-output', text: 'Selected article illustration', images: [{ data, mimeType: mediaType }],
  }));
  return definitions.map(({ name, description, parameters, execute }) => ({
    name, description, parameters, execute: (args, signal) => execute(args, { signal }),
  }));
}

export function apply(ctx, config) {
  registerTools(ctx, config, async exec => {
    const route = exec.agent.session.requestHeader()?.config;
    const model = await ctx.get('llm').resolveModelInfo(route?.provider ?? exec.agent.options.provider, route?.model ?? exec.agent.options.model, exec.signal);
    if (!model.inputModalities?.includes('image')) throw new Error('Model does not accept images');
    return async (data, mediaType) => {
      const [attachment] = await ctx.get('attachments').saveImages([{ data: Buffer.from(data, 'base64'), mediaType }]);
      return { attachment };
    };
  });
}
