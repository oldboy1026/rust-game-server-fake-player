import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, statSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUST_DLL_PROFILES, RUST_WORKER } from '../src/rust-connection.js';

const args = process.argv.slice(2), options = new Map();
try {
  for (let i = 0; i < args.length; i += 2) {
    if (!['--dll', '--python'].includes(args[i]) || options.has(args[i]) || !args[i + 1]) throw new Error('invalid_arguments');
    options.set(args[i], args[i + 1]);
  }
  if (!options.has('--dll')) throw new Error('invalid_arguments');
  const dll = resolve(options.get('--dll'));
  if (!statSync(dll).isFile() || statSync(dll).size > 4 * 1024 * 1024) throw new Error('invalid_dll_file');
  const hash = createHash('sha256').update(readFileSync(dll)).digest('hex');
  if (!Object.hasOwn(RUST_DLL_PROFILES, hash)) throw new Error('unsupported_dll_hash');
  const python = resolve(options.get('--python') || process.env.RUST_PYTHON
    || resolve(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'));
  if (!statSync(python).isFile() || !statSync(RUST_WORKER).isFile()) throw new Error('runtime_file_missing');
  const result = spawnSync(python, ['-I', '-c', 'import sys; print("python64" if sys.maxsize > 2**32 and sys.version_info >= (3, 10) else "unsupported")'],
    { windowsHide: true, encoding: 'utf8', timeout: 10000 });
  if (result.status !== 0 || result.stdout.trim() !== 'python64') throw new Error('python_64bit_310_required');
  const directory = resolve(process.env.STEAM_DATA_DIR || fileURLToPath(new URL('../data/', import.meta.url)));
  mkdirSync(directory, { recursive: true });
  const temporary = resolve(directory, `rust-runtime.${randomUUID()}.tmp`);
  writeFileSync(temporary, JSON.stringify({ dll, python, sha256: hash }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  renameSync(temporary, resolve(directory, 'rust-runtime.json'));
  console.log(JSON.stringify({ configured: true, dllSha256: hash, profile: RUST_DLL_PROFILES[hash], note: 'Local paths saved; no login or server connection attempted. Environment overrides still take precedence.' }));
} catch (error) {
  const known = new Set(['invalid_arguments', 'invalid_dll_file', 'unsupported_dll_hash', 'runtime_file_missing', 'python_64bit_310_required']);
  console.error(JSON.stringify({ error: error.code === 'ENOENT' ? 'runtime_file_missing' : known.has(error.message) ? error.message : 'runtime_configuration_failed',
    supportedDllSha256: Object.keys(RUST_DLL_PROFILES),
    usage: 'node scripts/configure-rust-runtime.mjs --dll PATH_TO_VERIFIED_RakNet.dll [--python PATH_TO_64BIT_PYTHON]' }));
  process.exitCode = 1;
}
