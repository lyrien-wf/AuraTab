/**
 * 书签读取 / 过滤 / 转换。
 *
 * 核心展示规则：
 * - 文件夹只进入左侧树（FolderNode.children）；
 * - linksByFolder 只包含某目录的「直接子书签」，不含子目录、不平铺子目录的书签。
 */
import { getTree, type BookmarkTreeNode } from './chrome';
import type { BookmarkModel, FolderNode, LinkNode, Settings } from './types';

/** 从 url 解析域名（去掉 www. 前缀），失败返回空串 */
export function parseDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export interface RootFolderInfo {
  id: string;
  title: string;
  childCount: number;
}

/** 获取根文件夹列表（设置页用）。不硬编码 id，动态取 tree[0].children */
export async function listRootFolders(): Promise<RootFolderInfo[]> {
  const [root] = await getTree();
  return (root?.children ?? [])
    .filter((n) => !n.url)
    .map((n) => ({ id: n.id, title: n.title, childCount: n.children?.length ?? 0 }));
}

type ModelSettings = Pick<Settings, 'enabledRootIds' | 'showEmptyFolders'>;

/**
 * 纯函数：从根节点的 children 构建模型（便于单元测试）。
 * 保持浏览器返回的原始顺序，不额外排序。
 */
export function buildModel(rootChildren: BookmarkTreeNode[], settings: ModelSettings): BookmarkModel {
  const linksByFolder = new Map<string, LinkNode[]>();
  const allLinks: LinkNode[] = [];

  function visitFolder(node: BookmarkTreeNode, parentId: string | undefined, depth: number): FolderNode {
    const folder: FolderNode = {
      id: node.id,
      title: node.title || '未命名文件夹',
      parentId,
      depth,
      children: [],
      linkCount: 0,
      deepLinkCount: 0,
    };
    const links: LinkNode[] = [];
    for (const child of node.children ?? []) {
      if (child.url !== undefined && child.url !== null) {
        const link: LinkNode = {
          id: child.id,
          title: child.title || child.url,
          url: child.url,
          parentId: node.id,
          domain: parseDomain(child.url),
          dateAdded: child.dateAdded,
        };
        links.push(link);
        allLinks.push(link);
      } else {
        folder.children.push(visitFolder(child, node.id, depth + 1));
      }
    }
    folder.linkCount = links.length;
    if (links.length > 0) linksByFolder.set(node.id, links);
    folder.deepLinkCount = links.length + folder.children.reduce((sum, c) => sum + c.deepLinkCount, 0);
    return folder;
  }

  const selectedRoots = rootChildren.filter(
    (n) => n.url === undefined && settings.enabledRootIds.includes(n.id),
  );
  let roots = selectedRoots.map((n) => visitFolder(n, undefined, 0));

  const removedIds = new Set<string>();
  if (!settings.showEmptyFolders) {
    roots = pruneEmpty(roots, removedIds);
    for (const id of removedIds) linksByFolder.delete(id);
  }

  // folderIndex 只登记「树中可见」的目录，供选中校验 / O(1) 查表
  const folderIndex = new Map<string, FolderNode>();
  for (const root of roots) indexTree(root, folderIndex);

  return { roots, folderIndex, linksByFolder, allLinks };
}

/** 递归移除 deepLinkCount === 0 的目录（showEmptyFolders=false 时） */
function pruneEmpty(folders: FolderNode[], removedIds: Set<string>): FolderNode[] {
  const kept: FolderNode[] = [];
  for (const f of folders) {
    f.children = pruneEmpty(f.children, removedIds);
    f.deepLinkCount = f.linkCount + f.children.reduce((sum, c) => sum + c.deepLinkCount, 0);
    if (f.deepLinkCount === 0) removedIds.add(f.id);
    else kept.push(f);
  }
  return kept;
}

function indexTree(folder: FolderNode, index: Map<string, FolderNode>): void {
  index.set(folder.id, folder);
  for (const child of folder.children) indexTree(child, index);
}

/** 读取全树并构建模型。getTree 一次拿全树，不做多次 getChildren（避免 N+1） */
export async function loadModel(settings: Settings): Promise<BookmarkModel> {
  const [root] = await getTree();
  return buildModel(root?.children ?? [], settings);
}

/** 深度优先展开目录列表（设置页「默认目录」下拉框用），title 带缩进 */
export function flattenFolders(roots: FolderNode[]): FolderNode[] {
  const out: FolderNode[] = [];
  const walk = (nodes: FolderNode[]) => {
    for (const n of nodes) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(roots);
  return out;
}
