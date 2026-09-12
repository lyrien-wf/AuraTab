import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { loadModel } from '../core/bookmarks';
import { onBookmarksDirty, openOptionsPage } from '../core/chrome';
import { ENGINE_LABELS, buildSearchUrl, isEngineQuery, searchLinks, stripEnginePrefix } from '../core/search';
import { loadSettings, onSettingsChanged, saveSettings } from '../core/settings';
import { loadSnapshot, loadUI, saveSnapshot, saveUI } from '../core/snapshot';
import { initTheme } from '../core/theme';
import type { BookmarkModel, LinkNode, Settings } from '../core/types';
import { navigateCurrent } from '../core/url';
import { BootError, describeError } from '../ui/BootError';
import { BookmarkGrid } from './components/BookmarkGrid';
import { Clock } from './components/Clock';
import { ContextMenu } from './components/ContextMenu';
import { FolderTree } from './components/FolderTree';
import { SearchBox } from './components/SearchBox';

const MIN_SIDEBAR = 240;
const MAX_SIDEBAR = 420;
const DEFAULT_SIDEBAR = 260;

function clampWidth(w: number): number {
  return Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, Math.round(w)));
}

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [model, setModel] = useState<BookmarkModel | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; link: LinkNode } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  /** 重试计数：变化即重新执行一次启动流程 */
  const [bootNonce, setBootNonce] = useState(0);

  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<Settings | null>(null);
  settingsRef.current = settings;

  /** 重新加载模型，尽量保留当前选中目录；失败时保留旧模型并提示，不打断已渲染的界面 */
  const reloadModel = useCallback(async (s: Settings) => {
    try {
      const m = await loadModel(s);
      setModel(m);
      void saveSnapshot(m);
      setSelectedId((prev) => {
        if (prev && m.folderIndex.has(prev)) return prev;
        return [s.defaultFolderId, m.roots[0]?.id].find((id) => id && m.folderIndex.has(id)) ?? null;
      });
    } catch (err) {
      console.error('[AuraTab] 书签刷新失败：', err);
      setToast('书签刷新失败，请稍后重试');
    }
  }, []);

  /* 启动：设置 → 上次 UI 状态 → 快照先渲染 → 真实模型替换（消除白屏）。
     任何一步失败都不能停在「正在加载」上：捕获后交给 BootError 兜底界面 + 重试。 */
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const s = await loadSettings();
        if (!alive) return;
        setSettings(s);

        const ui = await loadUI();
        if (!alive) return;
        if (ui.sidebarWidth) setSidebarWidth(clampWidth(ui.sidebarWidth));

        const snapshot = await loadSnapshot();
        if (alive && snapshot) setModel(snapshot);

        const m = await loadModel(s);
        if (!alive) return;
        setModel(m);
        void saveSnapshot(m);

        const initial =
          [s.defaultFolderId, ui.lastFolderId, m.roots[0]?.id].find((id) => id && m.folderIndex.has(id)) ?? null;
        setSelectedId(initial);
      } catch (err) {
        if (!alive) return;
        console.error('[AuraTab] 初始化失败：', err);
        setBootError(describeError(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, [bootNonce]);

  /* 订阅：后台书签失效广播 + 设置页保存 */
  useEffect(() => {
    const offDirty = onBookmarksDirty(() => {
      const s = settingsRef.current;
      if (s) void reloadModel(s);
    });
    const offSettings = onSettingsChanged((s) => {
      setSettings(s);
      settingsRef.current = s;
      void reloadModel(s);
    });
    return () => {
      offDirty();
      offSettings();
    };
  }, [reloadModel]);

  /* 主题 */
  useEffect(() => (settings ? initTheme(settings.theme) : undefined), [settings?.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 选中目录持久化 + 切换时回到顶部 */
  useEffect(() => {
    if (selectedId) void saveUI({ lastFolderId: selectedId });
    contentRef.current?.scrollTo({ top: 0 });
  }, [selectedId]);

  /* 全局快捷键：/ 聚焦搜索，Esc 关菜单/抽屉 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === 'Escape') {
        if (menu) setMenu(null);
        else if (drawerOpen) setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, drawerOpen]);

  /* toast 自动消失 */
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(timer);
  }, [toast]);

  /* 搜索派生状态 */
  const engineMode = isEngineQuery(query);
  const results = useMemo(() => {
    if (!model || !query.trim() || engineMode) return null;
    return searchLinks(model, query, {
      scope: settings?.searchScope ?? 'all',
      selectedFolderId: selectedId,
    });
  }, [model, query, engineMode, settings?.searchScope, selectedId]);
  const searching = results !== null;
  const visibleLinks = searching
    ? results!
    : model && selectedId
      ? (model.linksByFolder.get(selectedId) ?? [])
      : [];

  const handleSearchEnter = () => {
    if (!settings) return;
    const raw = query.trim();
    if (!raw) return;
    if (engineMode) {
      const q = stripEnginePrefix(raw);
      if (q) location.href = buildSearchUrl(settings, q);
      return;
    }
    // 有结果 → 打开第一条；无结果 → 走搜索引擎
    if (results && results.length > 0) {
      navigateCurrent(results[0].url, settings.allowFileUrls);
      return;
    }
    location.href = buildSearchUrl(settings, raw);
  };

  /* 侧栏拖拽调宽（240–420，宽度存 storage.local） */
  const startResize = (e: ReactMouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    let latest = startW;
    const onMove = (ev: MouseEvent) => {
      latest = clampWidth(startW + ev.clientX - startX);
      setSidebarWidth(latest);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      void saveUI({ sidebarWidth: latest });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.userSelect = 'none';
  };

  const handleCardContextMenu = useCallback((e: ReactMouseEvent, link: LinkNode) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, link });
  }, []);

  /** 页面上的快捷设置修改（搜索引擎、每行卡片数）：本地立即生效并保存到 sync */
  const updateSetting = useCallback(async (patch: Partial<Settings>) => {
    const current = settingsRef.current;
    if (!current) return;
    const next = { ...current, ...patch };
    setSettings(next);
    settingsRef.current = next;
    await saveSettings(next);
  }, []);

  if (bootError) {
    return (
      <BootError
        title="书签加载失败"
        detail={bootError}
        onRetry={() => {
          setBootError(null);
          setBootNonce((n) => n + 1);
        }}
      />
    );
  }

  if (!settings || !model) {
    return (
      <div className="boot">
        <div className="boot-logo" aria-hidden="true" />
        <p>正在加载书签…</p>
      </div>
    );
  }

  const engineLabel = ENGINE_LABELS[settings.searchEngine];

  const renderEmptyState = () => {
    if (model.roots.length === 0) {
      return (
        <div className="empty-state">
          <p>尚未选择收藏夹根目录</p>
          <p className="empty-sub">在设置中勾选「收藏夹栏 / 书签栏」等根目录后，这里会展示你的书签。</p>
          <button className="btn primary" onClick={openOptionsPage}>
            打开设置
          </button>
        </div>
      );
    }
    if (searching) {
      return (
        <div className="empty-state">
          <p>没有找到匹配的书签</p>
          <p className="empty-sub">
            按 Enter 使用 {engineLabel} 搜索「{query.trim()}」
          </p>
        </div>
      );
    }
    const folder = selectedId ? model.folderIndex.get(selectedId) : undefined;
    if (folder && folder.children.length > 0) {
      return (
        <div className="empty-state">
          <p>该目录下没有书签</p>
          <p className="empty-sub">请从左侧选择子目录，或点击下方快捷跳转：</p>
          <div className="empty-children">
            {folder.children.map((child) => (
              <button key={child.id} className="chip" onClick={() => setSelectedId(child.id)}>
                {child.title}
                <span className="chip-count">{child.deepLinkCount}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="empty-state">
        <p>{folder ? '该目录下没有书签' : '从左侧选择一个目录'}</p>
      </div>
    );
  };

  return (
    <div className="layout" data-drawer={drawerOpen ? 'open' : 'closed'}>
      <aside className="sidebar" style={{ width: sidebarWidth }} aria-label="收藏夹">
        <div className="sidebar-head">
          <span className="logo" aria-hidden="true" />
          <span className="app-name">AuraTab</span>
          <button className="icon-btn drawer-only" aria-label="关闭目录" onClick={() => setDrawerOpen(false)}>
            ✕
          </button>
        </div>
        <div className="sidebar-scroll">
          <FolderTree
            roots={model.roots}
            selectedId={selectedId}
            expandDepth={settings.treeDefaultExpandDepth}
            onSelect={(id) => {
              setSelectedId(id);
              setQuery('');
              setDrawerOpen(false);
            }}
          />
        </div>
        <div className="sidebar-foot">
          <button className="btn ghost settings-btn" onClick={openOptionsPage}>
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path
                d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9 4-2 .3a7 7 0 0 1-.7 1.7l1.2 1.6-1.4 1.4-1.6-1.2a7 7 0 0 1-1.7.7L15 21h-2l-.3-2a7 7 0 0 1-1.7-.7l-1.6 1.2-1.4-1.4L9.2 16a7 7 0 0 1-.7-1.7L6 14v-2l2.5-.3a7 7 0 0 1 .7-1.7L8 8.4 9.4 7l1.6 1.2a7 7 0 0 1 1.7-.7L13 5h2l.3 2.5c.6.2 1.2.4 1.7.7L18.6 7 20 8.4l-1.2 1.6c.3.5.5 1.1.7 1.7L22 12Z"
                fill="currentColor"
              />
            </svg>
            设置
          </button>
        </div>
      </aside>

      <div className="resizer" onMouseDown={startResize} role="separator" aria-orientation="vertical" />
      <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />

      <main className="main">
        <button className="icon-btn hamburger drawer-only" aria-label="打开目录" onClick={() => setDrawerOpen(true)}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z" fill="currentColor" />
          </svg>
        </button>

        <label className="perrow-picker" title="每行显示的书签卡片数">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path d="M3 5h8v6H3V5Zm10 0h8v6h-8V5ZM3 13h8v6H3v-6Zm10 0h8v6h-8v-6Z" fill="currentColor" />
          </svg>
          <select
            aria-label="每行书签卡片数"
            value={String(settings.cardsPerRowHint)}
            onChange={(e) => {
              const v = e.target.value;
              void updateSetting({ cardsPerRowHint: v === 'auto' ? 'auto' : (Number(v) as 6 | 8 | 10) });
            }}
          >
            <option value="auto">自动</option>
            <option value="6">6 个</option>
            <option value="8">8 个</option>
            <option value="10">10 个</option>
          </select>
        </label>

        <div className="content" ref={contentRef}>
          <div className="hero">
            <Clock cfg={settings.clock} />
            <SearchBox
              query={query}
              onChange={setQuery}
              onEnter={handleSearchEnter}
              onEsc={() => {
                setQuery('');
                searchRef.current?.blur();
              }}
              engineMode={engineMode}
              engine={settings.searchEngine}
              onSelectEngine={(engine) => void updateSetting({ searchEngine: engine })}
              inputRef={searchRef}
            />
            {searching && (
              <div className="result-meta" aria-live="polite">
                共 {results!.length} 条结果
                <button className="link-btn" onClick={() => setQuery('')}>
                  清空
                </button>
              </div>
            )}
          </div>

          {visibleLinks.length > 0 ? (
            <BookmarkGrid
              links={visibleLinks}
              perRow={settings.cardsPerRowHint}
              allowFileUrls={settings.allowFileUrls}
              scrollParentRef={contentRef}
              onCardContextMenu={handleCardContextMenu}
            />
          ) : (
            renderEmptyState()
          )}
        </div>
      </main>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          link={menu.link}
          allowFileUrls={settings.allowFileUrls}
          onClose={() => setMenu(null)}
          onToast={setToast}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
