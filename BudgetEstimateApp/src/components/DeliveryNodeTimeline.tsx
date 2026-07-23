import React, { useState, useEffect } from 'react';
import { Tag, Modal } from 'antd';
import { HistoryOutlined, SaveOutlined, SendOutlined, DownloadOutlined } from '@ant-design/icons';
import type { DeliveryNode } from '../types';
import IconButton from './IconButton';
import { COLORS, TAG_COLORS as COMMENT_TAG_COLORS } from '../styles/colors';

interface Props {
  nodes: DeliveryNode[];
  locked?: boolean;
  hasChanges?: boolean;
  onNodeStatusClick?: (nodeId: string, newStatus: string) => void;
  onPlannedDateChange?: (nodeId: string, field: 'plannedStartDate' | 'plannedEndDate', date: string) => void;
  onCommentsChange?: (nodeId: string, comments: string) => void;
  planStatus?: string;
  onSavePlan?: () => void;
  onSubmitPlan?: () => void;
  onExportPlan?: () => void;
  saving?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '未开始', in_progress: '进行中', completed: '已完成',
};

/** 说明标签颜色表（深色系，按 nodeNo 轮转）—— 从 constants 导入 */

/** 取节点基准计划日期（审批通过时的计划时间），无基准时用当前计划时间 */
function getNodeBaseline(node: DeliveryNode): string {
  return node.baselineEndDate || node.baselinePlannedEndDate || node.plannedEndDate || '';
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
  fontWeight: 600, background: COLORS.bgLight, whiteSpace: 'nowrap', color: COLORS.labelDark,
};

