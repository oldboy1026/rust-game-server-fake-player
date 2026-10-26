// Standalone, dependency-free runner for a bounded administrator test window.
import { RustQueryProxy } from '../../steam-multi-account/src/rust-query-proxy.js';

const args = process.argv.slice(2), values = {};
const allowed = new Set(['host', 'game-port', 'query-port', 'listen-port', 'listen-host', 'add-players', 'duration-seconds']);
let publicTest = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--public-test') { publicTest = true; continue; }
  const key = args[i].replace(/^--/, '');
  if (!args[i].startsWith('--') || !allowed.has(key) || i + 1 >= args.length || values[key] !== undefined)
    throw new Error('Invalid or duplicate query-proxy argument.');
  values[key] = args[++i];
}
const duration = Number(values['duration-seconds'] || 300);
if (!Number.isInteger(duration) || duration < 10 || duration > 900) throw new Error('Test window must be 10–900 seconds.');
if (values['listen-host'] === '0.0.0.0' && !publicTest) throw new Error('Public listening requires --public-test.');
const proxy = new RustQueryProxy();
await proxy.start({ host: values.host, gamePort: Number(values['game-port']), queryPort: Number(values['query-port']),
  listenPort: Number(values['listen-port']), listenHost: values['listen-host'] || '127.0.0.1', addPlayers: Number(values['add-players'] || 0) },
{ publicListener: publicTest });
console.log(JSON.stringify({ event: 'query_proxy_started', expiresAt: new Date(Date.now() + duration * 1000).toISOString(), ...proxy.status() }));
let stopping = false;
const finish = async () => {
  if (stopping) return; stopping = true;
  clearInterval(interval); clearTimeout(expiry);
  await proxy.stop();
  console.log(JSON.stringify({ event: 'query_proxy_stopped', ...proxy.status() }));
};
const interval = setInterval(() => console.log(JSON.stringify({ event: 'query_proxy_status', ...proxy.status() })), 30000);
const expiry = setTimeout(() => { void finish(); }, duration * 1000);
process.on('SIGINT', () => { void finish(); });
process.on('SIGTERM', () => { void finish(); });
