import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { LinkNode, Settings } from '../../core/types';
import { BookmarkCard } from './BookmarkCard';

/** 超过 300 条启用虚拟滚动 */
const VIRTUAL_THRESHOLD = 300;
const CARD_HEIGHT = 104;
const GAP = 12;
const ROW_HEIGHT = CARD_HEIGHT + GAP;
/** auto 模式的设计下限 */
const MIN_CARD_WIDTH = 148;
/** 固定列数时允许更密：过高的下限会让用户选定的列数被过早降列（如 1536px 窗口选 8 列变成 7 列） */
const MIN_FIXED_CARD_WIDTH = 120;

interface BookmarkGridProps {
  links: LinkNode[];
  perRow: Settings['cardsPerRowHint'];
  allowFileUrls: boolean;
  openInNewTab: boolean;
  scrollParentRef: RefObject<HTMLDivElement>;
  onCardContextMenu: (e: ReactMouseEvent, link: LinkNode) => void;
}

export function BookmarkGrid(props: BookmarkGridProps) {
  if (props.links.length > VIRTUAL_THRESHOLD) return <VirtualGrid {...props} />;
  return <SimpleGrid {...props} />;
}

/**
 * 固定列数：轨道下限取「120px」与「均分 n 列宽度」的较大值，配合 auto-fill，
 * 空间足够时正好 n 列，只有真正放不下时才自动降列。
 */
function gridColumns(perRow: Settings['cardsPerRowHint']): CSSProperties {
  if (perRow === 'auto') return {};
  const minTrack = `max(${MIN_FIXED_CARD_WIDTH}px, calc((100% - ${(perRow - 1) * GAP}px) / ${perRow}))`;
  return { gridTemplateColumns: `repeat(auto-fill, minmax(${minTrack}, 1fr))` };
}

function SimpleGrid({ links, perRow, allowFileUrls, openInNewTab, onCardContextMenu }: BookmarkGridProps) {
  return (
    <div className="grid" role="list" style={gridColumns(perRow)}>
      {links.map((link) => (
        <BookmarkCard
          key={link.id}
          link={link}
          allowFileUrls={allowFileUrls}
          openInNewTab={openInNewTab}
          onContextMenu={onCardContextMenu}
        />
      ))}
    </div>
  );
}

/**
 * 虚拟滚动网格：外层滚动容器是页面内容区（.content），
 * 用 scrollMargin 抵消网格在滚动容器内的偏移。
 */
function VirtualGrid({ links, perRow, allowFileUrls, openInNewTab, scrollParentRef, onCardContextMenu }: BookmarkGridProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(6);
  const [scrollMargin, setScrollMargin] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => {
      // 与 CSS 的 auto-fill 降列行为保持一致：auto 与固定列数使用不同的最小卡宽
      const fitAuto = Math.max(1, Math.floor((el.clientWidth + GAP) / (MIN_CARD_WIDTH + GAP)));
      const fitFixed = Math.max(1, Math.floor((el.clientWidth + GAP) / (MIN_FIXED_CARD_WIDTH + GAP)));
      setCols(perRow === 'auto' ? fitAuto : Math.min(perRow, fitFixed));
      setScrollMargin(el.offsetTop);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    // 窗口高度变化会改变网格 offsetTop，但自身尺寸不变，ResizeObserver 不触发，
    // 因此补 window.resize 兜底重算
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
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
              <BookmarkCard
                key={link.id}
                link={link}
                allowFileUrls={allowFileUrls}
                openInNewTab={openInNewTab}
                onContextMenu={onCardContextMenu}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
