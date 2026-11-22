import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { browserFetch, browserIllustration } from '../lib/driver.js';

test('reads the article and downloads only its selected illustration', async t => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6BmwAAAAASUVORK5CYII=', 'base64');
  const requests = [];
  const server = createServer((req, res) => {
    if (req.url.endsWith('.png')) {
      requests.push(req.url);
      res.writeHead(200, { 'content-type': 'image/png' }).end(png);
    } else res.writeHead(200, { 'content-type': 'text/html' }).end('<article>Article <img src="/a.png" alt="First"><img src="/b.png" alt="Second"></article>');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const url = 'http://127.0.0.1:' + server.address().port + '/article';
  const article = await browserFetch({ url });
  assert.match(article.text, /img-2: Second/);
  assert.deepEqual(requests, []);
  const image = await browserIllustration({ articleUrl: article.finalUrl, imageUrl: article.images[1].url });
  assert.equal(image.data, png.toString('base64'));
  assert.deepEqual(requests, ['/b.png']);
});
