/**
 * 设置读写与默认值（chrome.storage.sync，体积小、跨设备同步）。
 * 首次运行默认勾选第一个根文件夹（Chrome「书签栏」/ Edge「收藏夹栏」），
 * 之后尊重用户选择 —— 包括刻意清空所有勾选（主页会显示引导空态）。
 */
import { hasStorage, storageGet, storageSet } from './chrome';
import { listRootFolders } from './bookmarks';
import type { Settings } from './types';

const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  enabledRootIds: [],
  defaultFolderId: undefined,
  showEmptyFolders: false,
  treeDefaultExpandDepth: 1,
  searchScope: 'all',
  searchEngine: 'bing',
  customSearchUrl: undefined,
  cardsPerRowHint: 'auto',
  theme: 'system',
  clock: { format24h: true, showSeconds: false, showDate: true },
  allowFileUrls: false,
};

/** 合法的每行卡片数取值（旧版本的 4/5 等值归一化为 auto） */
const VALID_PER_ROW: ReadonlySet<Settings['cardsPerRowHint']> = new Set<Settings['cardsPerRowHint']>([
  'auto',
  6,
  8,
  10,
]);

/** 浅合并 + clock 深合并，容忍旧版本缺字段 */
export function mergeSettings(stored: Partial<Settings>): Settings {
  const merged: Settings = {
    ...DEFAULT_SETTINGS,
    ...stored,
    clock: { ...DEFAULT_SETTINGS.clock, ...(stored.clock ?? {}) },
  };
  if (!VALID_PER_ROW.has(merged.cardsPerRowHint)) merged.cardsPerRowHint = 'auto';
  return merged;
}

export async function loadSettings(): Promise<Settings> {
  const stored = await storageGet<Partial<Settings>>('sync', SETTINGS_KEY);
  if (stored) return mergeSettings(stored);

  // 首次运行：动态取根文件夹列表，默认勾选第一个（不硬编码 id）
  const roots = await listRootFolders();
  const initial: Settings = {
    ...DEFAULT_SETTINGS,
    enabledRootIds: roots.slice(0, 1).map((r) => r.id),
  };
  await saveSettings(initial);
  return initial;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await storageSet('sync', SETTINGS_KEY, settings);
}

export async function resetSettings(): Promise<Settings> {
  const roots = await listRootFolders();
  const fresh: Settings = { ...DEFAULT_SETTINGS, enabledRootIds: roots.slice(0, 1).map((r) => r.id) };
  await saveSettings(fresh);
  return fresh;
}

/** 订阅设置变更（如设置页保存后，新标签页实时生效），返回取消订阅函数 */
export function onSettingsChanged(cb: (settings: Settings) => void): () => void {
  if (!hasStorage()) return () => {};
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName === 'sync' && changes[SETTINGS_KEY]?.newValue) {
      cb(mergeSettings(changes[SETTINGS_KEY].newValue as Partial<Settings>));
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
