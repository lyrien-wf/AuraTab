/**
 * 模型快照缓存（chrome.storage.local）。
 * 首次渲染前读取上次快照先行渲染，再用真实数据替换，消除白屏。
 *
 * v2（P1-2 修复）：
 * - 去掉 allLinks（回读时由 links 合并推导），序列化体积减半；
 * - 记录 rootsKey（勾选根 + 空目录可见性指纹）与 savedAt：指纹不符或超期（7 天）
 *   直接丢弃，改完设置不再闪一屏旧目录；
 * - 序列化结果超过 2MB 跳过写入，不挤占 storage.local 配额（约 10MB）；
 * - 旧 v1 快照（无指纹、无时间戳、allLinks 重复存储）不再读取，v2 写入成功后顺手清除。
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

/** 快照只对"相同的勾选根 + 空目录可见性"有意义，二者构成指纹 */
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
 * 读取快照。指纹不符、超期、版本不符、形状不对一律返回 null（走真实加载），
 * 绝不向上抛错 —— 否则存储异常会把新标签页的启动流程一起拖死。
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
  // 超大模型不进缓存：既拖慢每个新标签页的首屏解析，也会挤占配额
  if (JSON.stringify(snapshot).length > MAX_SNAPSHOT_BYTES) return;
  try {
    await storageSet('local', SNAPSHOT_KEY, snapshot);
    // 旧版快照已无读取路径，写入成功后清掉孤立项（不存在时为 no-op）
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
 * 写入串行化队列：saveUI 是"读-改-写"，两次并发写入会在 loadUI 与 storageSet
 * 之间交错、互相覆盖丢字段（P1-4）。按调用顺序排队，前一次落盘后才开始下一次。
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
