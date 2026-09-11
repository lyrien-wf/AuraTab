import { useEffect, useState } from 'react';
import { openNewTab, openOptionsPage } from '../core/chrome';
import { ENGINE_LABELS, buildSearchUrl, stripEnginePrefix } from '../core/search';
import { loadSettings, saveSettings } from '../core/settings';
import { initTheme } from '../core/theme';
import type { Settings } from '../core/types';

const THEME_ORDER = ['system', 'light', 'dark'] as const;
const THEME_ICONS: Record<Settings['theme'], string> = { system: '🌗', light: '☀️', dark: '🌙' };
const THEME_LABELS: Record<Settings['theme'], string> = { system: '跟随系统', light: '浅色', dark: '深色' };

/** 工具栏弹窗：快捷网页搜索 + 设置入口 + 主题切换 */
export default function PopupApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  useEffect(() => (settings ? initTheme(settings.theme) : undefined), [settings?.theme]); // eslint-disable-line react-hooks/exhaustive-deps

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
    await saveSettings(updated);
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

      <p className="popup-note">
        在新标签页按 <kbd>/</kbd> 可搜索书签，<kbd>?</kbd> 前缀直接搜网页
      </p>
    </div>
  );
}
