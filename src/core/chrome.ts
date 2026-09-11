/**
 * chrome API 适配层。
 *
 * - 在扩展环境中直接透传 chrome.*；
 * - 在普通浏览器（vite dev）或测试环境中降级为演示数据 / 内存存储，
 *   使 `npm run dev` 无需加载扩展即可预览页面。
 */
import { BOOKMARKS_DIRTY } from './types';

/** chrome.bookmarks.BookmarkTreeNode 的最小结构镜像（避免非扩展环境依赖类型） */
export interface BookmarkTreeNode {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  index?: number;
  dateAdded?: number;
  children?: BookmarkTreeNode[];
}

type StorageArea = 'local' | 'sync';

function chromeGlobal(): typeof chrome | undefined {
  return typeof globalThis !== 'undefined' ? (globalThis as { chrome?: typeof chrome }).chrome : undefined;
}

export function hasBookmarks(): boolean {
  const c = chromeGlobal();
  return !!c?.bookmarks?.getTree;
}

export function hasStorage(): boolean {
  const c = chromeGlobal();
  return !!c?.storage?.local && !!c?.storage?.sync;
}

export function isExtension(): boolean {
  return hasBookmarks();
}

/* ---------------------------------- 书签 ---------------------------------- */

/** 开发用演示书签树（仅在非扩展环境使用） */
const DEMO_TREE: BookmarkTreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: '收藏夹栏',
        children: [
          {
            id: '11',
            title: 'nas',
            children: [
              { id: '1101', title: 'NAS 管理面板', url: 'https://nas.example.com/admin', dateAdded: 1700000000000 },
              {
                id: '111',
                title: '本地',
                children: [
                  { id: '1111', title: '局域网影音', url: 'https://192.168.1.10:8096', dateAdded: 1700000001000 },
                  { id: '1112', title: '下载机', url: 'https://192.168.1.10:9091', dateAdded: 1700000002000 },
                ],
              },
              {
                id: '112',
                title: 'hk',
                children: [
                  { id: '1121', title: 'HK 节点监控', url: 'https://hk.example.com/status', dateAdded: 1700000003000 },
                ],
              },
            ],
          },
          {
            id: '12',
            title: 'AI',
            children: [
              { id: '1201', title: 'Claude', url: 'https://claude.ai', dateAdded: 1700000004000 },
              { id: '1202', title: 'Anthropic Docs', url: 'https://docs.anthropic.com', dateAdded: 1700000005000 },
              { id: '1203', title: 'Hugging Face', url: 'https://huggingface.co', dateAdded: 1700000006000 },
            ],
          },
          {
            id: '13',
            title: '邮件',
            children: [
              { id: '1301', title: 'Gmail', url: 'https://mail.google.com', dateAdded: 1700000007000 },
              { id: '1302', title: 'Outlook', url: 'https://outlook.live.com', dateAdded: 1700000008000 },
            ],
          },
          {
            id: '14',
            title: '交流版',
            children: [
              { id: '1401', title: 'V2EX', url: 'https://www.v2ex.com', dateAdded: 1700000009000 },
              { id: '1402', title: 'Hacker News', url: 'https://news.ycombinator.com', dateAdded: 1700000010000 },
              { id: '1403', title: 'Reddit', url: 'https://www.reddit.com', dateAdded: 1700000011000 },
            ],
          },
          { id: '15', title: 'GitHub', url: 'https://github.com', dateAdded: 1700000012000 },
          { id: '16', title: '空文件夹示例', children: [] },
        ],
      },
      {
        id: '2',
        title: '其他收藏夹',
        children: [{ id: '21', title: 'MDN Web Docs', url: 'https://developer.mozilla.org', dateAdded: 1700000013000 }],
      },
      { id: '3', title: '移动收藏夹', children: [] },
    ],
  },
];

export async function getTree(): Promise<BookmarkTreeNode[]> {
  if (hasBookmarks()) {
    const c = chromeGlobal()!;
    return (await c.bookmarks.getTree()) as unknown as BookmarkTreeNode[];
  }
  return DEMO_TREE;
}

/* ---------------------------------- 存储 ---------------------------------- */

const memoryStore: Record<StorageArea, Map<string, unknown>> = {
  local: new Map(),
  sync: new Map(),
};

export async function storageGet<T>(area: StorageArea, key: string): Promise<T | undefined> {
  if (hasStorage()) {
    const res = await chromeGlobal()!.storage[area].get(key);
    return res?.[key] as T | undefined;
  }
  return memoryStore[area].get(key) as T | undefined;
}

export async function storageSet(area: StorageArea, key: string, value: unknown): Promise<void> {
  if (hasStorage()) {
    await chromeGlobal()!.storage[area].set({ [key]: value });
    return;
  }
  memoryStore[area].set(key, value);
}

export async function storageRemove(area: StorageArea, key: string): Promise<void> {
  if (hasStorage()) {
    await chromeGlobal()!.storage[area].remove(key);
    return;
  }
  memoryStore[area].delete(key);
}

/** 测试辅助：清空内存降级存储 */
export function resetMemoryStore(): void {
  memoryStore.local.clear();
  memoryStore.sync.clear();
}

/* ---------------------------------- 消息 ---------------------------------- */

/** 订阅后台广播的 BOOKMARKS_DIRTY 事件，返回取消订阅函数 */
export function onBookmarksDirty(cb: () => void): () => void {
  const c = chromeGlobal();
  if (!c?.runtime?.onMessage) return () => {};
  const listener = (msg: unknown) => {
    if (msg && typeof msg === 'object' && (msg as { type?: string }).type === BOOKMARKS_DIRTY) cb();
  };
  c.runtime.onMessage.addListener(listener);
  return () => c.runtime.onMessage.removeListener(listener);
}

/* ---------------------------------- 杂项 ---------------------------------- */

export function runtimeGetURL(path: string): string | null {
  const c = chromeGlobal();
  return c?.runtime?.getURL ? c.runtime.getURL(path) : null;
}

export function openOptionsPage(): void {
  const c = chromeGlobal();
  if (c?.runtime?.openOptionsPage) {
    c.runtime.openOptionsPage();
    return;
  }
  globalThis.open?.('/options.html', '_blank');
}

export function openNewTab(url: string): void {
  const c = chromeGlobal();
  if (c?.tabs?.create) {
    c.tabs.create({ url });
    return;
  }
  globalThis.open?.(url, '_blank');
}

/** 站点图标：MV3 下通过扩展自身 _favicon 端点读取本地缓存图标，不请求第三方服务 */
export function faviconUrl(pageUrl: string, size = 32): string | null {
  const base = runtimeGetURL('/_favicon/');
  if (!base || !pageUrl) return null;
  return `${base}?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`;
}
