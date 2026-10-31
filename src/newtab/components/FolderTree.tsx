import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { FolderNode } from '../../core/types';

interface FolderTreeProps {
  roots: FolderNode[];
  selectedId: string | null;
  expandDepth: number;
  scrollParentRef: RefObject<HTMLDivElement>;
  onSelect: (folderId: string) => void;
}

/** 可见节点超过 300 时启用虚拟滚动（与书签网格同一阈值） */
const VIRTUAL_THRESHOLD = 300;
/** .tree-row 的固定行高（与 global.css 保持一致），供虚拟行估算 */
const ROW_HEIGHT = 32;

/** 初始展开集合：depth < expandDepth 的目录 */
function initialExpanded(roots: FolderNode[], expandDepth: number): Set<string> {
  const set = new Set<string>();
  const walk = (nodes: FolderNode[]) => {
    for (const n of nodes) {
      if (n.depth < expandDepth && n.children.length > 0) set.add(n.id);
      walk(n.children);
    }
  };
  walk(roots);
  return set;
}

/** 按展开状态 DFS 得到可见节点序列（扁平渲染与键盘导航共用） */
function flattenVisible(roots: FolderNode[], expanded: Set<string>): FolderNode[] {
  const out: FolderNode[] = [];
  const walk = (nodes: FolderNode[]) => {
    for (const n of nodes) {
      out.push(n);
      if (expanded.has(n.id)) walk(n.children);
    }
  };
  walk(roots);
  return out;
}

/**
 * 左侧目录树：role=tree/treeitem + aria-level 表达层级，支持展开折叠、选中与键盘导航
 * （↑/↓ 移动，→/← 展开折叠，Enter/Space 选中，Home/End 首尾）；节点多时按行虚拟化。
 */
export function FolderTree({ roots, selectedId, expandDepth, scrollParentRef, onSelect }: FolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => initialExpanded(roots, expandDepth));
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  /** 按 id 缓存的稳定 ref 回调，避免每次渲染重挂全部行 */
  const refCallbacks = useRef(new Map<string, (el: HTMLDivElement | null) => void>());
  const knownIds = useRef<Set<string> | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  const flat = useMemo(() => flattenVisible(roots, expanded), [roots, expanded]);
  const virtual = flat.length > VIRTUAL_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: virtual ? flat.length : 0,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    scrollMargin,
    enabled: virtual,
  });

  /* 模型变化时对账展开状态：清理失效 id、按默认深度展开新增目录、保留手动展开 */
  useEffect(() => {
    const current = new Set<string>();
    const fresh: string[] = [];
    const walk = (nodes: FolderNode[]) => {
      for (const n of nodes) {
        current.add(n.id);
        if (knownIds.current && !knownIds.current.has(n.id) && n.children.length > 0 && n.depth < expandDepth) {
          fresh.push(n.id);
        }
        walk(n.children);
      }
    };
    walk(roots);
    const firstRun = knownIds.current === null;
    knownIds.current = current;
    for (const id of [...refCallbacks.current.keys()]) {
      if (!current.has(id)) refCallbacks.current.delete(id);
    }
    if (firstRun) return;
    setExpanded((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (current.has(id)) next.add(id);
      for (const id of fresh) next.add(id);
      return next;
    });
  }, [roots, expandDepth]);

  /* 展开深度设置变化时整体重置（roots 变化走对账） */
  useEffect(() => {
    setExpanded(initialExpanded(roots, expandDepth));
  }, [expandDepth]);

  /* 虚拟容器在滚动容器内的偏移：尺寸变化与窗口 resize 时重算 */
  useEffect(() => {
    if (!virtual) return;
    const el = wrapRef.current;
    const scroller = scrollParentRef.current;
    if (!el || !scroller) return;
    const compute = () => {
      setScrollMargin(el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [virtual, scrollParentRef]);

  // 渲染后处理延迟聚焦（如展开后聚焦第一个子节点、虚拟滚动到位后聚焦目标行）
  useEffect(() => {
    if (pendingFocus.current) {
      itemRefs.current.get(pendingFocus.current)?.focus();
      pendingFocus.current = null;
    }
  });

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeId = selectedId && flat.some((n) => n.id === selectedId) ? selectedId : (flat[0]?.id ?? null);

  const focusNode = (id?: string) => {
    if (!id) return;
    const el = itemRefs.current.get(id);
    if (el) {
      el.focus();
      return;
    }
    // 未渲染（刚展开或在视口外）：先滚动到可见范围，渲染后聚焦
    const idx = flat.findIndex((n) => n.id === id);
    if (idx >= 0 && virtual) virtualizer.scrollToIndex(idx, { align: 'auto' });
    pendingFocus.current = id;
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const target = (e.target as HTMLElement).closest('[data-folder-id]') as HTMLElement | null;
    const currentId = target?.dataset.folderId;
    if (!currentId) return;
    const idx = flat.findIndex((n) => n.id === currentId);
    const node = flat[idx];
    if (!node) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusNode(flat[idx + 1]?.id);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusNode(flat[idx - 1]?.id);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (node.children.length > 0) {
          if (!expanded.has(node.id)) toggle(node.id);
          else focusNode(node.children[0].id);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (node.children.length > 0 && expanded.has(node.id)) toggle(node.id);
        else focusNode(node.parentId);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect(node.id);
        break;
      case 'Home':
        e.preventDefault();
        focusNode(flat[0]?.id);
        break;
      case 'End':
        e.preventDefault();
        focusNode(flat[flat.length - 1]?.id);
        break;
      default:
        break;
    }
  };

  const itemRef = useCallback((id: string) => {
    let cb = refCallbacks.current.get(id);
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        if (el) itemRefs.current.set(id, el);
        else itemRefs.current.delete(id);
      };
      refCallbacks.current.set(id, cb);
    }
    return cb;
  }, []);

  const renderRow = (node: FolderNode): ReactNode => {
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(node.id);
    const selected = node.id === selectedId;
    return (
      <div
        key={node.id}
        role="treeitem"
        aria-selected={selected}
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-level={node.depth + 1}
        data-folder-id={node.id}
        tabIndex={node.id === activeId ? 0 : -1}
        ref={itemRef(node.id)}
      >
        <div
          className={`tree-row${selected ? ' selected' : ''}`}
          style={{ paddingLeft: 8 + node.depth * 14 }}
          onClick={() => onSelect(node.id)}
          onDoubleClick={() => hasChildren && toggle(node.id)}
        >
          <span
            className={`chevron${hasChildren ? '' : ' hidden'}${isOpen ? ' open' : ''}`}
            aria-hidden="true"
            onClick={(e) => {
              e.stopPropagation();
              toggle(node.id);
            }}
          >
            ▸
          </span>
          <span className="tree-title" title={node.title}>
            {node.title}
          </span>
          {node.linkCount > 0 && <span className="tree-badge">{node.linkCount}</span>}
        </div>
      </div>
    );
  };

  if (roots.length === 0) return null;

  return (
    <div role="tree" aria-label="收藏夹目录树" className="tree" onKeyDown={onKeyDown}>
      {virtual ? (
        <div ref={wrapRef} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vRow) => (
            <div
              key={vRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vRow.start - scrollMargin}px)`,
              }}
            >
              {renderRow(flat[vRow.index])}
            </div>
          ))}
        </div>
      ) : (
        flat.map(renderRow)
      )}
    </div>
  );
}
