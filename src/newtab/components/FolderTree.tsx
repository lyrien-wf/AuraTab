import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import type { FolderNode } from '../../core/types';

interface FolderTreeProps {
  roots: FolderNode[];
  selectedId: string | null;
  expandDepth: number;
  onSelect: (folderId: string) => void;
}

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

/** 按展开状态 DFS 得到可见节点序列（键盘导航用） */
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
 * 左侧目录树：role=tree/treeitem，支持展开折叠、选中，
 * 键盘：↑/↓ 移动，→/← 展开折叠，Enter/Space 选中，Home/End 首尾。
 */
export function FolderTree({ roots, selectedId, expandDepth, onSelect }: FolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => initialExpanded(roots, expandDepth));
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const pendingFocus = useRef<string | null>(null);

  // 展开深度设置变化时重置展开状态
  useEffect(() => {
    setExpanded(initialExpanded(roots, expandDepth));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandDepth]);

  const flat = useMemo(() => flattenVisible(roots, expanded), [roots, expanded]);

  // 渲染后处理延迟聚焦（如展开后聚焦第一个子节点）
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
    if (itemRefs.current.get(id)) itemRefs.current.get(id)!.focus();
    else pendingFocus.current = id;
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

  const renderNodes = (nodes: FolderNode[]): ReactNode =>
    nodes.map((node) => {
      const hasChildren = node.children.length > 0;
      const isOpen = expanded.has(node.id);
      const selected = node.id === selectedId;
      return (
        <li
          key={node.id}
          role="treeitem"
          aria-selected={selected}
          aria-expanded={hasChildren ? isOpen : undefined}
          aria-level={node.depth + 1}
          data-folder-id={node.id}
          tabIndex={node.id === activeId ? 0 : -1}
          ref={(el) => {
            if (el) itemRefs.current.set(node.id, el);
            else itemRefs.current.delete(node.id);
          }}
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
          {hasChildren && isOpen && <ul role="group" className="tree-group">{renderNodes(node.children)}</ul>}
        </li>
      );
    });

  if (roots.length === 0) return null;

  return (
    <ul role="tree" aria-label="收藏夹目录树" className="tree" onKeyDown={onKeyDown}>
      {renderNodes(roots)}
    </ul>
  );
}
