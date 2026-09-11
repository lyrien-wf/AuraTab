import { useEffect, useMemo, useState } from 'react';
import { faviconUrl } from '../../core/chrome';
import type { LinkNode } from '../../core/types';

/** 域名 → 稳定的色相，用于降级首字母色块 */
export function colorForSeed(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  }
  return `hsl(${h % 360} 58% 46%)`;
}

/**
 * 站点图标：优先扩展 _favicon 端点（本地缓存，无外部请求），
 * 失败或非扩展环境降级为域名首字母色块。
 */
export function Favicon({ link }: { link: LinkNode }) {
  const src = useMemo(() => faviconUrl(link.url, 32), [link.url]);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [link.url]);

  if (src && !failed) {
    return (
      <img
        className="favicon"
        src={src}
        width={32}
        height={32}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }

  const seed = link.domain || link.title || link.url || '?';
  const letter = (link.title || link.domain || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <span className="favicon favicon-letter" style={{ background: colorForSeed(seed) }} aria-hidden="true">
      {letter}
    </span>
  );
}
