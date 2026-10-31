import type { MouseEvent } from 'react';
import type { LinkNode } from '../../core/types';
import { isSafeUrl } from '../../core/url';
import { Favicon } from './Favicon';

interface BookmarkCardProps {
  link: LinkNode;
  allowFileUrls: boolean;
  openInNewTab: boolean;
  onContextMenu: (e: MouseEvent, link: LinkNode) => void;
}

/**
 * 书签卡片：<a href> 天然支持「点击当前页打开、Ctrl/Cmd+点击与中键后台新标签页」。
 * 不安全协议（javascript: 等）不渲染 href，标记「已拦截」。
 */
export function BookmarkCard({ link, allowFileUrls, openInNewTab, onContextMenu }: BookmarkCardProps) {
  const safe = isSafeUrl(link.url, allowFileUrls);
  const displayTitle = link.title || link.domain || link.url;

  return (
    <div className="cell" role="listitem">
      <a
        className={`card${safe ? '' : ' blocked'}`}
        href={safe ? link.url : undefined}
        target={safe && openInNewTab ? '_blank' : undefined}
        /* 无 href 的 <a> 不可聚焦：补 link 语义与禁用状态，保证键盘和读屏可达 */
        role="link"
        tabIndex={safe ? undefined : 0}
        aria-disabled={safe ? undefined : true}
        title={`${link.title}\n${link.url}`}
        aria-label={displayTitle}
        onClick={(e) => {
          if (!safe) e.preventDefault();
        }}
        onContextMenu={(e) => onContextMenu(e, link)}
      >
        <Favicon link={link} />
        <span className="card-title">{displayTitle}</span>
        {!safe && <span className="card-blocked">已拦截</span>}
      </a>
    </div>
  );
}
