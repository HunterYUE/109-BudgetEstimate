import React, { useState } from 'react';
import { Button, Modal, Input, message as antMsg } from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { mockTagTree } from '../mockData';
import type { TagNode } from '../types';
import { COLORS } from '../styles/constants';
import { cloneTree, findPath, getNodeByPath, uid, flattenTree } from '../utils/tagHelpers';

// ── 组件 ──

const TagManagement: React.FC = () => {
  const [tree, setTree] = useState<TagNode[]>(() => cloneTree(mockTagTree));
  const [msg, ctx] = antMsg.useMessage();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [descEditId, setDescEditId] = useState<string | null>(null);
  const [descEditValue, setDescEditValue] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandView, setExpandView] = useState<'expand' | 'collapse'>('collapse');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalName, setAddModalName] = useState('');
  const [addModalParentId, setAddModalParentId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const addInputRef = React.useRef<HTMLInputElement>(null);
  const editRef = React.useRef<HTMLInputElement>(null);

  const flatRows = flattenTree(tree);
  // Only show expanded rows
  const visibleRows = flatRows.filter((row, index) => {
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
  });

  const startEditing = (id: string, currentName: string) => {
    setEditingId(id);
    setEditValue(currentName);
    setTimeout(() => editRef.current?.focus(), 50);
  };

  const saveEdit = () => {
    if (!editingId || !editValue.trim()) { setEditingId(null); return; }
    setTree(prev => {
      const t = cloneTree(prev);
      const path = findPath(t, editingId);
      if (!path) return prev;
      const node = getNodeByPath(t, path);
      if (node) node.name = editValue.trim();
      return t;
    });
    setEditingId(null);
    msg.success('标签已重命名');
  };

  const saveDesc = () => {
    if (!descEditId) return;
    setTree(prev => {
      const t = cloneTree(prev);
      const path = findPath(t, descEditId);
      if (!path) return prev;
      const node = getNodeByPath(t, path);
      if (node) node.description = descEditValue.trim() || undefined;
      return t;
    });
    setDescEditId(null);
  };

  // Level colors
  const LEVEL_COLORS = ['#1a2744', COLORS.primary, '#5a2d82', '#008080', '#d46b08'];
  const LEVEL_BG = ['#e8ecf0', '#e0ecfa', '#ede6f5', '#dceeea', '#f5ede4'];

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addChild = (parentId: string | null, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAddModalParentId(parentId);
    setAddModalName('');
    setAddModalOpen(true);
    setTimeout(() => addInputRef.current?.focus(), 50);
  };

  const confirmAdd = () => {
    const name = addModalName.trim();
    if (!name) { msg.warning('请输入标签名称'); return; }
    const newId = uid();
    setTree(prev => {
      const t = cloneTree(prev);
      if (!addModalParentId) {
        t.push({ id: newId, name });
      } else {
        const path = findPath(t, addModalParentId);
        if (!path) return prev;
        const parent = getNodeByPath(t, path);
        if (parent) {
          if (!parent.children) parent.children = [];
          parent.children.push({ id: newId, name });
        }
      }
      return t;
    });
    if (addModalParentId) setExpandedIds(prev => new Set(prev).add(addModalParentId!));
    setAddModalOpen(false);
    msg.success('已添加标签');
  };

  const deleteNode = (id: string) => {
    const path = findPath(tree, id);
    if (!path) return;
    const node = getNodeByPath(tree, path);
    if (node) setDeleteTarget({ id, name: node.name });
  };

  const confirmDelete = () => {
    const target = deleteTarget;
    if (!target) return;
    setTree(prev => {
      const t = cloneTree(prev);
      const p = findPath(t, target.id);
      if (!p) return prev;
      if (p.length === 1) {
        t.splice(p[0], 1);
      } else {
        const parentPath = p.slice(0, -1);
        const parent = getNodeByPath(t, parentPath);
        if (parent?.children) parent.children.splice(p[p.length - 1], 1);
      }
      return t;
    });
    if (editingId === target.id) setEditingId(null);
    setDeleteTarget(null);
    msg.success('已删除');
  };

  const moveNode = (id: string, direction: -1 | 1, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTree(prev => {
      const t = cloneTree(prev);
      const path = findPath(t, id);
      if (!path) return prev;
      const idx = path[path.length - 1];
      const newIdx = idx + direction;
      if (newIdx < 0) return prev;
      if (path.length === 1) {
        if (newIdx >= t.length) return prev;
        [t[idx], t[newIdx]] = [t[newIdx], t[idx]];
      } else {
        const parentPath = path.slice(0, -1);
        const parent = getNodeByPath(t, parentPath);
        if (!parent?.children || newIdx >= parent.children.length) return prev;
        [parent.children[idx], parent.children[newIdx]] = [parent.children[newIdx], parent.children[idx]];
      }
      return t;
    });
  };

  // ── 渲染表格 ──


  return (
    <div>
      {ctx}
      <div style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: '#0d1b2a' }}>标签管理</span>
      </div>

      <div style={{ width: '100%', maxWidth: 1050, display: 'flex', gap: 20, alignItems: 'flex-start', paddingTop: 20 }}>
        {/* 左侧：标签表格 */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e8e8e8' }}>
              <div onClick={() => {
                const all: string[] = [];
                const walk = (ns: TagNode[]) => ns.forEach(n => { all.push(n.id); if (n.children) walk(n.children); });
                walk(tree);
                setExpandedIds(new Set(all));
                setExpandView('expand');
              }} style={{
                padding: '8px 20px', cursor: 'pointer', fontSize: 14,
                borderBottom: expandView === 'expand' ? '2px solid COLORS.primary' : '2px solid transparent',
                color: expandView === 'expand' ? COLORS.primary : '#666',
                fontWeight: expandView === 'expand' ? 600 : 400,
                marginBottom: -2, transition: 'all 0.15s',
              }}>全部展开</div>
              <div onClick={() => {
                setExpandedIds(new Set());
                setExpandView('collapse');
              }} style={{
                padding: '8px 20px', cursor: 'pointer', fontSize: 14,
                borderBottom: expandView === 'collapse' ? '2px solid COLORS.primary' : '2px solid transparent',
                color: expandView === 'collapse' ? COLORS.primary : '#666',
                fontWeight: expandView === 'collapse' ? 600 : 400,
                marginBottom: -2, transition: 'all 0.15s',
              }}>全部折叠</div>
            </div>
            <Button type="text" icon={<PlusOutlined />}
              onClick={() => addChild(null)}
              style={{ color: COLORS.primary, fontSize: 13 }}>新增一级标签</Button>
          </div>
          <div style={{ border: '1px solid #e8edf4', borderRadius: 6, overflow: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col />
              <col style={{ width: 56 }} />
              <col style={{ width: 180 }} />
              <col style={{ width: 500 }} />
            </colgroup>
            <thead>
              <tr style={{ background: '#e0f0fa' }}>
                <th style={{ width: 36, minWidth: 36, maxWidth: 36, padding: '10px 4px', fontSize: 11, fontWeight: 600, color: '#8892a4', textAlign: 'center', letterSpacing: 0.3, borderBottom: '1px solid #e4e9f0' }} />
                <th style={{ padding: '10px 4px', fontSize: 11, fontWeight: 600, color: '#8892a4', textAlign: 'left', letterSpacing: 0.3, borderBottom: '1px solid #e4e9f0' }}>标签名称</th>
                <th style={{ width: 56, minWidth: 56, maxWidth: 56, padding: '10px 4px', fontSize: 11, fontWeight: 600, color: '#8892a4', textAlign: 'center', letterSpacing: 0.3, borderBottom: '1px solid #e4e9f0', borderLeft: '1px solid #eef2f6', borderRight: '1px solid #eef2f6' }}>子级</th>
                <th style={{ width: 236, minWidth: 236, maxWidth: 236, padding: '10px 4px', fontSize: 11, fontWeight: 600, color: '#8892a4', textAlign: 'center', letterSpacing: 0.3, borderBottom: '1px solid #e4e9f0' }}>操作</th>
                <th style={{ width: 500, minWidth: 500, maxWidth: 500, padding: '10px 4px', fontSize: 11, fontWeight: 600, color: '#8892a4', textAlign: 'left', letterSpacing: 0.3, borderBottom: '1px solid #e4e9f0', borderLeft: '1px solid #eef2f6', background: '#e0f0fa' }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#ccc', fontSize: 13 }}>暂无标签，点击右上角「新增一级标签」开始</td></tr>
              ) : visibleRows.map(({ node, level, connector }) => {
                const isEditing = editingId === node.id;
                const hasChildren = node.children && node.children.length > 0;
                const isExpanded = expandedIds.has(node.id);
                const lc = LEVEL_COLORS[Math.min(level, 4)];
                const lbg = LEVEL_BG[Math.min(level, 4)];
                return (
                  <tr key={node.id}
                    style={{
                      cursor: 'pointer',
                      background: isEditing ? '#f0f6ff' : '#fff',
                      transition: 'background 0.12s',
                      borderBottom: '1px solid #eef2f6',
                      height: 44, minHeight: 44, lineHeight: '18px',
                    }}
                    onMouseEnter={e => { if (!isEditing) e.currentTarget.style.background = '#f8faff'; }}
                    onMouseLeave={e => { if (!isEditing) e.currentTarget.style.background = '#fff'; }}
                  >
                    <td style={{ width: 36, minWidth: 36, maxWidth: 36, padding: '2px 2px', textAlign: 'center', verticalAlign: 'middle' }}>
                      {hasChildren ? (
                        <span onClick={e => { e.stopPropagation(); toggleExpand(node.id); }}
                          style={{ cursor: 'pointer', fontSize: 13, color: lc, display: 'inline-block', userSelect: 'none' }}>
                          {isExpanded ? '−' : '+'}
                        </span>
                      ) : (
                        <span style={{ display: 'inline-block', width: 13 }} />
                      )}
                    </td>
                    <td style={{ padding: '2px 4px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'text' }}
                        onClick={() => { if (!isEditing) startEditing(node.id, node.name); }}>
                        {level > 0 && (
                          <div style={{ display: 'flex', alignItems: 'stretch', flexShrink: 0, height: 14 }}>
                            {Array.from({ length: level }).map((_, li) => (
                              <div key={li} style={{ width: 22, position: 'relative' }}>
                                {!connector[li] && (
                                  <div style={{ position: 'absolute', left: 10, top: 0, bottom: 0, width: 1, background: '#d4dce8', transform: 'scaleX(0.5)', transformOrigin: 'left top' }} />
                                )}
                                {li === level - 1 && (
                                  <div style={{ position: 'absolute', left: 10, top: '50%', right: 0, height: 1, background: '#d4dce8', transform: 'scaleY(0.5)', transformOrigin: 'left top' }} />
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{
                          width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                          background: lbg, color: lc,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
                          border: isEditing ? '1.5px solid ' + lc : '1.5px solid transparent',
                        }}>
                          {level + 1}
                        </div>
                        {isEditing ? (
                          <input ref={editRef}
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={saveEdit}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                            onClick={e => e.stopPropagation()}
                            style={{
                              flex: 1, border: '1px solid COLORS.primary', borderRadius: 3,
                              padding: '1px 4px', fontSize: 12, outline: 'none',
                              fontFamily: 'inherit', background: '#fff',
                            }}
                          />
                        ) : (
                          <span style={{
                            color: lc,
                            fontWeight: isEditing ? 600 : 500,
                            fontSize: 13,
                          }}>
                            {node.name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '2px 4px', verticalAlign: 'middle', textAlign: 'center', borderLeft: '1px solid #eef2f6', borderRight: '1px solid #eef2f6' }}>
                      {hasChildren ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          minWidth: 16, height: 16, borderRadius: 8,
                          background: '#eef2f7', color: '#667085', fontSize: 11, fontWeight: 500,
                        }}>{node.children!.length}</span>
                      ) : (
                        <span style={{ color: '#d0d6e0', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '2px 4px', verticalAlign: 'middle', textAlign: 'center' }}
                      onClick={e => e.stopPropagation()}>
                      <Button type="text" size="small" icon={<PlusOutlined style={{ fontSize: 11 }} />}
                        onClick={(e) => addChild(node.id, e)}
                        style={{ width: 18, height: 18, lineHeight: '18px', color: COLORS.primary, fontSize: 11 }}
                        title="新增子标签" />
                      <Button type="text" size="small" icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                        onClick={() => deleteNode(node.id)}
                        style={{ width: 18, height: 18, lineHeight: '18px', color: COLORS.danger, fontSize: 11 }} title="删除" />
                      <span style={{ opacity: 0.45, transition: 'opacity 0.12s', display: 'inline-flex', lineHeight: '18px' }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '0.45'}>
                        <Button type="text" size="small" icon={<ArrowUpOutlined style={{ fontSize: 11 }} />}
                          onClick={(e) => moveNode(node.id, -1, e)}
                          style={{ width: 18, height: 18, lineHeight: '18px', color: '#8892a4', fontSize: 11 }} title="上移" />
                        <Button type="text" size="small" icon={<ArrowDownOutlined style={{ fontSize: 11 }} />}
                          onClick={(e) => moveNode(node.id, 1, e)}
                          style={{ width: 18, height: 18, lineHeight: '18px', color: '#8892a4', fontSize: 11 }} title="下移" />
                      </span>
                    </td>
                    <td style={{ padding: '2px 4px', verticalAlign: 'middle', fontSize: 12, color: '#888', position: 'relative', borderLeft: '1px solid #eef2f6', lineHeight: '18px' }}>
                      {descEditId === node.id ? (
                        <input value={descEditValue}
                          onChange={e => setDescEditValue(e.target.value)}
                          onBlur={saveDesc}
                          onKeyDown={e => { if (e.key === 'Enter') saveDesc(); if (e.key === 'Escape') setDescEditId(null); }}
                          autoFocus
                          style={{ width: '100%', border: '1px solid COLORS.primary', borderRadius: 3, padding: '1px 4px', fontSize: 12, outline: 'none', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' }}
                        />
                      ) : (
                        <span style={{ cursor: 'text', color: node.description ? '#666' : '#ccc' }}
                          onClick={() => { setDescEditId(node.id); setDescEditValue(node.description || ''); }}>
                          {node.description || '点击添加说明'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/**_─ 新增标签弹窗 ─_*/}
        <Modal
          title={<span style={{ fontSize: 17, fontWeight: 600, color: '#0d1b2a', letterSpacing: 0.5 }}>新增标签</span>}
          open={addModalOpen}
          onCancel={() => setAddModalOpen(false)}
          destroyOnHidden
          width={460}
          styles={{ body: { padding: '14px 2px 6px' } }}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button icon={<CloseOutlined />} onClick={() => setAddModalOpen(false)}
                style={{ borderRadius: 3, width: 36, height: 36 }} />
              <Button type="primary" ghost icon={<CheckOutlined />} onClick={confirmAdd}
                style={{ borderColor: COLORS.primary, color: COLORS.primary, borderRadius: 3, width: 36, height: 36 }} />
            </div>
          }
        >
          <Input
            ref={addInputRef}
            value={addModalName}
            onChange={e => setAddModalName(e.target.value)}
            onPressEnter={confirmAdd}
            placeholder="输入标签名称"
            style={{ fontSize: 14 }}
          />
        </Modal>

      {/* 删除确认弹窗 */}
      <Modal
        title={<span style={{ fontSize: 17, fontWeight: 600, color: '#0d1b2a', letterSpacing: 0.5 }}>删除标签</span>}
        open={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        width={460}
        destroyOnHidden
        styles={{ body: { padding: '14px 32px 6px' } }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button icon={<CloseOutlined />} onClick={() => setDeleteTarget(null)}
              style={{ borderRadius: 3, width: 36, height: 36 }} />
            <Button type="primary" ghost icon={<CheckOutlined />} onClick={confirmDelete}
              style={{ borderColor: COLORS.danger, color: COLORS.danger, borderRadius: 3, width: 36, height: 36 }} />
          </div>
        }
      >
        {deleteTarget && (
          <div style={{ textAlign: 'center', padding: '4px 0 0' }}>
            <div style={{ fontSize: 14, color: '#0d1b2a', fontWeight: 600, marginBottom: 6 }}>
              确定删除"{deleteTarget.name}"？
            </div>
            <div style={{ fontSize: 13, color: '#8892a4' }}>物料上引用该标签的信息不会自动清除。</div>
          </div>
        )}
      </Modal>

      </div>
    </div>
    </div>
  );
};

export default TagManagement;