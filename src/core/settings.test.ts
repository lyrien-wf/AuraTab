import { afterEach, describe, expect, it } from 'vitest';
import { installChromeMock, type ChromeMock } from '../test/mock-chrome';
import type { BookmarkTreeNode } from './chrome';
import { buildModel, loadModel } from './bookmarks';
import { buildSearchUrl } from './search';
import { DEFAULT_SETTINGS, loadSettings, mergeSettings, saveSettings } from './settings';
import type { Settings } from './types';

const TREE: BookmarkTreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      { id: '1', title: '收藏夹栏', children: [{ id: '11', title: 'Claude', url: 'https://claude.ai' }] },
      { id: '2', title: '其他收藏夹', children: [{ id: '21', title: 'MDN', url: 'https://developer.mozilla.org' }] },
      { id: '3', title: '移动收藏夹', children: [] },
    ],
  },
];

let mock: ChromeMock | null = null;

afterEach(() => {
  mock?.uninstall();
  mock = null;
});

describe('loadSettings', () => {
  it('首次运行：默认勾选第一个根文件夹（动态 id，不硬编码）并写入存储', async () => {
    mock = installChromeMock({ tree: TREE });
    const s = await loadSettings();
    expect(s.enabledRootIds).toEqual(['1']);
    expect(s.searchEngine).toBe(DEFAULT_SETTINGS.searchEngine);
    expect(mock.store.sync.get('settings')).toBeTruthy();
  });

  it('已保存空勾选时尊重用户选择，不再自动回填', async () => {
    mock = installChromeMock({ tree: TREE, syncData: { settings: { enabledRootIds: [] } } });
    const s = await loadSettings();
    expect(s.enabledRootIds).toEqual([]);
    // 其余字段用默认值补齐
    expect(s.showEmptyFolders).toBe(false);
    expect(s.clock).toEqual(DEFAULT_SETTINGS.clock);
  });

  it('设置 → 模型联动：只勾选的根进入模型', async () => {
    mock = installChromeMock({ tree: TREE });
    const s = await loadSettings();
    const m = await loadModel(s);
    expect(m.roots.map((r) => r.id)).toEqual(['1']);
    expect(m.allLinks.map((l) => l.title)).toEqual(['Claude']);
  });
});

describe('mergeSettings', () => {
  it('clock 深合并，旧版本缺字段可容忍', () => {
    const merged = mergeSettings({ clock: { showSeconds: true } as Partial<Settings['clock']> as Settings['clock'] });
    expect(merged.clock).toEqual({ format24h: true, showSeconds: true, showDate: true });
  });

  it('顶层字段覆盖默认值', () => {
    const merged = mergeSettings({ searchEngine: 'google', cardsPerRowHint: 6 });
    expect(merged.searchEngine).toBe('google');
    expect(merged.cardsPerRowHint).toBe(6);
    expect(merged.theme).toBe('system');
  });

  it('旧版非法每行卡片数（4/5）归一化为 auto，新值 6/8/10 保留', () => {
    expect(mergeSettings({ cardsPerRowHint: 4 as unknown as Settings['cardsPerRowHint'] }).cardsPerRowHint).toBe('auto');
    expect(mergeSettings({ cardsPerRowHint: 5 as unknown as Settings['cardsPerRowHint'] }).cardsPerRowHint).toBe('auto');
    expect(mergeSettings({ cardsPerRowHint: 10 }).cardsPerRowHint).toBe(10);
    expect(mergeSettings({ cardsPerRowHint: 'auto' }).cardsPerRowHint).toBe('auto');
  });
});

/**
 * 这些用例锁定的是「脏设置不能再把页面搞崩」：
 * storage.sync 可能是旧版本、其他设备或手工改过的内容，非法值必须在读取时就归一回默认。
 */
