import { load } from 'cheerio';
import { ApiError } from './errors.js';
import { safeImage } from './features.js';

export class FreeCatalog {
  constructor({ fetchImpl = fetch } = {}) { this.fetch = fetchImpl; this.cache = new Map(); this.pending = new Map(); }
  async search(term = '', start = 0) {
    if (typeof term !== 'string' || term.length > 100 || !Number.isInteger(start) || start < 0 || start > 10000) throw new ApiError(400, '免费游戏搜索参数无效。');
    const key = `${term}/${start}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < 300000) return cached.data;
    if (this.pending.has(key)) return this.pending.get(key);
    const pending = (async () => {
      try {
        const url = new URL('https://store.steampowered.com/search/results/');
        url.search = new URLSearchParams({ term, start: String(start), count: '20', maxprice: 'free', category1: '998', infinite: '1', l: 'schinese' });
        const response = await this.fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000), redirect: 'error' });
        if (response.status === 429) throw new ApiError(429, 'Steam 商店请求过于频繁，请稍后再试。');
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (typeof body.results_html !== 'string') throw new Error();
        const $ = load(body.results_html);
        const games = [];
        $('a.search_result_row').each((_index, node) => {
          const row = $(node);
          const match = (row.attr('href') || '').match(/\/app\/(\d+)/);
          const appId = Number(match?.[1]);
          if (!Number.isInteger(appId) || !appId || games.some(game => game.appId === appId)) return;
          games.push({ appId, name: row.find('.title').text().trim(), imageUrl: safeImage(row.find('img').attr('src')), storeUrl: `https://store.steampowered.com/app/${appId}/`, discount: row.find('.discount_pct').text().trim() || null });
        });
        const total = Number(body.total_count) || games.length;
        const pageSize = $('a.search_result_row').length;
        const data = { source: 'steam_store', games, total, start, nextStart: pageSize && start + pageSize < total ? start + pageSize : null, fetchedAt: new Date().toISOString() };
        if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(key, { at: Date.now(), data });
        return data;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(502, '免费游戏列表读取失败，请检查到 store.steampowered.com 的网络连接；也可以手动输入 AppID 入库。');
      }
    })();
    this.pending.set(key, pending);
    try { return await pending; } finally { this.pending.delete(key); }
  }
}
