/**
 * 模型快照缓存（chrome.storage.local）。
 * 首次渲染前读取上次快照先行渲染，再用真实数据替换，消除白屏。
 */
import { storageGet, storageSet } from './chrome';
import type { BookmarkModel, FolderNode, LinkNode } from './types';

const SNAPSHOT_KEY = 'modelSnapshot.v1';
const UI_KEY = 'ui.v1';

export interface ModelSnapshot {
  v: 1;
  roots: FolderNode[];
  links: [string, LinkNode[]][];
  allLinks: LinkNode[];
}

export interface UIState {
  sidebarWidth?: number;
  lastFolderId?: string;
}

export function serializeModel(model: BookmarkModel): ModelSnapshot {
  return {
    v: 1,
    roots: model.roots,
    links: [...model.linksByFolder.entries()],
    allLinks: model.allLinks,
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
  return {
    roots: snapshot.roots ?? [],
    folderIndex,
    linksByFolder: new Map(snapshot.links ?? []),
    allLinks: snapshot.allLinks ?? [],
  };
}

/**
 * 快照是纯优化：读写失败一律降级（读不到就当没有缓存，写不进就放弃缓存），
 * 绝不向上抛错 —— 否则存储异常会把新标签页的启动流程一起拖死。
 */
export async function loadSnapshot(): Promise<BookmarkModel | null> {
  let snap: ModelSnapshot | undefined;
  try {
    snap = await storageGet<ModelSnapshot>('local', SNAPSHOT_KEY);
  } catch {
    return null;
  }
  if (!snap || snap.v !== 1) return null;
  try {
    return reviveModel(snap);
  } catch {
    return null;
  }
}

export async function saveSnapshot(model: BookmarkModel): Promise<void> {
  try {
    await storageSet('local', SNAPSHOT_KEY, serializeModel(model));
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

export async function saveUI(patch: UIState): Promise<void> {
  try {
    const prev = await loadUI();
    await storageSet('local', UI_KEY, { ...prev, ...patch });
  } catch {
    // UI 状态只是体验优化（记忆侧栏宽度与上次目录），写失败不影响使用
  }
}
