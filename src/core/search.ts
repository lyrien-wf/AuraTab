/**
 * 搜索匹配逻辑。
 * 打分：标题前缀命中 > 标题包含 > 域名包含 > url 包含；不区分大小写；上限 200 条。
 */
import type { BookmarkModel, LinkNode, Settings } from './types';

export const SEARCH_LIMIT = 200;

export interface SearchOptions {
  scope: 'current' | 'all';
  selectedFolderId?: string | null;
  limit?: number;
}

const SCORE_TITLE_PREFIX = 0;
const SCORE_TITLE_INCLUDES = 1;
const SCORE_DOMAIN_INCLUDES = 2;
const SCORE_URL_INCLUDES = 3;

export function searchLinks(model: BookmarkModel, rawQuery: string, opts: SearchOptions): LinkNode[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q || isEngineQuery(rawQuery)) return [];

  const pool =
    opts.scope === 'current' && opts.selectedFolderId
      ? (model.linksByFolder.get(opts.selectedFolderId) ?? [])
      : model.allLinks;

  const scored: { link: LinkNode; score: number }[] = [];
  for (const link of pool) {
    const title = link.title.toLowerCase();
    const domain = link.domain.toLowerCase();
    const url = link.url.toLowerCase();
    let score: number;
    if (title.startsWith(q)) score = SCORE_TITLE_PREFIX;
    else if (title.includes(q)) score = SCORE_TITLE_INCLUDES;
    else if (domain.includes(q)) score = SCORE_DOMAIN_INCLUDES;
    else if (url.includes(q)) score = SCORE_URL_INCLUDES;
    else continue;
    scored.push({ link, score });
  }
  // Array#sort 稳定：同分保持浏览器原始顺序
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, opts.limit ?? SEARCH_LIMIT).map((s) => s.link);
}

/** 输入前缀 `?` → 强制走搜索引擎 */
export function isEngineQuery(rawQuery: string): boolean {
  return rawQuery.trimStart().startsWith('?');
}

/** 去掉 `?` 前缀，得到真正要发给搜索引擎的关键词 */
export function stripEnginePrefix(rawQuery: string): string {
  return rawQuery.trim().replace(/^\?+\s*/, '');
}

const ENGINE_URLS: Record<Exclude<Settings['searchEngine'], 'custom'>, string> = {
  bing: 'https://www.bing.com/search?q=%s',
  google: 'https://www.google.com/search?q=%s',
  baidu: 'https://www.baidu.com/s?wd=%s',
};

export const ENGINE_LABELS: Record<Settings['searchEngine'], string> = {
  bing: 'Bing',
  google: 'Google',
  baidu: '百度',
  custom: '自定义搜索',
};

/** 生成搜索引擎结果页 URL；custom 缺模板时回退 Bing */
export function buildSearchUrl(settings: Pick<Settings, 'searchEngine' | 'customSearchUrl'>, query: string): string {
  const encoded = encodeURIComponent(query);
  if (settings.searchEngine === 'custom') {
    const tpl = settings.customSearchUrl?.trim();
    if (tpl && tpl.includes('%s')) return tpl.replace('%s', encoded);
    return ENGINE_URLS.bing.replace('%s', encoded);
  }
  // 设置读取时已做枚举归一化，这里再兜一层：ENGINE_URLS 取到 undefined 会抛 TypeError
  const tpl = ENGINE_URLS[settings.searchEngine] ?? ENGINE_URLS.bing;
  return tpl.replace('%s', encoded);
}
