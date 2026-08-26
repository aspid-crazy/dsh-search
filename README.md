# dsh-local-browser-search

Web search and page fetching powered by your **local browser** (Edge / Chrome) over
the Chrome DevTools Protocol — **no API key, no cloud search provider, no bundled
browser download**.

The plugin drives the installed browser with Node.js built-ins only (`child_process`,
`fetch`, `WebSocket`) and registers two model-facing tools for the DSH agent:

| Tool | What it does |
| ---- | ------------ |
| `browser_search` | Searches the web and returns organic result **titles / URLs / snippets**. Engine: `bing` (default), `duckduckgo`, or `google`. |
| `browser_fetch`  | Opens a URL in the browser and returns the **rendered page text** — exactly what a human sees after JavaScript executes. |

This is useful where public search APIs are unavailable or unkeyed: the search runs
in a real browser using your own network and cookies-free fresh profile.

## Install

```sh
dsh plugin --profile web add dsh-local-browser-search
```

Then restart `dsh web`. The two tools appear in the agent's toolset.

> Note: this package can also be installed from a local checkout with
> `npm install <path-to-this-folder>` in your profile directory.

## Configuration

Defaults are set in `cordis.patch.yml`:

| Key | Default | Meaning |
| --- | ------- | ------- |
| `headless` | `true` | Run the browser headless (`false` opens a visible window). |
| `engine` | `bing` | Default search engine: `bing` / `duckduckgo` / `google`. |
| `maxResults` | `8` | Upper bound on sources returned per search. |
| `timeoutMs` | `30000` | Cooperative tool-call timeout budget. |
| `browserPath` | `null` | Explicit browser executable; auto-detected (Edge → Chrome → Brave) when unset. |

You can also set `DSH_BROWSER_PATH` in the environment to force a browser.

Bing is the default because it is the engine reachable on the most restrictive
networks (DuckDuckGo/Google are often blocked in some regions).

## How it works

1. The plugin finds an installed Chromium-based browser (Edge by default on Windows).
2. It launches it headless with `--remote-debugging-port` and a fresh temporary profile.
3. It drives the page over the Chrome DevTools Protocol (WebSocket JSON-RPC): navigate
   to the search engine, evaluate the result extractor, and read back the JSON.
4. The browser is killed and its temp profile removed after each call.

No user profile, cookies, or browsing data are ever touched — every call uses a fresh
temp profile.

## Security note

Like any DSH plugin, loading this package runs its code in your harness process with
your permissions. The browser it launches is the one you already run. Review the
source before use.

## License

MIT
