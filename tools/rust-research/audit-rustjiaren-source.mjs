/** Read decompiled reference source as text. Never build, load or deploy it. */
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';

const allowed = new Set(['--source-dir', '--out']);
const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index], value = process.argv[index + 1];
  if (!allowed.has(name) || !value || value.startsWith('--') || options.has(name)) {
    throw new Error('Use --source-dir DIRECTORY --out FILE.json');
  }
  options.set(name, value);
}
if (!options.has('--source-dir') || !options.has('--out')) {
  throw new Error('Use --source-dir DIRECTORY --out FILE.json');
}
const source = await realpath(resolve(options.get('--source-dir')));
const output = resolve(options.get('--out'));
if (output === source || output.startsWith(source + sep)) {
  throw new Error('Output must be outside the reference source directory.');
}

const files = [];
const bodies = new Map();
const eligible = new Set(['.cs', '.csproj', '.sln', '.pdb']);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
let totalBytes = 0;
async function inventory(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) throw new Error('Symbolic links are not supported in reference input.');
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await inventory(path); continue; }
    if (!entry.isFile() || !eligible.has(extname(entry.name).toLowerCase())) continue;
    const info = await lstat(path);
    if (info.size > 4 * 1024 * 1024 || files.length >= 128) throw new Error('Reference size limit exceeded.');
    const bytes = await readFile(path);
    totalBytes += bytes.length;
    if (totalBytes > 16 * 1024 * 1024) throw new Error('Reference size limit exceeded.');
    const name = relative(source, path).split(sep).join('/');
    files.push({ path: name, bytes: bytes.length, sha256: sha256(bytes) });
    if (extname(entry.name).toLowerCase() === '.cs') bodies.set(name, bytes.toString('utf8'));
  }
}
await inventory(source);

// These are precise text locators for an inspected reference, not a general
// C# analyzer. Reports describe matches; they do not prove runtime behavior.
const locators = [
  ['synthetic_connection', 'SimpleWS/SimpleWebSocketServer.cs', 'Connection asd = new Connection();'],
  ['random_address', 'SimpleWS/SimpleWebSocketServer.cs', 'string ip = $"{Random.Range(1, 254)}'],
  ['assigned_address', 'SimpleWS/SimpleWebSocketServer.cs', 'asd.ipaddress ='],
  ['steam_begin', 'SimpleWS/SimpleWebSocketServer.cs', 'BeginPlayerSession(asd.userid, asd.token)'],
  ['manual_auth_event', 'SimpleWS/SimpleWebSocketServer.cs', 'Analytics.Azure.OnSteamAuth(userid, userid, "OK")'],
  ['fixed_delay', 'SimpleWS/SimpleWebSocketServer.cs', 'await Task.Delay(15000)'],
  ['manual_connection_event', 'SimpleWS/SimpleWebSocketServer.cs', 'Analytics.Azure.OnPlayerConnected(asd)'],
  ['listen_address', 'SimpleWS/SimpleWebSocketServer.cs', 'new WebSocketServer('],
  ['unawaited_admission', 'SimpleWS/SimpleWebSocketServer.cs', 'this.JinRen(uint64, username, data3);'],
  ['response_before_completion', 'SimpleWS/SimpleWebSocketServer.cs', 'status = "ok"'],
  ['auth_callback_subscription', 'Ext/RustJiaRen/OxideRustJiaRenHooks.cs', 'SteamServer.OnValidateAuthTicketResponse +='],
  ['tag_rewrite', 'Ext/RustJiaRen/OxideRustJiaRenHooks.cs', 'SteamServer.GameTags = SteamServer.GameTags.Replace('],
  ['existing_connection_guard', 'Ext/RustJiaRen/OxideRustJiaRenHooks.cs', 'Net.sv.connections.FirstOrDefault'],
  ['success_increment', 'Ext/RustJiaRen/OxideRustJiaRenHooks.cs', '++OxideRustJiaRenHooks.FakePlayers;'],
  ['failure_decrement', 'Ext/RustJiaRen/OxideRustJiaRenHooks.cs', '--OxideRustJiaRenHooks.FakePlayers;'],
  ['console_title_only', 'Ext/RustJiaRen/Core.cs', 'Console.Title = stringBuilder1.ToString();'],
];
const evidence = locators.map(([id, path, needle]) => ({
  id, path,
  lines: (bodies.get(path) ?? '').split(/\r?\n/).flatMap((line, index) => line.includes(needle) ? [index + 1] : []),
}));
const trackedSymbols = ['EOS_AntiCheatClient', 'EOS_Connect_Login', 'ReceiveMessageFromServer',
  'AddNotifyMessageToServer', 'ClientReady', 'PlayerInit', 'NET_StartClient'];
const symbolOccurrences = trackedSymbols.map(symbol => ({ symbol, occurrences: [...bodies.entries()].flatMap(([path, body]) =>
  body.split(/\r?\n/).flatMap((line, index) => line.includes(symbol) ? [{ path, line: index + 1 }] : [])) }));
for (const file of files) {
  if (sha256(await readFile(join(source, file.path))) !== file.sha256) {
    throw new Error('Reference input changed during inspection; no report written.');
  }
}
const report = {
  generatedAt: new Date().toISOString(),
  scope: 'Static text audit of user-provided decompiled reference source; no execution or networking.',
  limitations: ['Text locators require human interpretation; absent symbols do not prove absence of other implementations.',
    'No original assembly was supplied in this directory. Source comments and PDB are not independently verified binary metadata.',
    'No source text, machine-specific paths, credentials, account identities or ticket data are copied into this report.'],
  files, evidence, symbolOccurrences,
  inputUnchanged: true,
  referenceExecuted: false,
};
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ files: files.length, sourceFiles: bodies.size,
  locatorsMatched: evidence.filter(item => item.lines.length > 0).length,
  locatorsRequested: evidence.length, inputUnchanged: true, referenceExecuted: false }));
