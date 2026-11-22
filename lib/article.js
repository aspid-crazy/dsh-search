/** Execute inside the article. Keep the image address on the client side. */
export function readArticle(maxChars) {
  const root = document.querySelector('article, main, [role="main"]') ?? document.body;
  const clone = root.cloneNode(true);
  clone.querySelectorAll('script, style, noscript, svg, nav, header, footer, form, iframe, .ad').forEach(node => node.remove());
  const images = [];
  for (const node of clone.querySelectorAll('img')) {
    const raw = node.getAttribute('data-src') || node.getAttribute('src');
    if (!raw) continue;
    let url;
    try { url = new URL(raw, document.baseURI); } catch { continue; }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
    const caption = node.closest('figure')?.querySelector('figcaption')?.textContent?.trim() || node.alt || '';
    const id = 'img-' + (images.length + 1);
    images.push({ id, caption, url: url.href });
    node.replaceWith(document.createTextNode(' [' + id + (caption ? ': ' + caption : '') + '] '));
  }
  for (const node of clone.querySelectorAll('p, div, section, figure, h1, h2, h3, li, br')) node.append('\n');
  const text = (clone.textContent ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { title: document.title, text: text.slice(0, maxChars), truncated: text.length > maxChars, images };
}

/** Fetch a selected illustration in the owning page's browser session. */
export async function readIllustration(address) {
  const response = await fetch(address, { credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Image HTTP ' + response.status);
  const mediaType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mediaType)) throw new Error('Unsupported image type');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 5 * 1024 * 1024) throw new Error('Image exceeds 5 MiB');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const file = new FileReader();
  const data = await new Promise((resolve, reject) => {
    file.onload = () => resolve(file.result.split(',')[1]);
    file.onerror = () => reject(file.error);
    file.readAsDataURL(new Blob(chunks, { type: mediaType }));
  });
  return { mediaType, data };
}
