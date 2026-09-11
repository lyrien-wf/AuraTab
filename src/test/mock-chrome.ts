/**
 * 单元测试用 chrome API mock（chrome.bookmarks / chrome.storage）。
 * 只在需要 chrome 环境的测试里安装；纯函数（buildModel/searchLinks 等）无需 mock。
 */
import type { BookmarkTreeNode } from '../core/chrome';

interface MockOptions {
  tree?: BookmarkTreeNode[];
  syncData?: Record<string, unknown>;
  localData?: Record<string, unknown>;
}

type StorageChange = { newValue?: unknown; oldValue?: unknown };
type ChangeListener = (changes: Record<string, StorageChange>, areaName: string) => void;

export interface ChromeMock {
  store: { local: Map<string, unknown>; sync: Map<string, unknown> };
  listeners: ChangeListener[];
  fireStorageChange(area: 'local' | 'sync', changes: Record<string, StorageChange>): void;
  uninstall(): void;
}

export function installChromeMock(opts: MockOptions = {}): ChromeMock {
  const local = new Map<string, unknown>(Object.entries(opts.localData ?? {}));
  const sync = new Map<string, unknown>(Object.entries(opts.syncData ?? {}));
  const listeners: ChangeListener[] = [];

  const makeArea = (store: Map<string, unknown>) => ({
    get: async (key: string) => (store.has(key) ? { [key]: store.get(key) } : {}),
    set: async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) store.set(k, v);
    },
    remove: async (key: string) => {
      store.delete(key);
    },
  });

  const mock = {
    bookmarks: {
      getTree: async () => opts.tree ?? [],
    },
    storage: {
      local: makeArea(local),
      sync: makeArea(sync),
      onChanged: {
        addListener: (l: ChangeListener) => listeners.push(l),
        removeListener: (l: ChangeListener) => {
          const i = listeners.indexOf(l);
          if (i >= 0) listeners.splice(i, 1);
        },
      },
    },
    runtime: {
      getURL: (path: string) => `chrome-extension://mock${path}`,
      sendMessage: () => {},
      onMessage: { addListener: () => {}, removeListener: () => {} },
    },
  };

  (globalThis as Record<string, unknown>).chrome = mock;

  return {
    store: { local, sync },
    listeners,
    fireStorageChange(area, changes) {
      for (const l of [...listeners]) l(changes, area);
    },
    uninstall() {
      delete (globalThis as Record<string, unknown>).chrome;
    },
  };
}
