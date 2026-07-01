import React, { useState, useRef, useEffect } from 'react';
import { Tag, Modal } from 'antd';
import { HistoryOutlined, SaveOutlined, SendOutlined, DownloadOutlined } from '@ant-design/icons';
import type { DeliveryNode } from '../types';
import IconButton from './IconButton';
import { COLORS } from '../styles/constants';

interface Props {
  nodes: DeliveryNode[];
  locked?: boolean;
  hasChanges?: boolean;
  onNodeStatusClick?: (nodeId: string, newStatus: string) => void;
  onPlannedDateChange?: (nodeId: string, field: 'plannedStartDate' | 'plannedEndDate', date: string) => void;
  onCommentsChange?: (nodeId: string, comments: string) => void;
  onSavePlan?: () => void;
  onSubmitPlan?: () => void;
  onExportPlan?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '未开始', in_progress: '进行中', completed: '已完成',
};

/** 说明标签颜色表（深色系，按 nodeNo 轮转） */
const COMMENT_TAG_COLORS = [
  '#c0392b', '#d35400', '#e67e22', '#d4ac0d', '#27ae60',
  '#1abc9c', '#2980b9', '#2c3e50', '#7d3c98', '#a04000',
  '#5d6d7e', '#b03a2e', '#1f618d', '#1e8449', '#6c3483',
];

/** 判断节点是否延期 */
function isNodeDelayed(node: DeliveryNode): boolean {
  if (node.status === 'completed') return false;
  return new Date(node.plannedEndDate) < new Date();
}