const DeliveryNodeTimeline: React.FC<Props> = ({
  nodes, locked = false, hasChanges = false,
  onNodeStatusClick, onPlannedDateChange, onCommentsChange,
  planStatus = 'draft',
  onSavePlan, onSubmitPlan, onExportPlan,
  saving = false,
}) => {
  const sorted = [...nodes].sort((a, b) => a.nodeNo - b.nodeNo);
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
      width: 500,
      content: (
        <div style={{ position: 'relative', paddingLeft: 24 }}>
          <div style={{ position: 'absolute', left: 11, top: 4, bottom: 4, width: 2, background: COLORS.border }} />
          {[...node.history].reverse().map(h => (
            <div key={h.id} style={{ position: 'relative', paddingBottom: 12 }}>
              <div style={{ position: 'absolute', left: -20, top: 4, width: 12, height: 12, borderRadius: '50%', background: COLORS.primary, border: '2px solid #fff' }} />
              <div style={{ fontSize: 13, color: COLORS.textDark, fontWeight: 600 }}>
                {h.field === 'status' ? '状态变更' : '计划日期变更'}
              </div>
              {/* 新版格式（含修改人） */}
              {h.modifier ? (
                <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4, lineHeight: 1.8 }}>
                  <div style={{ color: COLORS.textLight }}>{h.modifier}@{h.changedAtFull || h.changedAt}</div>
                  {h.oldValue.includes('开始:') || h.oldValue.includes('结束:') ? (
                    h.oldValue.split(', ').map((part, i) => {
                      const newPart = h.newValue.split(', ')[i] || '';
                      return <div key={i}>{part.replace('开始: ', '开始 ').replace('结束: ', '结束 ')} → {newPart.replace('开始: ', '').replace('结束: ', '')}</div>;
                    })
                  ) : (
                    <div>{h.oldValue || '—'} → {h.newValue}</div>
                  )}
                </div>
              ) : (
                /* 旧版格式（兼容无 modifier 的旧数据） */
                <>
                  <div style={{ fontSize: 12, color: COLORS.textLight }}>{h.changedAt}</div>
                  <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>
                    {h.oldValue || '—'} → {h.newValue}
                  </div>
                </>
              )}
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
          <tr style={{ background: COLORS.bgLight }}>
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
            const planDays = workDays(node.plannedStartDate, node.plannedEndDate);
            const startDate = node.actualStartDate || (node.history.find(h => h.field === 'status' && h.newValue === 'in_progress')?.changedAt) || null;
            const actualDays = node.status === 'completed' && node.actualDate && startDate
              ? workDays(startDate, node.actualDate) : 0;

            return (
              <tr key={node.id} style={{ background: node.status === 'completed' ? COLORS.bgLight : '#fff' }}>
                <td style={{ ...cellStyle, textAlign: 'center', padding: '4px 2px', verticalAlign: 'middle', position: 'relative' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: node.status === 'completed' ? 14 : 10, fontWeight: 700, color: node.status === 'completed' ? COLORS.primary : node.status === 'in_progress' ? COLORS.primary : COLORS.textLight,
                      cursor: onNodeStatusClick ? 'pointer' : 'default', userSelect: 'none',
                    }}
                      onClick={() => { if (onNodeStatusClick && !locked) setStatusDropdown(statusDropdown === node.id ? null : node.id); }}
                      title="点击选择状态">
                      <span style={{ marginLeft: 1 }}>{node.status === 'completed' ? '⚑' : node.status === 'in_progress' ? '▶' : node.nodeNo}</span>
                    </div>
                    {statusDropdown === node.id && (
                      <div style={{
                        position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 28, zIndex: 50,
                        background: '#fff', border: `1px solid ${COLORS.borderInput}`, borderRadius: 4,
                        minWidth: 72, boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      }}>
                        {(node.status === 'pending' ? ['in_progress'] : node.status === 'in_progress' ? ['completed'] : node.status === 'delayed' ? ['completed', 'in_progress'] : ['pending', 'in_progress']).map(st => (
                          <div key={st} onClick={() => { onNodeStatusClick?.(node.id, st); setStatusDropdown(null); }}
                            style={{
                              padding: '4px 12px', cursor: 'pointer', fontSize: 12,
                              background: node.status === st ? '#f0f6ff' : '#fff',
                              color: node.status === st ? COLORS.primary : COLORS.textPrimary,
                              borderBottom: `1px solid ${COLORS.bgTag}`,
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
                  {(() => {
                    const refDate = getNodeBaseline(node);
                    if (node.status === 'completed' && (node.actualDate || node.actualEndDate)) {
                      // 已完成：实际完成日 vs 基准计划日（超期正/提前负）
                      const actualEnd = node.actualDate || node.actualEndDate!;
                      const dd = Math.round((new Date(actualEnd).getTime() - new Date(refDate).getTime()) / 86400000);
                      return dd > 0
                        ? <Tag color={COLORS.danger} style={{ margin: 0, borderRadius: 3, fontSize: 11, lineHeight: '22px', border: 'none' }}>+{dd}</Tag>
                        : dd < 0
                        ? <Tag color={COLORS.success} style={{ margin: 0, borderRadius: 3, fontSize: 11, lineHeight: '22px', border: 'none' }}>{dd}</Tag>
                        : <Tag color={COLORS.success} style={{ margin: 0, borderRadius: 3, fontSize: 11, lineHeight: '22px', border: 'none' }}>0</Tag>;
                    }
                    if (node.status !== 'completed') {
                      // 未完成：当前时间 vs 基准日期（通过审批的初始计划）
                      if (!refDate) return <Tag color="default" style={{ margin: 0, borderRadius: 3, fontSize: 11, lineHeight: '22px', border: 'none', color: '#bbb' }}>—</Tag>;
                      const dd = Math.round((new Date().getTime() - new Date(refDate).getTime()) / 86400000);
                      const hasBaseline = !!node.baselineEndDate || !!node.baselinePlannedEndDate;
                      if (dd > 0) return <Tag color={COLORS.danger} style={{ margin: 0, borderRadius: 3, fontSize: 11, lineHeight: '22px', border: 'none' }}>+{dd}</Tag>;
                      // 提前天数仅在存在基准（审批通过的计划）时显示
                      if (dd < 0 && hasBaseline) return <Tag color={COLORS.success} style={{ margin: 0, borderRadius: 3, fontSize: 11, lineHeight: '22px', border: 'none' }}>{dd}</Tag>;
                      return <Tag color="default" style={{ margin: 0, borderRadius: 3, fontSize: 11, lineHeight: '22px', border: 'none', color: '#bbb' }}>—</Tag>;
                    }
                    return <Tag color="default" style={{ margin: 0, borderRadius: 3, fontSize: 11, lineHeight: '22px', border: 'none', color: '#bbb' }}>—</Tag>;
                  })()}
                </td>
                <td style={cellStyle}>
                  <span style={{ fontSize: 12, color: COLORS.textSecondary }}>
                    {editing?.id === node.id && editing?.field === 'plannedStartDate' ? (
                      <input ref={inputRef} type="date" value={editVal} className="dt-hide"
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); }}
                        style={{ width: 95, fontSize: 12, border: 'none', borderBottom: `1px solid ${COLORS.primary}`, outline: 'none', padding: 0, background: 'transparent', color: COLORS.primary }} />
                    ) : (
                      <span onClick={() => !locked && node.status !== 'completed' && (setEditing({ id: node.id, field: 'plannedStartDate' }), setEditVal(node.plannedStartDate))}
                        style={{ cursor: !locked && node.status !== 'completed' ? 'pointer' : 'default', color: COLORS.primary }}>
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
                      <span onClick={() => !locked && node.status !== 'completed' && (setEditing({ id: node.id, field: 'plannedEndDate' }), setEditVal(node.plannedEndDate))}
                        style={{ cursor: !locked && node.status !== 'completed' ? 'pointer' : 'default', color: COLORS.primary }}>
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
                <td style={{ ...cellStyle, textAlign: 'center', fontSize: 11, color: COLORS.textMuted }}>{planDays}</td>
                <td style={{ ...cellStyle, textAlign: 'center', fontSize: 12, color: node.status === 'completed' ? COLORS.primary : COLORS.primary }}>
                  {node.status === 'in_progress' && node.actualStartDate ? shortDate(node.actualStartDate) :
                   node.status === 'completed' && node.actualDate ? (() => {
                    const startD = node.actualStartDate || (node.history.find(h => h.field === 'status' && h.newValue === 'in_progress')?.changedAt) || null;
                    return <span>{startD ? shortDate(startD) : '—'}~{shortDate(node.actualDate)}</span>;
                  })() : '—'}
                </td>
                <td style={{ ...cellStyle, textAlign: 'center', fontSize: 11, color: COLORS.textMuted }}>
                  {node.status === 'completed' ? (() => {
                    return <span>{node.status === 'completed' && actualDays > 0 ? <span style={{ color: COLORS.primary, fontWeight: 600 }}>{actualDays}</span> : '—'}</span>;
                  })() : (actualDays > 0 ? <span style={{ color: COLORS.primary, fontWeight: 600 }}>{actualDays}</span> : '—')}
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
                    <span onClick={() => !locked && startEditComments(node.id, node.comments || '')}
                      style={{ cursor: locked ? 'default' : 'pointer', display: 'block', minHeight: 20 }}>
                      {node.comments ? (
                        <Tag color={COMMENT_TAG_COLORS[Math.abs(node.nodeNo - 1) % COMMENT_TAG_COLORS.length]}
                          style={{ margin: 0, borderRadius: 3, fontSize: 12, lineHeight: '20px', border: 'none' }}>
                          {node.comments}
                        </Tag>
                      ) : (
                        <span style={{ fontSize: 12, color: COLORS.textDisabled }}>点击添加</span>
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
            disabled={locked || !hasChanges || saving} />
        )}
        {!!onSubmitPlan && (
          <IconButton icon={<SendOutlined style={{ fontWeight: 700 }} />}
            onClick={onSubmitPlan} color={COLORS.primary} hoverBg="#e6f0fa" title="提交审批"
            disabled={planStatus === "pending" || planStatus === "approved"} />
        )}
        {!!onExportPlan && (
          <IconButton icon={<DownloadOutlined style={{ fontWeight: 700 }} />}
            onClick={onExportPlan} color={COLORS.success} hoverBg="#e8f5e9" title="导出" />
        )}
      </div>
    </div>
  );
};

export default DeliveryNodeTimeline;
