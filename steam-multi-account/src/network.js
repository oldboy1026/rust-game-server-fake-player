import { execFileSync } from 'node:child_process';
import { ProxyAgent } from 'undici';
import SteamStore from 'steamstore';

export function steamProxy(environment = process.env, platform = process.platform, readWindowsProxy) {
  if (environment.STEAM_HTTP_PROXY === 'direct') return null;
  let value = environment.STEAM_HTTP_PROXY || environment.HTTPS_PROXY || environment.HTTP_PROXY;
  if (!value && platform === 'win32') {
    try {
      const read = readWindowsProxy || (() => JSON.parse(execFileSync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        String.raw`$ErrorActionPreference='Stop'; $p=Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'; @{enabled=[bool]$p.ProxyEnable;server=$p.ProxyServer}|ConvertTo-Json -Compress`,
      ], { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] })));
      const settings = read();
      if (settings.enabled && settings.server) {
        const parts = settings.server.split(';');
        value = parts.find(part => part.startsWith('https='))?.slice(6)
          || parts.find(part => part.startsWith('http='))?.slice(5)
          || (!settings.server.includes('=') ? settings.server : null);
      }
    } catch { /* A machine without a static proxy uses direct connections. */ }
  }
  if (!value) return null;
  const candidate = value.includes('://') ? value : `http://${value}`;
  let url;
  try { url = new URL(candidate); } catch { throw new Error('Invalid STEAM_HTTP_PROXY configuration.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('STEAM_HTTP_PROXY must use an HTTP or HTTPS proxy.');
  return url.href;
}

export function createSteamNetwork() {
  const proxy = steamProxy();
  const dispatcher = proxy ? new ProxyAgent(proxy) : undefined;
  return {
    usingProxy: Boolean(proxy),
    fetchImpl: (url, options = {}) => fetch(url, { ...options, ...(dispatcher ? { dispatcher } : {}) }),
    createStore() {
      const store = new SteamStore({ timeout: 12000 });
      if (proxy) store.request = store.request.defaults({ proxy });
      return store;
    },
    close: () => dispatcher?.close(),
  };
}
