import React, { useState, useRef, useEffect } from 'react';
import { Tag, Modal } from 'antd';
import { HistoryOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons';
import type { DeliveryNode } from '../types';

interface Props {
  nodes: DeliveryNode[];
  planLocked?: boolean;
  hasChanges?: boolean;
  onNodeStatusClick?: (nodeId: string) => void;
  onPlannedDateChange?: (nodeId: string, field: 'plannedStartDate' | 'plannedEndDate', date: string) => void;
  onCommentsChange?: (nodeId: string, comments: string) => void;
  onSavePlan?: () => void;
  onSubmitPlan?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '未开始', in_progress: '进行中', completed: '已完成', delayed: '已延期',
};
const TAG_COLORS: Record<string, string> = {
  pending: 'default', in_progress: 'blue', completed: 'green', delayed: 'red',
};
const CIRCLE_BG: Record<string, string> = {
  pending: '#f5f5f5', in_progress: '#e6f0fa', completed: '#e8f5e9', delayed: '#ffebee',
};
const CIRCLE_BORDER: Record<string, string> = {
  pending: '#999', in_progress: '#00509e', completed: '#1a6b3c', delayed: '#c62828',
};
const CIRCLE_SYMBOL: Record<string, string> = {
  pending: '', in_progress: '▶', completed: '✓', delayed: '⚠',
};

function shortDate(d: string) { return d ? d.slice(2) : '—'; }  // YY-MM-DD

const COMMENT_COLORS = ['#a3c8f0', '#a5d6a7', '#ffe082', '#ef9a9a', '#ce93d8', '#80deea'];

const DeliveryNodeTimeline: React.FC<Props> = ({
  nodes, planLocked, hasChanges,
  onNodeStatusClick, onPlannedDateChange, onCommentsChange,
  onSavePlan, onSubmitPlan,
}) => {
  const sorted = [...nodes].sort((a, b) => a.nodeNo - b.nodeNo);

  // Date inline editing
  const [editing, setEditing] = useState<{ id: string; field: 'plannedStartDate' | 'plannedEndDate' } | null>(null);
  const [editVal, setEditVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const commitEdit = () => {
    if (editing && editVal && onPlannedDateChange) {
      onPlannedDateChange(editing.id, editing.field, editVal);
    }
    setEditing(null);
  };

  const showHistory = (node: DeliveryNode) => {
    if (node.history.length === 0) return;
    Modal.info({
      title: `${node.name} — 变更历史`,
      width: 480,
      content: (
        <div style={{ position: 'relative', paddingLeft: 24 }}>
          <div style={{ position: 'absolute', left: 11, top: 4, bottom: 4, width: 2, background: '#e8e8e8' }} />
          {[...node.history].reverse().map(h => (
            <div key={h.id} style={{ position: 'relative', paddingBottom: 10 }}>
              <div style={{ position: 'absolute', left: -20, top: 4, width: 12, height: 12, borderRadius: '50%', background: '#00509e', border: '2px solid #fff' }} />
              <div style={{ fontSize: 13, color: '#0d1b2a', fontWeight: 600 }}>
                {h.field === 'status' ? '状态变更' : '计划日期变更'}
              </div>
              <div style={{ fontSize: 12, color: '#999' }}>{h.changedAt}</div>
              <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                {h.oldValue || '—'} → {h.newValue}
              </div>
            </div>
          ))}
        </div>
      ),
      okText: '关闭',
    });
  };

  // Comments editing state
  const [editingComments, setEditingComments] = useState<string | null>(null);
  const [commentsVal, setCommentsVal] = useState('');

  const startEditComments = (nodeId: string, current: string) => {
    setEditingComments(nodeId);
    setCommentsVal(current);
  };

  const commitComments = () => {
    if (editingComments !== null && onCommentsChange) {
      onCommentsChange(editingComments, commentsVal);
    }
    setEditingComments(null);
  };

  return (
    <div style={{ padding: '4px 0', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans SC', sans-serif" }}>
      <style>{`input.dt-hide::-webkit-calendar-picker-indicator { display: none }`}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {sorted.map((node, idx) => {
          const isLast = idx === sorted.length - 1;
          const getDateColor = (field: 'plannedStartDate' | 'plannedEndDate') => {
            if (editing?.id === node.id && editing?.field === field) return '#00509e';
            const entry = node.history.find(h => h.field === 'plannedDate' && h.newValue === node[field]);
            if (!entry) return '#0d1b2a';
            return node[field] < entry.oldValue ? '#1a6b3c' : '#c62828';
          };
          const getDateWeight = (field: 'plannedStartDate' | 'plannedEndDate') => {
            const entry = node.history.find(h => h.field === 'plannedDate' && h.newValue === node[field]);
            return entry ? 700 : 400;
          };

          return (
            <div key={node.id} style={{ display: 'flex', position: 'relative', minHeight: 72 }}>
              {/* ===== 左列：时间线指示器 + 节点信息 ===== */}
              <div style={{ display: 'flex', flex: 1, minWidth: 0 }}>
                {/* 左侧圆圈 + 竖线 */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 36, flexShrink: 0 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: CIRCLE_BG[node.status] || '#f5f5f5',
                    border: `2px solid ${CIRCLE_BORDER[node.status] || '#999'}`,
                    fontSize: 12, fontWeight: 600, color: CIRCLE_BORDER[node.status] || '#999', fontFamily: "'Helvetica Neue', Arial, sans-serif",
                    cursor: onNodeStatusClick ? 'pointer' : 'default',
                    transition: 'all 0.15s', userSelect: 'none',
                  }}
                    onClick={() => onNodeStatusClick?.(node.id)} title="点击切换状态">
                    {CIRCLE_SYMBOL[node.status] || node.nodeNo}
                  </div>
                  {!isLast && <div style={{ width: 2, flex: 1, background: '#e8e8e8', minHeight: 12 }} />}
                </div>

                {/* 节点信息区 */}
                <div style={{ marginLeft: 10, flex: 1, paddingBottom: isLast ? 0 : 10, minWidth: 0, paddingRight: 16 }}>
                  {/* 第一行：名称 + 状态 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: '#1a2634', letterSpacing: 0.3 }}>{node.name}</span>
                    <Tag color={TAG_COLORS[node.status]} style={{ margin: 0, fontSize: 11, lineHeight: '18px', borderRadius: 3 }}>
                      {STATUS_LABELS[node.status]}
                    </Tag>
                    {node.history.length > 0 && (
                      <span style={{ cursor: 'pointer', color: '#bbb', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                        onClick={() => showHistory(node)}>
                        <HistoryOutlined style={{ fontSize: 10 }} /> <span style={{ fontSize: 10 }}>{node.history.length}次变更</span>
                      </span>
                    )}
                  </div>

                  {/* 第二行：计划时间 */}
                  <div style={{ fontSize: 13, color: '#999', lineHeight: '24px', display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ color: '#bbb', fontSize: 12, marginRight: 2 }}>计划</span>
                    {editing?.id === node.id && editing?.field === 'plannedStartDate' ? (
                      <input ref={inputRef} type="date" value={editVal} className="dt-hide"
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); }}
                        style={{ width: 105, fontSize: 13, border: 'none', borderBottom: '1px solid #00509e', outline: 'none', padding: 0, background: 'transparent', color: '#00509e' }}
                      />
                    ) : (
                      <span onClick={() => node.status !== 'completed' && (setEditing({ id: node.id, field: 'plannedStartDate' }), setEditVal(node.plannedStartDate))}
                        style={{ cursor: node.status !== 'completed' ? 'pointer' : 'default', color: getDateColor('plannedStartDate'), fontWeight: getDateWeight('plannedStartDate') }}>
                        {shortDate(node.plannedStartDate)}
                      </span>
                    )}
                    <span style={{ color: '#d0d0d0', margin: '0 2px' }}>~</span>
                    {editing?.id === node.id && editing?.field === 'plannedEndDate' ? (
                      <input ref={inputRef} type="date" value={editVal} className="dt-hide"
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); }}
                        style={{ width: 105, fontSize: 13, border: 'none', borderBottom: '1px solid #00509e', outline: 'none', padding: 0, background: 'transparent', color: '#00509e' }}
                      />
                    ) : (
                      <span onClick={() => node.status !== 'completed' && (setEditing({ id: node.id, field: 'plannedEndDate' }), setEditVal(node.plannedEndDate))}
                        style={{ cursor: node.status !== 'completed' ? 'pointer' : 'default', color: getDateColor('plannedEndDate'), fontWeight: getDateWeight('plannedEndDate') }}>
                        {shortDate(node.plannedEndDate)}
                      </span>
                    )}

                    {/* 实际完成 */}
                    {node.status === 'completed' && node.actualDate && (
                      <span style={{ marginLeft: 6, paddingLeft: 8, borderLeft: '1px solid #e8e8e8', fontSize: 12, color: '#999' }}>
                        完成 <strong style={{ color: '#1a6b3c', fontWeight: 500 }}>{shortDate(node.actualDate)}</strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ===== 分隔线 + 右列：补充说明 ===== */}
              <div style={{ width: 1, background: '#e8e8e8', flexShrink: 0, margin: '4px 0', height: 'auto' }} />
              <div style={{ width: 1300, flexShrink: 0, paddingLeft: 12, paddingBottom: isLast ? 0 : 10 }}>
                {editingComments === node.id ? (
                  <textarea
                    value={commentsVal}
                    onChange={e => setCommentsVal(e.target.value)}
                    onBlur={commitComments}
                    onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) commitComments(); if (e.key === 'Escape') setEditingComments(null); }}
                    rows={2}
                    placeholder="输入补充说明…"
                    autoFocus
                    style={{ width: '100%', fontSize: 13, border: '1px solid #d9d9d9', borderRadius: 4, padding: '6px 8px', resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
                  />
                ) : node.comments ? (
                  <div onClick={() => startEditComments(node.id, node.comments)}
                    style={{
                      cursor: 'pointer', fontSize: 13, lineHeight: 1.6, wordBreak: 'break-word',
                      background: COMMENT_COLORS[idx % COMMENT_COLORS.length],
                      borderRadius: 4, padding: '5px 10px', display: 'inline-block',
                      color: '#2c3e50',
                    }}>
                    {node.comments}
                  </div>
                ) : (
                  <div onClick={() => startEditComments(node.id, '')}
                    style={{ cursor: 'pointer', minHeight: 28, width: '100%' }} />
                )}
              </div>
            </div>
          );
        })}

        {/* 底部操作按钮 — 在节点列正下方居中 */}
        <div style={{ display: onSavePlan || onSubmitPlan ? 'flex' : 'none' }}>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 16, paddingTop: 12, paddingRight: 16 }}>
            {!!onSavePlan && (
              <div onClick={onSavePlan} style={{
                width: 42, height: 42, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: hasChanges ? '#00509e' : '#d9d9d9', cursor: 'pointer', fontSize: 24,
                transition: 'all 0.2s', userSelect: 'none',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = hasChanges ? 'rgba(0,80,158,0.06)' : 'transparent'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                title="保存">
                <SaveOutlined style={{ fontWeight: 800 }} />
              </div>
            )}
            {!!onSubmitPlan && (
              <div onClick={onSubmitPlan} style={{
                width: 42, height: 42, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: hasChanges ? '#1a6b3c' : '#d9d9d9', cursor: 'pointer', fontSize: 24,
                transition: 'all 0.2s', userSelect: 'none',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = hasChanges ? 'rgba(26,107,60,0.06)' : 'transparent'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                title="提交审批">
                <SendOutlined style={{ fontWeight: 800 }} />
              </div>
            )}
          </div>
          <div style={{ width: 1, background: '#e8e8e8', flexShrink: 0, margin: '4px 0' }} />
          <div style={{ width: 1300, flexShrink: 0 }} />
        </div>
      </div>
    </div>
  );
};

export default DeliveryNodeTimeline;
