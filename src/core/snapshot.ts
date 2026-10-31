/**
 * 模型快照缓存（chrome.storage.local）：首屏先渲染上次快照，再用真实数据替换。
 * 快照带作用域指纹与写入时间，不匹配或超期即丢弃；体积超限不写入；旧版数据不再读取。
 */
import { storageGet, storageRemove, storageSet } from './chrome';
import type { BookmarkModel, FolderNode, LinkNode, Settings } from './types';

/** 测试与迁移清理共用 */
export const SNAPSHOT_KEY = 'modelSnapshot.v2';
const LEGACY_SNAPSHOT_KEY = 'modelSnapshot.v1';
const UI_KEY = 'ui.v1';

/** 过期阈值：超过 7 天的快照视为陈旧，直接丢弃 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** 写入阈值：序列化结果超过 2MB 跳过缓存 */
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;

export interface ModelSnapshot {
  v: 2;
  savedAt: number;
  rootsKey: string;
  roots: FolderNode[];
  links: [string, LinkNode[]][];
}

export interface UIState {
  sidebarWidth?: number;
  lastFolderId?: string;
}

/** 快照指纹：勾选根 + 空目录可见性 */
function scopeKey(scope: Pick<Settings, 'enabledRootIds' | 'showEmptyFolders'>): string {
  return `${[...scope.enabledRootIds].sort().join(',')}|${scope.showEmptyFolders ? 1 : 0}`;
}

export function serializeModel(
  model: BookmarkModel,
  scope: Pick<Settings, 'enabledRootIds' | 'showEmptyFolders'>,
): ModelSnapshot {
  return {
    v: 2,
    savedAt: Date.now(),
    rootsKey: scopeKey(scope),
    roots: model.roots,
    links: [...model.linksByFolder.entries()],
  };
}

export function reviveModel(snapshot: ModelSnapshot): BookmarkModel {
  const folderIndex = new Map<string, FolderNode>();
  const walk = (folders: FolderNode[]) => {
    for (const f of folders) {
      folderIndex.set(f.id, f);
      walk(f.children ?? []);
    }
  };
  walk(snapshot.roots ?? []);
  const links = snapshot.links ?? [];
  return {
    roots: snapshot.roots ?? [],
    folderIndex,
    linksByFolder: new Map(links),
    // allLinks 不再单独存储：由各目录直接书签合并推导（顺序仅影响搜索同分并列，可接受）
    allLinks: links.flatMap(([, folderLinks]) => folderLinks),
  };
}

/**
 * 读取快照；指纹不符、超期、版本不符或形状不对一律返回 null。
 */
export async function loadSnapshot(
  scope: Pick<Settings, 'enabledRootIds' | 'showEmptyFolders'>,
): Promise<BookmarkModel | null> {
  let snap: ModelSnapshot | undefined;
  try {
    snap = await storageGet<ModelSnapshot>('local', SNAPSHOT_KEY);
  } catch {
    return null;
  }
  if (!snap || snap.v !== 2) return null;
  if (typeof snap.savedAt !== 'number' || Date.now() - snap.savedAt > MAX_AGE_MS) return null;
  if (snap.rootsKey !== scopeKey(scope)) return null;
  // 形状校验：字段缺失/类型不对的脏快照直接丢弃，避免 revive 出空模型闪一屏空态
  if (!Array.isArray(snap.roots) || !Array.isArray(snap.links)) return null;
  try {
    return reviveModel(snap);
  } catch {
    return null;
  }
}

export async function saveSnapshot(
  model: BookmarkModel,
  scope: Pick<Settings, 'enabledRootIds' | 'showEmptyFolders'>,
): Promise<void> {
  const snapshot = serializeModel(model, scope);
  // 超大模型不写入缓存，避免首屏解析过慢与配额占用
  if (JSON.stringify(snapshot).length > MAX_SNAPSHOT_BYTES) return;
  try {
    await storageSet('local', SNAPSHOT_KEY, snapshot);
    // 清理旧版快照（不存在时为 no-op）
    void storageRemove('local', LEGACY_SNAPSHOT_KEY);
  } catch {
    // 快照超出配额等情况不影响主流程，静默放弃缓存
  }
}

export async function loadUI(): Promise<UIState> {
  try {
    return (await storageGet<UIState>('local', UI_KEY)) ?? {};
  } catch {
    // UI 状态（侧栏宽度 / 上次目录）读取失败时用默认值
    return {};
  }
}

/**
 * 写入串行化队列：避免两次"读-改-写"交错互相覆盖，按调用顺序排队执行。
 */
let uiWriteQueue: Promise<void> = Promise.resolve();

export function saveUI(patch: UIState): Promise<void> {
  const task = uiWriteQueue.then(async () => {
    try {
      const prev = await loadUI();
      await storageSet('local', UI_KEY, { ...prev, ...patch });
    } catch {
      // UI 状态只是体验优化（记忆侧栏宽度与上次目录），写失败不影响使用
    }
  });
  uiWriteQueue = task;
  return task;
}
