import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { ENGINE_LABELS } from '../../core/search';
import type { SearchEngine } from '../../core/types';
import { EngineIcon } from './EngineIcon';

const ENGINES: SearchEngine[] = ['bing', 'google', 'baidu', 'custom'];

interface SearchBoxProps {
  query: string;
  onChange: (query: string) => void;
  onEnter: () => void;
  onEsc: () => void;
  engineMode: boolean;
  engine: SearchEngine;
  onSelectEngine: (engine: SearchEngine) => void;
  inputRef: RefObject<HTMLInputElement>;
}

/**
 * 双职责搜索框：
 * - 常规输入 → 本地过滤书签；
 * - `?` 前缀 → Enter 跳转搜索引擎结果页；
 * - 左侧图标为当前搜索引擎，点击下拉快速切换（立即保存到设置）。
 */
export function SearchBox({
  query,
  onChange,
  onEnter,
  onEsc,
  engineMode,
  engine,
  onSelectEngine,
  inputRef,
}: SearchBoxProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // 下拉打开时：点击外部 / Esc 关闭
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div className="search-wrap">
      <div className={`searchbox${engineMode ? ' engine-mode' : ''}`}>
        <div className="engine-picker" ref={pickerRef}>
          <button
            type="button"
            className="engine-btn"
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            aria-label={`搜索引擎：${ENGINE_LABELS[engine]}，点击切换`}
            title={`搜索引擎：${ENGINE_LABELS[engine]}（点击切换）`}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <EngineIcon engine={engine} size={18} />
          </button>
          {menuOpen && (
            <div className="engine-menu" role="listbox" aria-label="选择搜索引擎">
              {ENGINES.map((e) => (
                <button
                  key={e}
                  type="button"
                  role="option"
                  aria-selected={e === engine}
                  className={e === engine ? 'active' : ''}
                  onClick={() => {
                    onSelectEngine(e);
                    setMenuOpen(false);
                  }}
                >
                  <EngineIcon engine={e} size={16} />
                  <span className="engine-name">{ENGINE_LABELS[e]}</span>
                  {e === engine && <span className="engine-check" aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="搜索书签或网页（? 前缀直接用搜索引擎）"
          aria-label="搜索书签或网页"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onEnter();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              onEsc();
            }
          }}
        />
        {query && (
          <button className="search-clear" aria-label="清空搜索" onClick={() => onChange('')}>
            ✕
          </button>
        )}
      </div>
      {engineMode && <div className="search-hint">按 Enter 使用 {ENGINE_LABELS[engine]} 搜索</div>}
    </div>
  );
}
