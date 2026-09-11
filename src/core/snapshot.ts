/**
 * 模型快照缓存（chrome.storage.local）。
 * 首次渲染前读取上次快照先行渲染，再用真实数据替换，消除白屏（文档第 8 章）。
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

export async function loadSnapshot(): Promise<BookmarkModel | null> {
  const snap = await storageGet<ModelSnapshot>('local', SNAPSHOT_KEY);
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
  return (await storageGet<UIState>('local', UI_KEY)) ?? {};
}

export async function saveUI(patch: UIState): Promise<void> {
  const prev = await loadUI();
  await storageSet('local', UI_KEY, { ...prev, ...patch });
}
