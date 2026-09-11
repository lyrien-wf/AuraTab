/** 数据模型与设置类型定义 */

export interface FolderNode {
  id: string;
  title: string;
  parentId?: string;
  /** 相对所选根文件夹，根为 0 */
  depth: number;
  /** 子目录（仅目录，不含书签） */
  children: FolderNode[];
  /** 本目录下直接书签数量，用于树上角标 */
  linkCount: number;
  /** 递归统计的书签总数，用于「是否为空目录」判断 */
  deepLinkCount: number;
}

export interface LinkNode {
  id: string;
  title: string;
  url: string;
  parentId: string;
  /** 从 url 解析（去掉 www. 前缀），用于图标与降级首字母 */
  domain: string;
  dateAdded?: number;
}

/** 一次解析的产物 */
export interface BookmarkModel {
  /** 用户选中的根文件夹（可多选） */
  roots: FolderNode[];
  folderIndex: Map<string, FolderNode>;
  /** key = folderId，仅直接子书签（核心展示规则：不含子目录、不平铺子目录书签） */
  linksByFolder: Map<string, LinkNode[]>;
  /** 供全局搜索 */
  allLinks: LinkNode[];
}

export type SearchEngine = 'bing' | 'google' | 'baidu' | 'custom';

export interface ClockSettings {
  format24h: boolean;
  showSeconds: boolean;
  showDate: boolean;
}

export interface Settings {
  /** 用户勾选的根文件夹 id，首次运行默认 = 第一个根（书签栏 / 收藏夹栏） */
  enabledRootIds: string[];
  /** 打开主页时默认选中的目录 */
  defaultFolderId?: string;
  /** 默认 false：递归无书签的目录不显示 */
  showEmptyFolders: boolean;
  treeDefaultExpandDepth: number;
  searchScope: 'current' | 'all';
  searchEngine: SearchEngine;
  /** 含 %s 占位符 */
  customSearchUrl?: string;
  cardsPerRowHint: 'auto' | 6 | 8 | 10;
  theme: 'system' | 'light' | 'dark';
  clock: ClockSettings;
  /** 是否允许打开 file: 协议书签，默认 false（安全策略：默认拦截，可配置放开） */
  allowFileUrls: boolean;
}

/** Service Worker 广播的书签失效事件 */
export const BOOKMARKS_DIRTY = 'BOOKMARKS_DIRTY';