describe('mergeSettings 脏数据归一化', () => {
  it('非法 searchEngine 回退 bing，且 buildSearchUrl 不再抛错', () => {
    const merged = mergeSettings({ searchEngine: 'yandex' as unknown as Settings['searchEngine'] });
    expect(merged.searchEngine).toBe('bing');
    expect(() => buildSearchUrl(merged, 'x')).not.toThrow();
    expect(buildSearchUrl(merged, 'x')).toBe('https://www.bing.com/search?q=x');
  });

  it('非法 theme / searchScope 回退默认值', () => {
    const merged = mergeSettings({
      theme: 'purple' as unknown as Settings['theme'],
      searchScope: 'folder' as unknown as Settings['searchScope'],
    });
    expect(merged.theme).toBe('system');
    expect(merged.searchScope).toBe('all');
  });

  it('enabledRootIds 非数组时归一化为空数组，buildModel 不再抛 TypeError', () => {
    const merged = mergeSettings({ enabledRootIds: 3 as unknown as string[] });
    expect(merged.enabledRootIds).toEqual([]);
    expect(() => buildModel(TREE, merged)).not.toThrow();
  });

  it('enabledRootIds 里的脏元素被剔除', () => {
    const merged = mergeSettings({ enabledRootIds: ['1', 2, '', null] as unknown as string[] });
    expect(merged.enabledRootIds).toEqual(['1']);
  });

  it('treeDefaultExpandDepth 越界夹紧到 0–5，非数字回退默认值', () => {
    expect(mergeSettings({ treeDefaultExpandDepth: 99 }).treeDefaultExpandDepth).toBe(5);
    expect(mergeSettings({ treeDefaultExpandDepth: -3 }).treeDefaultExpandDepth).toBe(0);
    expect(mergeSettings({ treeDefaultExpandDepth: Number.NaN }).treeDefaultExpandDepth).toBe(1);
    expect(mergeSettings({ treeDefaultExpandDepth: '2' as unknown as number }).treeDefaultExpandDepth).toBe(1);
  });

  it('clock 字段非布尔时回退默认值，clock 本身不是对象也不崩', () => {
    expect(mergeSettings({ clock: { showSeconds: 'yes' } as unknown as Settings['clock'] }).clock).toEqual(
      DEFAULT_SETTINGS.clock,
    );
    expect(mergeSettings({ clock: 5 as unknown as Settings['clock'] }).clock).toEqual(DEFAULT_SETTINGS.clock);
  });

  it('defaultFolderId 为空串 / 非字符串时视为未设置', () => {
    expect(mergeSettings({ defaultFolderId: '' }).defaultFolderId).toBeUndefined();
    expect(mergeSettings({ defaultFolderId: 7 as unknown as string }).defaultFolderId).toBeUndefined();
  });

  it('未知字段原样透传，避免旧版本抹掉未来版本新增的设置项', () => {
    const merged = mergeSettings({ background: { kind: 'picsum' } } as unknown as Partial<Settings>);
    expect((merged as unknown as Record<string, unknown>).background).toEqual({ kind: 'picsum' });
    expect(merged.theme).toBe('system');
  });

  it('存储里是脏值（非对象）时按首次运行处理，回填第一个根目录', async () => {
    mock = installChromeMock({ tree: TREE, syncData: { settings: 42 } });
    const s = await loadSettings();
    expect(s.enabledRootIds).toEqual(['1']);
    expect(s.searchEngine).toBe(DEFAULT_SETTINGS.searchEngine);
  });
});

describe('saveSettings', () => {
  it('保存到 sync 区并可回读', async () => {
    mock = installChromeMock({ tree: TREE });
    const s = await loadSettings();
    const next: Settings = { ...s, searchEngine: 'baidu', treeDefaultExpandDepth: 2 };
    await saveSettings(next);
    const again = await loadSettings();
    expect(again.searchEngine).toBe('baidu');
    expect(again.treeDefaultExpandDepth).toBe(2);
    expect(again.enabledRootIds).toEqual(['1']);
  });
});
