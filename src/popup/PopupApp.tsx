import { useEffect, useState } from 'react';
import { openNewTab, openOptionsPage } from '../core/chrome';
import { ENGINE_LABELS, buildSearchUrl, stripEnginePrefix } from '../core/search';
import { loadSettings, saveSettings } from '../core/settings';
import { initTheme } from '../core/theme';
import type { Settings } from '../core/types';
import { BootError, describeError } from '../ui/BootError';

const THEME_ORDER = ['system', 'light', 'dark'] as const;
const THEME_ICONS: Record<Settings['theme'], string> = { system: '🌗', light: '☀️', dark: '🌙' };
const THEME_LABELS: Record<Settings['theme'], string> = { system: '跟随系统', light: '浅色', dark: '深色' };

/** 工具栏弹窗：快捷网页搜索 + 设置入口 + 主题切换 */
export default function PopupApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [query, setQuery] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** 重试计数：变化即重新执行一次加载流程 */
  const [bootNonce, setBootNonce] = useState(0);

  /* 加载失败不能停在「正在加载…」上：捕获后交给 BootError 兜底界面 + 重试 */
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const s = await loadSettings();
        if (!alive) return;
        setSettings(s);
        setLoadError(null);
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

  useEffect(() => (settings ? initTheme(settings.theme) : undefined), [settings?.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError) {
    return (
      <div className="popup">
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

  if (!settings) {
    return <div className="popup popup-loading">正在加载…</div>;
  }

  const submit = () => {
    const q = stripEnginePrefix(query).trim();
    if (!q) return;
    openNewTab(buildSearchUrl(settings, q));
    setQuery('');
  };

  const cycleTheme = async () => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(settings.theme) + 1) % THEME_ORDER.length];
    const updated = { ...settings, theme: next };
    setSettings(updated);
    try {
      await saveSettings(updated);
      setSaveError(null);
    } catch (err) {
      // 写 sync 可能因配额/扩展上下文失效而失败，提示而不是静默丢弃
      console.error('[AuraTab] 主题保存失败：', err);
      setSaveError(describeError(err));
    }
  };

  return (
    <div className="popup">
      <header className="popup-head">
        <span className="logo" aria-hidden="true" />
        <span>AuraTab</span>
      </header>

      <div className="searchbox compact">
        <input
          type="text"
          value={query}
          autoFocus
          placeholder={`用 ${ENGINE_LABELS[settings.searchEngine]} 搜索网页`}
          aria-label="网页搜索"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
      </div>

      <div className="popup-actions">
        <button className="btn ghost" onClick={() => openOptionsPage()}>
          ⚙ 设置
        </button>
        <button className="btn ghost" onClick={cycleTheme} title={`主题：${THEME_LABELS[settings.theme]}`}>
          {THEME_ICONS[settings.theme]} {THEME_LABELS[settings.theme]}
        </button>
      </div>

      {saveError && <p className="opt-warn">主题保存失败：{saveError}</p>}

      <p className="popup-note">
        在新标签页按 <kbd>/</kbd> 可搜索书签，<kbd>?</kbd> 前缀直接搜网页
      </p>
    </div>
  );
}
