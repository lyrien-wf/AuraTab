import { useEffect, useState } from 'react';
import { buildModel, flattenFolders, listRootFolders, type RootFolderInfo } from '../core/bookmarks';
import { getTree } from '../core/chrome';
import { loadSettings, resetSettings, saveSettings } from '../core/settings';
import { initTheme } from '../core/theme';
import type { ClockSettings, FolderNode, Settings } from '../core/types';
import { BootError, describeError } from '../ui/BootError';

/** 设置页：根文件夹选择、外观、搜索引擎等 */
export default function OptionsApp() {
  const [draft, setDraft] = useState<Settings | null>(null);
  const [roots, setRoots] = useState<RootFolderInfo[]>([]);
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** 重试计数：变化即重新执行一次加载流程 */
  const [bootNonce, setBootNonce] = useState(0);

  /* 加载失败不能停在「正在加载设置…」上：捕获后交给 BootError 兜底界面 + 重试 */
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const s = await loadSettings();
        if (!alive) return;
        setDraft(s);
        const list = await listRootFolders();
        if (!alive) return;
        setRoots(list);
      } catch (err) {
        if (!alive) return;
        console.error('[AuraTab] 设置加载失败：', err);
        setLoadError(describeError(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, [bootNonce]);

  // 「默认目录」候选：当前勾选根目录下的全部文件夹（含空目录，便于自由选择）
  const rootsKey = draft?.enabledRootIds.join(',') ?? '';
  useEffect(() => {
    if (!draft || rootsKey === '') {
      setFolders([]);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const [root] = await getTree();
        const model = buildModel(root?.children ?? [], {
          enabledRootIds: draft.enabledRootIds,
          showEmptyFolders: true,
        });
        if (!alive) return;
        setFolders(flattenFolders(model.roots));
      } catch (err) {
        // 候选目录只是下拉框的可选项，失败时退化为「只显示（不指定）」
        if (!alive) return;
        console.error('[AuraTab] 默认目录候选加载失败：', err);
        setFolders([]);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootsKey]);

  // 主题实时预览
  useEffect(() => (draft ? initTheme(draft.theme) : undefined), [draft?.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  if (loadError) {
    return (
      <div className="options-page">
        <BootError
          title="设置加载失败"
          detail={loadError}
          onRetry={() => {
            setLoadError(null);
            setBootNonce((n) => n + 1);
          }}
        />
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="options-page">
        <p className="opt-desc">正在加载设置…</p>
      </div>
    );
  }

  const update = (patch: Partial<Settings>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const updateClock = (patch: Partial<ClockSettings>) =>
    setDraft((d) => (d ? { ...d, clock: { ...d.clock, ...patch } } : d));
  const toggleRoot = (id: string) =>
    setDraft((d) => {
      if (!d) return d;
      const has = d.enabledRootIds.includes(id);
      return {
        ...d,
        enabledRootIds: has ? d.enabledRootIds.filter((x) => x !== id) : [...d.enabledRootIds, id],
      };
    });

  const onSave = async () => {
    try {
      await saveSettings(draft);
      setSaveError(null);
      setSaved(true);
    } catch (err) {
      // 写 sync 可能因配额/扩展上下文失效而失败，不能让用户误以为已保存
      console.error('[AuraTab] 设置保存失败：', err);
      setSaveError(describeError(err));
      setSaved(false);
    }
  };
  const onReset = async () => {
    try {
      const fresh = await resetSettings();
      setDraft(fresh);
      setSaveError(null);
      setSaved(true);
    } catch (err) {
      console.error('[AuraTab] 恢复默认失败：', err);
      setSaveError(describeError(err));
    }
  };

  return (
    <div className="options-page">
      <header className="opt-header">
        <span className="logo" aria-hidden="true" />
        <h1>AuraTab 设置</h1>
      </header>

      <section className="opt-section">
        <h2>收藏夹根目录</h2>
        <p className="opt-desc">
          勾选要展示在主页左侧目录树中的根文件夹（Edge 为「收藏夹栏」等，Chrome 为「书签栏」等，id 动态读取，不硬编码）。
        </p>
        {roots.map((r) => (
          <label className="root-item" key={r.id}>
            <input type="checkbox" checked={draft.enabledRootIds.includes(r.id)} onChange={() => toggleRoot(r.id)} />
            <span className="root-title">{r.title || `根文件夹 ${r.id}`}</span>
            <span className="root-count">{r.childCount} 项</span>
          </label>
        ))}
        {roots.length === 0 && <p className="opt-desc">未检测到任何根文件夹。</p>}
      </section>

      <section className="opt-section">
        <h2>默认打开目录</h2>
        <p className="opt-desc">打开新标签页时默认选中的目录；不选则使用上次浏览的目录。</p>
        <div className="opt-row">
          <select
            className="input folder-select"
            value={draft.defaultFolderId ?? ''}
            onChange={(e) => update({ defaultFolderId: e.target.value || undefined })}
          >
            <option value="">（不指定）</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {'　'.repeat(f.depth) + (f.depth > 0 ? '└ ' : '') + f.title}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="opt-section">
        <h2>目录树</h2>
        <div className="opt-row">
          <label>
            <input
              type="checkbox"
              checked={draft.showEmptyFolders}
              onChange={(e) => update({ showEmptyFolders: e.target.checked })}
            />{' '}
            显示空目录（递归无书签的目录）
          </label>
        </div>
        <div className="opt-row">
          <label htmlFor="expandDepth">默认展开层级</label>
          <input
            id="expandDepth"
            className="input num"
            type="number"
            min={0}
            max={5}
            value={draft.treeDefaultExpandDepth}
            onChange={(e) =>
              update({ treeDefaultExpandDepth: Math.min(5, Math.max(0, Number(e.target.value) || 0)) })
            }
          />
        </div>
      </section>

      <section className="opt-section">
        <h2>搜索</h2>
        <div className="opt-row">
          <span>搜索范围</span>
          <label>
            <input
              type="radio"
              name="scope"
              checked={draft.searchScope === 'all'}
              onChange={() => update({ searchScope: 'all' })}
            />{' '}
            全部书签
          </label>
          <label>
            <input
              type="radio"
              name="scope"
              checked={draft.searchScope === 'current'}
              onChange={() => update({ searchScope: 'current' })}
            />{' '}
            当前目录
          </label>
        </div>
        <div className="opt-row">
          <label htmlFor="engine">搜索引擎（? 前缀 / 无结果时 Enter 跳转）</label>
          <select
            id="engine"
            className="input"
            value={draft.searchEngine}
            onChange={(e) => update({ searchEngine: e.target.value as Settings['searchEngine'] })}
          >
            <option value="bing">Bing</option>
            <option value="google">Google</option>
            <option value="baidu">百度</option>
            <option value="custom">自定义</option>
          </select>
        </div>
        {draft.searchEngine === 'custom' && (
          <div className="opt-row column">
            <input
              className="input wide"
              type="text"
              placeholder="https://example.com/search?q=%s（%s 为关键词占位符）"
              value={draft.customSearchUrl ?? ''}
              onChange={(e) => update({ customSearchUrl: e.target.value })}
            />
            {!draft.customSearchUrl?.includes('%s') && (
              <span className="opt-warn">自定义搜索地址必须包含 %s 占位符，否则回退 Bing。</span>
            )}
          </div>
        )}
      </section>

      <section className="opt-section">
        <h2>外观</h2>
        <div className="opt-row">
          <label htmlFor="theme">主题</label>
          <select
            id="theme"
            className="input"
            value={draft.theme}
            onChange={(e) => update({ theme: e.target.value as Settings['theme'] })}
          >
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>
        <div className="opt-row">
          <label htmlFor="perRow">每行卡片数</label>
          <select
            id="perRow"
            className="input"
            value={String(draft.cardsPerRowHint)}
            onChange={(e) => {
              const v = e.target.value;
              update({ cardsPerRowHint: v === 'auto' ? 'auto' : (Number(v) as 6 | 8 | 10) });
            }}
          >
            <option value="auto">自动</option>
            <option value="6">6</option>
            <option value="8">8</option>
            <option value="10">10</option>
          </select>
        </div>
      </section>

      <section className="opt-section">
        <h2>时钟</h2>
        <div className="opt-row">
          <label>
            <input
              type="checkbox"
              checked={draft.clock.format24h}
              onChange={(e) => updateClock({ format24h: e.target.checked })}
            />{' '}
            24 小时制
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.clock.showSeconds}
              onChange={(e) => updateClock({ showSeconds: e.target.checked })}
            />{' '}
            显示秒
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.clock.showDate}
              onChange={(e) => updateClock({ showDate: e.target.checked })}
            />{' '}
            显示日期
          </label>
        </div>
      </section>

      <section className="opt-section">
        <h2>高级</h2>
        <div className="opt-row">
          <label>
            <input
              type="checkbox"
              checked={draft.allowFileUrls}
              onChange={(e) => update({ allowFileUrls: e.target.checked })}
            />{' '}
            允许打开 file: 协议书签（默认拦截；javascript: 等伪协议始终拦截）
          </label>
        </div>
      </section>

      <div className="save-bar">
        {saved && <span className="saved-tip">✓ 已保存，新标签页会实时生效</span>}
        {saveError && <span className="opt-warn">保存失败：{saveError}</span>}
        <button className="btn ghost" onClick={onReset}>
          恢复默认
        </button>
        <button className="btn primary" onClick={onSave}>
          保存
        </button>
      </div>
    </div>
  );
}
