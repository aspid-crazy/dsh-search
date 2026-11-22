import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Run under npm so the same npm CLI is used on Windows and Unix.
const output = resolve(process.argv[2]);
mkdirSync(output, { recursive: true });
const packed = execFileSync(process.execPath, [process.env.npm_execpath, 'pack', '--ignore-scripts', '--json', '--pack-destination', output], { encoding: 'utf8' });
const [{ filename, integrity, version }] = JSON.parse(packed);
const bytes = readFileSync(join(output, filename));
const digest = createHash('sha256').update(bytes).digest('hex');
const dir = join(output, 'dsh-plugins', digest);
mkdirSync(dir, { recursive: true });
const artifact = 'dsh-local-browser-search.tgz';
writeFileSync(join(dir, artifact), bytes);
writeFileSync(join(dir, artifact + '.sha256'), digest + '  ' + artifact + '\n');
console.log(JSON.stringify({ version, integrity, resolved: 'https://kvant.host/desktop-assets/dsh-plugins/' + digest + '/' + artifact }));
