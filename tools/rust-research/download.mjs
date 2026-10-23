import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createSteamNetwork } from '../../steam-multi-account/src/network.js';

const directory = new URL('./packages/', import.meta.url);
await mkdir(directory, { recursive: true });
const network = createSteamNetwork();
try {
  let files = [
    { name: 'oxide-rust-2.0.7839.zip', url: 'https://github.com/OxideMod/Oxide.Rust/releases/download/2.0.7839/Oxide.Rust.zip', sha256: '2bce323997d840c104876540c1574904ceaee33eed8f99ab24fc39ac6b8950a7' },
    { name: 'dnlib-4.5.0.nupkg', url: 'https://api.nuget.org/v3-flatcontainer/dnlib/4.5.0/dnlib.4.5.0.nupkg' },
  ];
  if (process.argv[2] === 'depot') {
    const release = JSON.parse(await readFile(new URL('./sources/depotdownloader-release.txt', import.meta.url), 'utf8'));
    const asset = release.assets.find(x => x.name === 'DepotDownloader-windows-x64.zip');
    if (!asset) throw new Error('Pinned downloader asset not found');
    files = [{ name: asset.name, url: asset.browser_download_url, ...(asset.digest ? { sha256: asset.digest.replace(/^sha256:/, '') } : {}) }];
  }
  const results = await Promise.allSettled(files.map(async file => {
    const response = await network.fetchImpl(file.url, { headers: { 'User-Agent': 'Public-Protocol-Research' }, signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`${file.name}: HTTP ${response.status}`);
    if (Number(response.headers.get('content-length')) > 40_000_000) throw new Error('Package exceeds research limit');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 40_000_000) throw new Error('Package exceeds research limit');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (file.sha256 && sha256 !== file.sha256) throw new Error('Published package digest mismatch');
    await writeFile(new URL(file.name, directory), bytes);
    const record = { ...file, sha256, bytes: bytes.length, fetchedAt: new Date().toISOString(), publishedDigestVerified: Boolean(file.sha256) };
    await writeFile(new URL(`${file.name}.json`, directory), JSON.stringify(record, null, 2));
    return record;
  }));
  for (const result of results) console.log(JSON.stringify(result, (k, v) => v instanceof Error ? { name: v.name, message: v.message } : v));
} finally { await network.close(); }