/** 计算工作日 */
function workDays(start: string, end: string): number {
  const s = new Date(start), e = new Date(end);
  if (s > e) return 0;
  let days = 0;
  const cur = new Date(s);
  while (cur <= e) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function shortDate(d: string) { return d ? d.slice(2) : '—'; }

const cellStyle: React.CSSProperties = {
  padding: '6px 8px', fontSize: 13, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle',
};
const labelStyle: React.CSSProperties = {
  ...cellStyle,
  fontWeight: 600, background: COLORS.bgLight, whiteSpace: 'nowrap', color: '#1a2744',
};

const DeliveryNodeTimeline: React.FC<Props> = ({
  nodes, locked = false, hasChanges = false,
  onNodeStatusClick, onPlannedDateChange, onCommentsChange,
  onSavePlan, onSubmitPlan, onExportPlan,
}) => {
  const sorted = [...nodes].sort((a, b) => a.nodeNo - b.nodeNo);
  const [editing, setEditing] = useState<{ id: string; field: 'plannedStartDate' | 'plannedEndDate' } | null>(null);
  const [editVal, setEditVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  // Inject one-time style
  useEffect(() => {
    const s = document.createElement('style');
    s.textContent = 'input.dt-hide::-webkit-calendar-picker-indicator { display: none }';
    document.head.appendChild(s);
    return () => s.remove();
  }, []);

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
              <div style={{ position: 'absolute', left: -20, top: 4, width: 12, height: 12, borderRadius: '50%', background: COLORS.primary, border: '2px solid #fff' }} />
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

  const [statusDropdown, setStatusDropdown] = useState<string | null>(null);
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
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 72 }} />
          <col style={{ width: 184 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 240 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 240 }} />
          <col style={{ width: 96 }} />
          <col />
        </colgroup>
        <thead>
          <tr style={{ background: '#fafafa' }}>
            <th style={{ ...labelStyle, textAlign: 'center' }} />
            <th style={labelStyle}>节点名称</th>
            <th style={{ ...labelStyle, textAlign: 'center' }}>延期天数</th>
            <th style={labelStyle}>计划时间</th>
            <th style={{ ...labelStyle, textAlign: 'center' }}>计划天数</th>
            <th style={labelStyle}>实际时间</th>
            <th style={{ ...labelStyle, textAlign: 'center' }}>实际天数</th>
            <th style={labelStyle}>说明</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(node => {
            const delayed = isNodeDelayed(node);
            const planDays = workDays(node.plannedStartDate, node.plannedEndDate);
            const startEntry = node.history.find(h => h.field === 'status' && h.newValue === 'in_progress');
            const actualDays = node.status === 'completed' && node.actualDate && startEntry
              ? workDays(startEntry.changedAt, node.actualDate) : 0;

            return (
              <tr key={node.id} style={{ background: node.status === 'completed' ? '#fafafa' : '#fff' }}>
                <td style={{ ...cellStyle, textAlign: 'center', padding: '4px 2px', verticalAlign: 'middle', position: 'relative' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: node.status === 'completed' ? 14 : 10, fontWeight: 700, color: node.status === 'completed' ? COLORS.primary : node.status === 'in_progress' ? COLORS.primary : '#999',
                      cursor: onNodeStatusClick ? 'pointer' : 'default', userSelect: 'none',
                    }}
                      onClick={() => { if (onNodeStatusClick) setStatusDropdown(statusDropdown === node.id ? null : node.id); }}
                      title="点击选择状态">
                      <span style={{ marginLeft: 1 }}>{node.status === 'completed' ? '⚑' : node.status === 'in_progress' ? '▶' : node.nodeNo}</span>
                    </div>
                    {statusDropdown === node.id && (
                      <div style={{
                        position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 28, zIndex: 50,
                        background: '#fff', border: '1px solid #d9d9d9', borderRadius: 4,
                        minWidth: 72, boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      }}>
                        {['pending', 'in_progress', 'completed'].map(st => (
                          <div key={st} onClick={() => { onNodeStatusClick?.(node.id, st); setStatusDropdown(null); }}
                            style={{
                              padding: '4px 12px', cursor: 'pointer', fontSize: 12,
                              background: node.status === st ? '#f0f6ff' : '#fff',
                              color: node.status === st ? COLORS.primary : '#333',
                              borderBottom: '1px solid #f5f5f5',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f5f8ff'}
                            onMouseLeave={e => e.currentTarget.style.background = node.status === st ? '#f0f6ff' : '#fff'}
                          >{STATUS_LABELS[st]}</div>
                        ))}
                      </div>
                    )}
                </td>
                <td style={cellStyle}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1a2634' }}>{node.name}</span>
                </td>
                <td style={{ ...cellStyle, textAlign: 'center', padding: '10px 8px 6px' }}>
                  {delayed ? (
                    <Tag color={COLORS.danger} style={{ margin: 0, borderRadius: 3, fontSize: 11, lineHeight: '22px', border: 'none' }}>
                      {Math.round((new Date().getTime() - new Date(node.plannedEndDate).getTime()) / (1000 * 60 * 60 * 24))}天
                    </Tag>
                  ) : (
                    <Tag color="default" style={{ margin: 0, borderRadius: 3, fontSize: 11, lineHeight: '22px', border: 'none', color: '#bbb' }}>—</Tag>
                  )}
                </td>
                <td style={cellStyle}>
                  <span style={{ fontSize: 12, color: '#666' }}>
                    {editing?.id === node.id && editing?.field === 'plannedStartDate' ? (
                      <input ref={inputRef} type="date" value={editVal} className="dt-hide"
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); }}
                        style={{ width: 95, fontSize: 12, border: 'none', borderBottom: `1px solid ${COLORS.primary}`, outline: 'none', padding: 0, background: 'transparent', color: COLORS.primary }} />
                    ) : (
                      <span onClick={() => node.status !== 'completed' && (setEditing({ id: node.id, field: 'plannedStartDate' }), setEditVal(node.plannedStartDate))}
                        style={{ cursor: node.status !== 'completed' ? 'pointer' : 'default', color: COLORS.primary }}>
                        {shortDate(node.plannedStartDate)}
                      </span>
                    )}
                    <span style={{ color: '#d0d0d0', margin: '0 2px' }}>~</span>
                    {editing?.id === node.id && editing?.field === 'plannedEndDate' ? (
                      <input ref={inputRef} type="date" value={editVal} className="dt-hide"
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); }}
                        style={{ width: 95, fontSize: 12, border: 'none', borderBottom: `1px solid ${COLORS.primary}`, outline: 'none', padding: 0, background: 'transparent', color: COLORS.primary }} />
                    ) : (
                      <span onClick={() => node.status !== 'completed' && (setEditing({ id: node.id, field: 'plannedEndDate' }), setEditVal(node.plannedEndDate))}
                        style={{ cursor: node.status !== 'completed' ? 'pointer' : 'default', color: COLORS.primary }}>
                        {shortDate(node.plannedEndDate)}
                      </span>
                    )}
                  </span>
                  {node.history.length > 0 && (
                    <span style={{ cursor: 'pointer', color: '#bbb', fontSize: 10, marginLeft: 4 }}
                      onClick={() => showHistory(node)}>
                      <HistoryOutlined style={{ fontSize: 10 }} /> {node.history.length}次
                    </span>
                  )}
                </td>
                <td style={{ ...cellStyle, textAlign: 'center', fontSize: 11, color: '#8892a4' }}>{planDays}天</td>
                <td style={{ ...cellStyle, textAlign: 'center', fontSize: 12, color: node.status === 'completed' ? COLORS.primary : '#ccc' }}>
                  {node.status === 'completed' && node.actualDate ? (() => {
                    const startH = node.history.find(h => h.field === 'status' && h.newValue === 'in_progress');
                    return <span>{startH ? shortDate(startH.changedAt) : '—'}~{shortDate(node.actualDate)}</span>;
                  })() : '—'}
                </td>
                <td style={{ ...cellStyle, textAlign: 'center', fontSize: 11, color: '#8892a4' }}>
                  {actualDays > 0 ? <span style={{ color: COLORS.primary, fontWeight: 600 }}>{actualDays}天</span> : '—'}
                </td>
                <td style={cellStyle}>
                  {editingComments === node.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <input value={commentsVal}
                        onChange={e => setCommentsVal(e.target.value)}
                        onBlur={commitComments}
                        onKeyDown={e => { if (e.key === 'Enter') commitComments(); if (e.key === 'Escape') setEditingComments(null); }}
                        style={{ width: '100%', border: `1px solid ${COLORS.primary}`, borderRadius: 3, padding: '1px 4px', fontSize: 12, outline: 'none' }}
                        autoFocus
                      />
                    </div>
                  ) : (
                    <span onClick={() => startEditComments(node.id, node.comments || '')}
                      style={{ cursor: 'pointer', display: 'block', minHeight: 20 }}>
                      {node.comments ? (
                        <Tag color={COMMENT_TAG_COLORS[(node.nodeNo - 1) % COMMENT_TAG_COLORS.length]}
                          style={{ margin: 0, borderRadius: 3, fontSize: 12, lineHeight: '20px', border: 'none' }}>
                          {node.comments}
                        </Tag>
                      ) : (
                        <span style={{ fontSize: 12, color: '#ccc' }}>点击添加</span>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* 底部操作按钮 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 16 }}>
        {!!onSavePlan && (
          <IconButton icon={<SaveOutlined style={{ fontWeight: 700 }} />}
            onClick={onSavePlan} color="#d46b08" hoverBg="#fff7e6" title="保存"
            disabled={locked || !hasChanges} />
        )}
        {!!onSubmitPlan && (
          <IconButton icon={<SendOutlined style={{ fontWeight: 700 }} />}
            onClick={onSubmitPlan} color="#00509e" hoverBg="#e6f0fa" title="提交审批"
            disabled={locked || !hasChanges} />
        )}
        {!!onExportPlan && (
          <IconButton icon={<DownloadOutlined style={{ fontWeight: 700 }} />}
            onClick={onExportPlan} color="#1a6b3c" hoverBg="#e8f5e9" title="导出" />
        )}
      </div>
    </div>
  );
};

export default DeliveryNodeTimeline;
