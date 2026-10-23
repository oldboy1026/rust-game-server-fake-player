import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createSteamNetwork } from '../../steam-multi-account/src/network.js';
import { load } from '../../steam-multi-account/node_modules/cheerio/dist/esm/index.js';

const directory = new URL('./sources/', import.meta.url);
await mkdir(directory, { recursive: true });
const entries = JSON.parse(await readFile(new URL(process.argv[2], import.meta.url), 'utf8'));
const network = createSteamNetwork();
try {
  const results = await Promise.allSettled(entries.map(async entry => {
    const response = await network.fetchImpl(entry.fetchUrl || entry.url, {
      headers: { 'User-Agent': 'Public-Protocol-Research', ...(entry.headers || {}) },
      signal: AbortSignal.timeout(25000),
    });
    const body = await response.text();
    const filename = `${entry.id}.txt`;
    await writeFile(new URL(filename, directory), body);
    let plain = body;
    if (/text\/html/.test(response.headers.get('content-type') || '')) {
      const $ = load(body); $('script,style,nav,footer,header').remove();
      plain = $('body').text().replace(/\s+/g, ' ');
    }
    await writeFile(new URL(`${entry.id}.plain.txt`, directory), plain);
    const record = {
      id: entry.id, url: entry.url, retrievalUrl: response.url,
      status: response.status, fetchedAt: new Date().toISOString(),
      sha256: createHash('sha256').update(body).digest('hex'), filename, bytes: Buffer.byteLength(body),
    };
    await writeFile(new URL(`${entry.id}.meta.json`, directory), JSON.stringify(record, null, 2));
    if (entry.jsonSummary) {
      let data; try { data = JSON.parse(body); } catch { data = {}; }
      return { ...record, total: data.total_count, message: data.message, items: data.items?.map(x => ({ name: x.full_name, description: x.description, url: x.html_url, updatedAt: x.updated_at })) };
    }
    if (entry.pattern) {
      const pattern = new RegExp(entry.pattern, 'ig');
      const excerpts = [...plain.matchAll(pattern)].slice(0, entry.maxMatches || 10).map(m => plain.slice(Math.max(0, m.index - 200), m.index + 950));
      return { ...record, excerpts };
    }
    return { ...record, excerpt: plain.slice(0, 1800) };
  }));
  results.forEach((result, index) => console.log(JSON.stringify({ index, ...result }, (key, value) => value instanceof Error ? { name: value.name, message: value.message } : value)));
} finally { await network.close(); }
