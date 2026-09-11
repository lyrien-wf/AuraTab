import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { LinkNode, Settings } from '../../core/types';
import { BookmarkCard } from './BookmarkCard';

/** 超过 300 条启用虚拟滚动（文档第 8 章） */
const VIRTUAL_THRESHOLD = 300;
const CARD_HEIGHT = 104;
const GAP = 12;
const ROW_HEIGHT = CARD_HEIGHT + GAP;
const MIN_CARD_WIDTH = 148;

interface BookmarkGridProps {
  links: LinkNode[];
  perRow: Settings['cardsPerRowHint'];
  allowFileUrls: boolean;
  scrollParentRef: RefObject<HTMLDivElement>;
  onCardContextMenu: (e: ReactMouseEvent, link: LinkNode) => void;
}

export function BookmarkGrid(props: BookmarkGridProps) {
  if (props.links.length > VIRTUAL_THRESHOLD) return <VirtualGrid {...props} />;
  return <SimpleGrid {...props} />;
}

function gridColumns(perRow: Settings['cardsPerRowHint']): CSSProperties {
  return perRow === 'auto' ? {} : { gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` };
}

function SimpleGrid({ links, perRow, allowFileUrls, onCardContextMenu }: BookmarkGridProps) {
  return (
    <div className="grid" role="list" style={gridColumns(perRow)}>
      {links.map((link) => (
        <BookmarkCard key={link.id} link={link} allowFileUrls={allowFileUrls} onContextMenu={onCardContextMenu} />
      ))}
    </div>
  );
}

/**
 * 虚拟滚动网格：外层滚动容器是页面内容区（.content），
 * 用 scrollMargin 抵消网格在滚动容器内的偏移。
 */
function VirtualGrid({ links, perRow, allowFileUrls, scrollParentRef, onCardContextMenu }: BookmarkGridProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(6);
  const [scrollMargin, setScrollMargin] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => {
      if (perRow !== 'auto') setCols(perRow);
      else setCols(Math.max(1, Math.floor((el.clientWidth + GAP) / (MIN_CARD_WIDTH + GAP))));
      setScrollMargin(el.offsetTop);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [perRow]);

  const rowCount = Math.ceil(links.length / cols);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 4,
    scrollMargin,
  });

  return (
    <div
      className="grid vgrid"
      role="list"
      ref={wrapRef}
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((vRow) => {
        const start = vRow.index * cols;
        const slice = links.slice(start, start + cols);
        return (
          <div
            key={vRow.key}
            className="vrow"
            role="presentation"
            style={{
              transform: `translateY(${vRow.start - scrollMargin}px)`,
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            }}
          >
            {slice.map((link) => (
              <BookmarkCard key={link.id} link={link} allowFileUrls={allowFileUrls} onContextMenu={onCardContextMenu} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
