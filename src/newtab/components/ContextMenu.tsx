import { useEffect, useRef } from 'react';
import { openNewTab } from '../../core/chrome';
import type { LinkNode } from '../../core/types';
import { isSafeUrl } from '../../core/url';

interface ContextMenuProps {
  x: number;
  y: number;
  link: LinkNode;
  allowFileUrls: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

const MENU_W = 190;
const MENU_H = 118;

/** 卡片右键菜单（v1 只读：在新标签页打开 / 复制链接） */
export function ContextMenu({ x, y, link, allowFileUrls, onClose, onToast }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  const safe = isSafeUrl(link.url, allowFileUrls);
  const left = Math.max(4, Math.min(x, window.innerWidth - MENU_W - 4));
  const top = Math.max(4, Math.min(y, window.innerHeight - MENU_H - 4));

  return (
    <div className="ctx-menu" ref={ref} style={{ left, top }} role="menu">
      <button
        role="menuitem"
        disabled={!safe}
        onClick={() => {
          openNewTab(link.url);
          onClose();
        }}
      >
        在新标签页打开
      </button>
      <button
        role="menuitem"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link.url);
            onToast('链接已复制');
          } catch {
            onToast('复制失败');
          }
          onClose();
        }}
      >
        复制链接
      </button>
      <div className="ctx-url" title={link.url}>
        {link.url}
      </div>
    </div>
  );
}
