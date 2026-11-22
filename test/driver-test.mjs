// Standalone end-to-end test for dsh-local-browser-search.
// Launches a REAL local Edge/Chrome; needs full OS access (no harness sandbox).
import { browserSearch, browserFetch } from '../lib/driver.js';
import { apply } from '../lib/index.js';

let failures = 0;
function check(label, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) failures++;
}

// ---- 1. Driver: real search on Bing ----
try {
  const s = await browserSearch({ query: 'DeepSeek Harness', engine: 'bing', maxResults: 5, headless: true, timeoutMs: 45000 });
  check('web_search returned sources', Array.isArray(s.sources) && s.sources.length > 0, `count=${s.sources.length}`);
  if (s.sources.length > 0) {
    const first = s.sources[0];
    check('first result has title', typeof first.title === 'string' && first.title.length > 0, first.title.slice(0, 60));
    check('first result has http url', /^https?:/i.test(first.url), first.url.slice(0, 60));
    console.log('  sample:', JSON.stringify(first, null, 2).split('\n').slice(0, 6).join('\n  '));
  }
} catch (e) {
  check('web_search (bing)', false, e.message.slice(0, 120));
}

// ---- 2. Driver: fetch a page's rendered text ----
try {
  const f = await browserFetch({ url: 'https://www.bing.com/search?q=deepseek+harness', maxChars: 3000, headless: true, timeoutMs: 45000 });
  check('web_fetch returned text', typeof f.text === 'string' && f.text.length > 0, `chars=${f.text.length}`);
  check('web_fetch finalUrl is http', /^https?:/i.test(f.finalUrl ?? ''), f.finalUrl);
} catch (e) {
  check('web_fetch', false, e.message.slice(0, 120));
}

// ---- 3. Plugin: registration + execute through a minimal fake ctx ----
{
  const registered = new Map();
  const sections = [];
  const fakeCtx = {
    tools: {
      register(def) {
        const key = def.name;
        registered.set(key, def);
        return () => registered.delete(key);
      },
    },
    systemPrompt: {
      section(sec) {
        sections.push(sec);
      },
    },
  };
  try {
    apply(fakeCtx, { headless: true, engine: 'bing', maxResults: 4, timeoutMs: 45000 });
    check('plugin registered 5 tools', registered.size === 5, [...registered.keys()].join(','));
    check('plugin added 2 prompt sections', sections.length === 2);
    const tool = registered.get('web_search');
    check('web_search tool exists', !!tool);
    if (tool) {
      const result = await tool.execute({ query: 'DeepSeek Harness deepseek h', engine: 'bing', maxResults: 3 }, { signal: new AbortController().signal });
      const meta = tool.output.presentationMeta({ query: 'x' }, result);
      check('execute returned sources', Array.isArray(result.sources) && result.sources.length > 0, `count=${result.sources.length}`);
      check('presentationMeta sources', Array.isArray(meta?.sources));
      const blocks = tool.output.render({ query: 'x' }, result);
      check('render produced text', Array.isArray(blocks) && typeof blocks[0]?.text === 'string' && blocks[0].text.length > 0);
      console.log('---- rendered (first 400 chars) ----');
      console.log(blocks[0].text.slice(0, 400));
    }
  } catch (e) {
    check('plugin apply/execute', false, e.message.slice(0, 200));
  }
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

