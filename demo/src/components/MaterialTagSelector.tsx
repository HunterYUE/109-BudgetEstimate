import React, { useState, useMemo } from 'react';
import { Popover } from 'antd';
import { mockTagTree } from '../mockData';
import { flattenTree, collectTagPaths } from '../pages/TagManagement';
import { COLORS } from '../styles/constants';

const LEVEL_COLORS = ['#1a2744', COLORS.primary, '#5a2d82', '#008080', '#d46b08'];

interface Props {
  value: string[];
  onChange: (val: string[]) => void;
}

const MaterialTagSelector: React.FC<Props> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(mockTagTree.map(n => n.id)));

  const flatRows = useMemo(() => flattenTree(mockTagTree), []);
  const tagPathMap = useMemo(() => collectTagPaths(mockTagTree), []);

  // Visible rows based on expanded state
  const visibleRows = useMemo(() => flatRows.filter((row, index) => {
    if (row.level === 0) return true;
    let ancestorLevel = row.level - 1;
    for (let i = index - 1; i >= 0; i--) {
      if (flatRows[i].level === ancestorLevel) {
        if (!expandedIds.has(flatRows[i].node.id)) return false;
        ancestorLevel--;
        if (ancestorLevel < 0) break;
      }
    }
    return true;
  }), [flatRows, expandedIds]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const isSelected = (id: string) => value.includes(id);

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSelected(id)) {
      onChange(value.filter(v => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  // Resolve selected IDs to display labels
  const selectedLabels = useMemo(() => {
    return value.map(id => {
      const found = tagPathMap.find(t => t.id === id);
      return found ? found.path.join(' / ') : id;
    });
  }, [value, tagPathMap]);

  const triggerContent = (
    <div
      onClick={() => setOpen(true)}
      style={{
        minHeight: 28, padding: '1px 0', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
      }}
    >
      {selectedLabels.length === 0 ? (
        <span style={{ color: '#bbb', fontSize: 12 }}>点击选择标签…</span>
      ) : (
        selectedLabels.map((label, i) => (
          <span key={value[i]} style={{
            display: 'inline-flex', alignItems: 'center', gap: 2,
            fontSize: 11, lineHeight: '20px', maxWidth: 180,
            background: '#f5f5f5', borderRadius: 4, padding: '0 4px',
          }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{label}</span>
            <span onClick={() => onChange(value.filter((_, j) => j !== i))}
              style={{ cursor: 'pointer', color: '#999', fontSize: 10, lineHeight: 1, flexShrink: 0 }}>✕</span>
          </span>
        ))
      )}
      <span style={{ fontSize: 10, color: '#999', marginLeft: 'auto' }}>▾</span>
    </div>
  );

  const treeContent = (
    <div style={{ width: 260, maxHeight: 320, overflow: 'auto', padding: '4px 0' }}>
      {visibleRows.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: '#ccc', fontSize: 13 }}>暂无标签</div>
      ) : visibleRows.map(({ node, level, connector }) => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedIds.has(node.id);
        const sel = isSelected(node.id);
        const lc = LEVEL_COLORS[Math.min(level, 4)];
        return (
          <div key={node.id}
            onClick={(e) => toggleSelect(node.id, e)}
            style={{
              display: 'flex', alignItems: 'center', gap: 2,
              padding: '3px 8px', cursor: 'pointer', minHeight: 28,
              background: sel ? '#eef4ff' : 'transparent',
              borderRadius: 3, margin: '1px 4px',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => { if (!sel) e.currentTarget.style.background = '#f5f8ff'; }}
            onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}
          >
            {/* Expand/collapse icon */}
            <div style={{ width: 18, flexShrink: 0, textAlign: 'center', fontSize: 11, color: lc, userSelect: 'none' }}>
              {hasChildren ? (
                <span onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
                  style={{ cursor: 'pointer', display: 'inline-block' }}>
                  {isExpanded ? '−' : '+'}
                </span>
              ) : (
                <span style={{ width: 18, display: 'inline-block' }} />
              )}
            </div>
            {/* Indentation + tree lines */}
            <div style={{ width: level * 18, flexShrink: 0, position: 'relative' }}>
              {level > 0 && (
                <svg width={level * 18 + 14} height={28} style={{ position: 'absolute', left: -8, top: -4, pointerEvents: 'none', overflow: 'visible' }}>
                  {Array.from({ length: level }).map((_, li) => {
                    const x = li * 18 + 4;
                    return (
                      <g key={li}>
                        {!connector[li] && (
                          <line x1={x} y1={0} x2={x} y2={28} stroke="#d4dce8" strokeWidth={0.5} />
                        )}
                        {li === level - 1 && (
                          <line x1={x} y1={14} x2={x + 10} y2={14} stroke="#d4dce8" strokeWidth={0.5} />
                        )}
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>
            {/* Node name */}
            <span style={{
              fontSize: 13, color: sel ? COLORS.primary : lc,
              fontWeight: sel ? 600 : 400, flex: 1,
            }}>
              {node.name}
            </span>
            {/* Selection indicator */}
            <div style={{
              width: 14, height: 14, borderRadius: 3, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: sel ? '1.5px solid COLORS.primary' : '1.5px solid #c0c8d4',
              background: sel ? COLORS.primary : 'transparent',
              transition: 'all 0.15s',
            }}>
              {sel && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1, fontWeight: 700 }}>✓</span>}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <Popover
      content={treeContent}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomLeft"
      styles={{ root: { padding: 0 }, body: { padding: 0 } }}
    >
      {triggerContent}
    </Popover>
  );
};

export default MaterialTagSelector;
