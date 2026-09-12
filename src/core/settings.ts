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

/** 合法取值白名单：存储里的枚举值一律经此校验，非法值归一回默认（见 mergeSettings） */
const VALID_PER_ROW: ReadonlySet<Settings['cardsPerRowHint']> = new Set<Settings['cardsPerRowHint']>([
  'auto',
  6,
  8,
  10,
]);
const VALID_THEME: ReadonlySet<Settings['theme']> = new Set<Settings['theme']>(['system', 'light', 'dark']);
const VALID_ENGINE: ReadonlySet<Settings['searchEngine']> = new Set<Settings['searchEngine']>([
  'bing',
  'google',
  'baidu',
  'custom',
]);
const VALID_SCOPE: ReadonlySet<Settings['searchScope']> = new Set<Settings['searchScope']>(['current', 'all']);

/** 与设置页输入框的 min/max 保持一致 */
const MIN_EXPAND_DEPTH = 0;
const MAX_EXPAND_DEPTH = 5;

function pickEnum<T extends string>(value: unknown, valid: ReadonlySet<T>, fallback: T): T {
  return typeof value === 'string' && valid.has(value as T) ? (value as T) : fallback;
}

function pickBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** 只保留非空字符串 id，非数组/脏元素一律丢弃（enabledRootIds 会直接进 .includes） */
function pickIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function pickExpandDepth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SETTINGS.treeDefaultExpandDepth;
  return Math.min(MAX_EXPAND_DEPTH, Math.max(MIN_EXPAND_DEPTH, Math.trunc(value)));
}

/**
 * 逐字段归一化合并，容忍旧版本缺字段、脏数据与非法枚举值。
 *
 * 这里的输入来自 chrome.storage（可能是旧版本、其他设备或手工改过的内容），
 * 因此不能只做浅合并：非法枚举值会一路传到业务层抛错（例如 searchEngine 非法
 * 会让 buildSearchUrl 取到 undefined 后抛 TypeError，直接卡死新标签页）。
 *
 * 已知字段全部经过归一化；未知字段原样保留（避免旧版本把未来版本新增的设置项抹掉）。
 */
export function mergeSettings(stored: Partial<Settings>): Settings {
  const raw = (stored ?? {}) as Record<string, unknown>;
  const rawClock = (raw.clock ?? {}) as Record<string, unknown>;
  // 每行卡片数是数字 | 'auto' 的联合类型，不能走 pickEnum（字符串化后会失配）
  const rawPerRow = raw.cardsPerRowHint as Settings['cardsPerRowHint'];

  const normalized: Settings = {
    enabledRootIds: pickIdList(raw.enabledRootIds),
    defaultFolderId:
      typeof raw.defaultFolderId === 'string' && raw.defaultFolderId.length > 0 ? raw.defaultFolderId : undefined,
    showEmptyFolders: pickBool(raw.showEmptyFolders, DEFAULT_SETTINGS.showEmptyFolders),
    treeDefaultExpandDepth: pickExpandDepth(raw.treeDefaultExpandDepth),
    searchScope: pickEnum(raw.searchScope, VALID_SCOPE, DEFAULT_SETTINGS.searchScope),
    searchEngine: pickEnum(raw.searchEngine, VALID_ENGINE, DEFAULT_SETTINGS.searchEngine),
    customSearchUrl: typeof raw.customSearchUrl === 'string' ? raw.customSearchUrl : undefined,
    cardsPerRowHint: VALID_PER_ROW.has(rawPerRow) ? rawPerRow : DEFAULT_SETTINGS.cardsPerRowHint,
    theme: pickEnum(raw.theme, VALID_THEME, DEFAULT_SETTINGS.theme),
    clock: {
      format24h: pickBool(rawClock.format24h, DEFAULT_SETTINGS.clock.format24h),
      showSeconds: pickBool(rawClock.showSeconds, DEFAULT_SETTINGS.clock.showSeconds),
      showDate: pickBool(rawClock.showDate, DEFAULT_SETTINGS.clock.showDate),
    },
    allowFileUrls: pickBool(raw.allowFileUrls, DEFAULT_SETTINGS.allowFileUrls),
  };

  // 归一化值覆盖已知字段，raw 里本版本不认识的新字段原样透传
  return { ...(raw as Partial<Settings>), ...normalized };
}

/** 存储里存在"设置"且是普通对象才算已初始化；脏值（数字/字符串/数组等）按首次运行处理 */
function hasStoredSettings(stored: unknown): stored is Partial<Settings> {
  return !!stored && typeof stored === 'object' && !Array.isArray(stored);
}

export async function loadSettings(): Promise<Settings> {
  const stored = await storageGet<Partial<Settings>>('sync', SETTINGS_KEY);
  if (hasStoredSettings(stored)) return mergeSettings(stored);

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
    if (areaName !== 'sync') return;
    const next = changes[SETTINGS_KEY]?.newValue;
    // 变更值同样要过归一化，脏值不直接喂给 UI
    if (hasStoredSettings(next)) cb(mergeSettings(next));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
