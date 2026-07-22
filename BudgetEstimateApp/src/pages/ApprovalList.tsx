import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Tag, Button, Modal, Input, message, Empty } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, EyeOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { approvalService } from '../services/approvalService';
import { deliveryService } from '../services/deliveryService';
import { projectService } from '../services/projectService';
import { quotationService } from '../services/quotationService';
import { opportunityService } from '../services/opportunityService';
import { formatMoney } from '../utils/calculations';
import { formatBeijing } from '../utils/timeFormat';
import type { ApprovalRequest, QuotationSummary, DeliveryProject } from '../types';
import { COLORS } from '../styles/constants';
import { useAuth } from '../utils/authContext';

const statusConfig: Record<string, { label: string; color: string }> = {
  pending:  { label: '待审批', color: COLORS.warning },
  approved: { label: '已通过', color: COLORS.success },
  rejected: { label: '已驳回', color: COLORS.danger },
};

const typeColor = (t: string) => t === 'quotation' ? COLORS.primary : t === 'plan' ? COLORS.warning : t === 'cost' ? COLORS.success : COLORS.purple;

interface DraftItem {
  id: string;
  approvalType: 'quotation' | 'plan' | 'cost' | 'promote';
  clientName: string;
  projectName: string;
  salesNo: string;
  amount: number;
  submitter: string;
  quotationId?: string;
  deliveryId?: string;
}

const ApprovalList: React.FC = () => {
  const navigate = useNavigate();
  const [msg, ctx] = message.useMessage();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [draftQuotations, setDraftQuotations] = useState<QuotationSummary[]>([]);
  const [draftDeliveries, setDraftDeliveries] = useState<DeliveryProject[]>([]);

  useEffect(() => {
    let cancelled = false;
    approvalService.list().then(res => { if (!cancelled) setRequests(res); }).catch(() => { if (!cancelled) setRequests([]); });
    quotationService.list().then(res => { if (!cancelled) setDraftQuotations(res); }).catch(() => { if (!cancelled) setDraftQuotations([]); });
    deliveryService.list().then(res => { if (!cancelled) setDraftDeliveries(res); }).catch(() => { if (!cancelled) setDraftDeliveries([]); });
    return () => { cancelled = true; };
  }, []);

  const { user } = useAuth();
  const [filter, setFilter] = useState<'draft' | 'pending' | 'done' | 'all' | 'mine'>('pending');
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [detailModal, setDetailModal] = useState<ApprovalRequest | null>(null);

  const filtered = useMemo(() => {
    const q = searchText.toLowerCase();
    const filteredBySearch = requests.filter(r => {
      if (q && !r.clientName.toLowerCase().includes(q) &&
          !r.salesNo.toLowerCase().includes(q) &&
          !r.projectName.toLowerCase().includes(q) &&
          !r.submitter.toLowerCase().includes(q)) return false;
      if (typeFilter && r.approvalType !== typeFilter) return false;
      return true;
    });
    const sorted = [...filteredBySearch].sort((a, b) => {
      const ta = new Date(a.submitTime).getTime();
      const tb = new Date(b.submitTime).getTime();
      return tb - ta;
    });
    if (filter === 'pending') return sorted.filter(r => r.status === 'pending');
    if (filter === 'done') return sorted.filter(r => r.status !== 'pending');
    if (filter === 'mine') return sorted.filter(r => r.submitter === (user?.displayName || ''));
    return sorted;
  }, [requests, filter, searchText, typeFilter, user]);

  const draftItems = useMemo(() => {
    const items: DraftItem[] = [];
    for (const q of draftQuotations) {
      if (q.status === 'draft') items.push({ id: 'dq-' + q.id, approvalType: 'quotation', clientName: q.clientName, projectName: q.projectName, salesNo: q.salesNo, amount: q.amount, submitter: '方案经理', quotationId: q.id });
    }
    for (const p of draftDeliveries) {
      if (p.planStatus === 'draft') items.push({ id: 'dp-' + p.id, approvalType: 'plan', clientName: p.clientName, projectName: p.projectName, salesNo: p.salesNo, amount: p.contractAmount, submitter: '方案经理', deliveryId: p.id, quotationId: p.quotationId });
      if (p.costStatus === 'draft') items.push({ id: 'dc-' + p.id, approvalType: 'cost', clientName: p.clientName, projectName: p.projectName, salesNo: p.salesNo, amount: p.contractAmount, submitter: '交付经理', deliveryId: p.id, quotationId: p.quotationId });
    }
    return items;
  }, [draftQuotations, draftDeliveries]);

  const [approvalModal, setApprovalModal] = useState<{ req: ApprovalRequest; action: 'approved' | 'rejected' } | null>(null);
  const [approvalComment, setApprovalComment] = useState('');

  const handleApprove = useCallback((req: ApprovalRequest) => {
    setApprovalModal({ req, action: 'approved' });
    setApprovalComment('');
  }, []);

  const handleReject = useCallback((req: ApprovalRequest) => {
    setApprovalModal({ req, action: 'rejected' });
    setApprovalComment('');
  }, []);

  const confirmApproval = useCallback(async () => {
    const modal = approvalModal;
    if (!modal) return;
    if (modal.action === 'rejected' && !approvalComment.trim()) {
      msg.warning('驳回必须填写原因');
      return;
    }
    try {
      const newStatus = modal.action === 'approved' ? 'approved' : 'rejected';
      // 更新审批请求状态 + 写入审批记录（含审批人、原因、时间）
      await approvalService.update(modal.req.id, { status: newStatus });
      await approvalService.createRecord(modal.req.id, {
        reviewer: user?.displayName || '审批人',
        action: modal.action,
        comment: approvalComment,
      }).catch((e: any) => { console.warn('[Approval] 创建审批记录失败:', e); msg.error('审批记录创建失败'); });
      // 重新加载列表确保 latestRecord 数据最新
      approvalService.list().then(res => setRequests(res)).catch(() => {});
      const cascadeUpdates: Promise<unknown>[] = [];
      if (modal.req.approvalType === 'quotation' && modal.req.quotationId) {
        cascadeUpdates.push(
          (async () => {
            // 更新报价表的 locked 和 status
            const updated = await quotationService.update(modal.req.quotationId, { status: newStatus, locked: false });
            // ⚠️ 同步更新项目版本的审核状态（否则 QuotationPage 加载时仍视为 pending 而锁定）
            const pid = (updated as any).projectId;
            if (pid && modal.req.versionNo) {
              await projectService.updateVersionStatus(pid, modal.req.versionNo, newStatus);
            }
          })(),
        );
      }
      if (modal.req.deliveryId) {
        const appraisal = { reviewer: user?.displayName || '审批人', action: modal.action, comment: approvalComment, createdAt: new Date().toISOString() };
        if (modal.req.approvalType === 'plan') cascadeUpdates.push(deliveryService.update(modal.req.deliveryId, { planStatus: newStatus, planApproval: appraisal }));
        else if (modal.req.approvalType === 'cost') cascadeUpdates.push(deliveryService.update(modal.req.deliveryId, { costStatus: newStatus, costApproval: appraisal }));
      }
      if (modal.req.approvalType === 'promote' && modal.req.opportunityId) {
        cascadeUpdates.push(
          opportunityService.update(modal.req.opportunityId, {
            promoteLocked: false,
            stage: modal.action === 'approved' ? '机会' : undefined,
          })
        );
      }
      if (cascadeUpdates.length > 0) await Promise.all(cascadeUpdates);
      if (modal.action === 'approved') msg.success('已通过');
      else msg.warning('已驳回');
      setApprovalModal(null);
    } catch {
      msg.error('审批操作失败，请重试');
    }
  }, [approvalModal, approvalComment, msg, user]);

  return (
    <div>
      {ctx}
      <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark, marginBottom: 24 }}>审批管理</div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 20 }}>
        <div onClick={() => setFilter('draft')}
          style={{ padding: '8px 20px', cursor: 'pointer', fontSize: 14, borderBottom: filter === 'draft' ? `2px solid ${COLORS.textLight}` : '2px solid transparent', color: filter === 'draft' ? COLORS.textLight : COLORS.textSecondary, fontWeight: filter === 'draft' ? 600 : 400, marginBottom: -2, transition: 'all 0.15s' }}>草稿({draftItems.length})</div>
        <div onClick={() => setFilter('pending')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: filter === 'pending' ? `2px solid ${COLORS.warning}` : '2px solid transparent',
            color: filter === 'pending' ? COLORS.warning : COLORS.textSecondary, fontWeight: filter === 'pending' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>待审批({requests.filter(r => r.status === 'pending').length})
        </div>
        <div onClick={() => setFilter('done')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: filter === 'done' ? `2px solid ${COLORS.success}` : '2px solid transparent',
            color: filter === 'done' ? COLORS.success : COLORS.textSecondary, fontWeight: filter === 'done' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>已审批({requests.filter(r => r.status !== 'pending').length})
        </div>
        <div onClick={() => setFilter('mine')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: filter === 'mine' ? `2px solid ${COLORS.primary}` : '2px solid transparent',
            color: filter === 'mine' ? COLORS.primary : COLORS.textSecondary, fontWeight: filter === 'mine' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>我的提交({requests.filter(r => r.submitter === (user?.displayName || '')).length})
        </div>
        <div onClick={() => setFilter('all')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: filter === 'all' ? `2px solid ${COLORS.primary}` : '2px solid transparent',
            color: filter === 'all' ? COLORS.primary : COLORS.textSecondary, fontWeight: filter === 'all' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>全部({requests.length})
        </div>
        <div style={{ flex: 1 }} />
        <table style={{ borderCollapse: 'collapse', marginLeft: 8 }}>
          <tbody>
            <tr>
              <td style={{ padding: '11px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, fontWeight: 600, background: COLORS.bgLight, whiteSpace: 'nowrap', color: COLORS.labelDark }}>搜索</td>
              <td style={{ padding: '11px 12px', border: `1px solid ${COLORS.border}`, verticalAlign: 'middle', width: 220 }}>
                <input placeholder="客户名称/销售编号/项目名称"
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, fontFamily: 'inherit', padding: 0, margin: 0, boxSizing: 'border-box', verticalAlign: 'middle' }} />
              </td>
              <td style={{ padding: '11px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, fontWeight: 600, background: COLORS.bgLight, whiteSpace: 'nowrap', color: COLORS.labelDark }}>类型</td>
              <td style={{ padding: '11px 12px', fontSize: 10, border: `1px solid ${COLORS.border}`, cursor: 'pointer', color: COLORS.primary, background: '#fff', whiteSpace: 'nowrap', userSelect: 'none', width: 130, verticalAlign: 'middle' }}
                onClick={() => {
                  const opts = ['', 'quotation', 'plan', 'cost', 'promote'];
                  const cur = opts.indexOf(typeFilter);
                  setTypeFilter(opts[(cur + 1) % opts.length] as typeof typeFilter);
                }}>
                {typeFilter ? ({ quotation: '报价审批', plan: '实施计划', cost: '成本对比', promote: '转机会审批' }[typeFilter] || typeFilter) : '全部'} ▾
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {filter === 'draft' && draftItems.length === 0 && (
        <Empty description="暂无草稿内容" style={{ padding: 40, background: '#fff', borderRadius: 6 }} />
      )}
      {filter === 'draft' && draftItems.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {draftItems.map(item => (
            <Card key={item.id} size="small" style={{ borderRadius: 4, borderLeft: '4px solid ' + typeColor(item.approvalType) }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.textDark }}>{item.clientName}</span>

                    <Tag color={typeColor(item.approvalType)}
                      style={{ fontSize: 12, border: 'none', fontWeight: 600 }}>
                      {item.approvalType === 'quotation' ? '报价审批' : item.approvalType === 'plan' ? '实施计划' : item.approvalType === 'cost' ? '成本对比' : '转机会审批'}
                    </Tag>
                  </div>
                  <div style={{ display: 'flex', gap: 24, fontSize: 13, color: COLORS.textSecondary, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>{item.projectName}</span>
                    <span>{item.salesNo}</span>
                    <span><strong style={{ color: COLORS.primary }}>&yen;{formatMoney(item.amount)}</strong></span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: COLORS.textLight }}>
                    {item.submitter}@未提交
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginLeft: 16, flexShrink: 0 }}>
                  <Button type="text" size="small" icon={<EyeOutlined style={{ fontSize: 18 }} />}
                    onClick={() => item.approvalType === 'promote' ? navigate('/') : item.deliveryId ? navigate('/delivery/' + item.deliveryId, { state: { tab: item.approvalType === 'cost' ? 'cost' : 'plan' } }) : navigate('/quotations/' + item.quotationId)}
                    style={{ color: COLORS.primary }} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {filter !== 'draft' && filtered.length === 0 && (
        <Empty description="暂无审批记录" style={{ padding: 40, background: '#fff', borderRadius: 6 }} />
      )}
      {filter !== 'draft' && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(req => (
            <Card
              key={req.id}
              size="small"
              style={{
                borderRadius: 4,
                borderLeft: `4px solid ${
                  req.status === 'pending' ? COLORS.warning :
                  req.status === 'approved' ? COLORS.success : COLORS.danger
                }`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.textDark }}>{req.clientName}</span>
                    <span style={{ fontSize: 12, color: COLORS.textLight }}>{req.salesNo}</span>
                    {req.status !== 'pending' && <Tag color={statusConfig[req.status]?.color} style={{ fontWeight: 600, fontSize: 12, lineHeight: '20px', borderRadius: 3 }}>{statusConfig[req.status]?.label}</Tag>}
                    <Tag color={typeColor(req.approvalType)} style={{ fontSize: 12, border: 'none', fontWeight: 600 }}>{req.approvalType === 'quotation' ? '报价审批' : req.approvalType === 'plan' ? '实施计划' : req.approvalType === 'cost' ? '成本对比' : '转机会审批'}</Tag>
                    {req.versionNo && <span style={{ fontSize: 12, color: COLORS.textLight }}>{req.versionNo}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 24, fontSize: 13, color: COLORS.textSecondary, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>{req.projectName}</span>
                    <span><strong style={{ color: COLORS.primary }}>&yen;{formatMoney(req.totalAccountingPrice)}</strong></span>
                    <span><strong style={{ color: COLORS.primary }}>&yen;{formatMoney(req.discountedPrice || 0)}</strong>
                      {req.discountRate !== undefined ? (
                        <span style={{ color: COLORS.textLight, marginLeft: 2 }}>(
                          {(() => { const v = (-req.discountRate * 100); return (v > 0 ? '+' : '') + v.toFixed(1); })()}%)
                        </span>
                      ) : null}
                    </span>
                    <span><strong style={{ color: COLORS.primary }}>&yen;{formatMoney(req.gp3Amount || 0)}</strong> <span style={{ color: COLORS.textLight }}>(<Gauge value={req.gp3 * 100} />%)</span></span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: COLORS.textLight }}>
                    {req.submitter}@{formatBeijing(req.submitTime)}
                  </div>
                  {req.latestRecord && (
                    <div style={{ marginTop: 4, fontSize: 12, color: COLORS.textLight, lineHeight: 1.6 }}>
                      {req.latestRecord.comment}{req.latestRecord.createdAt ? '@' + formatBeijing(req.latestRecord.createdAt) : ''}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginLeft: 16, flexShrink: 0 }}>
                  <Button type="text" size="small" icon={<EyeOutlined style={{ fontSize: 18 }} />}
                    onClick={() => req.approvalType === 'promote' ? navigate('/') : req.deliveryId ? navigate('/delivery/' + req.deliveryId, { state: { tab: req.approvalType === 'cost' ? 'cost' : 'plan' } }) : navigate('/quotations/' + req.quotationId)}
                    style={{ color: COLORS.primary }} />
                  {req.status === 'pending' && (
                    <>
                      <Button type="text" size="small" icon={<CheckCircleOutlined style={{ fontSize: 18 }} />}
                        onClick={() => handleApprove(req)}
                        style={{ color: COLORS.success }} />
                      <Button type="text" size="small" icon={<CloseCircleOutlined style={{ fontSize: 18 }} />}
                        onClick={() => handleReject(req)}
                        style={{ color: COLORS.danger }} />
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 审批操作弹窗 */}
      <Modal
        title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.5 }}>{approvalModal?.action === 'approved' ? '确认通过' : '确认驳回'}</span>}
        open={!!approvalModal}
        onCancel={() => setApprovalModal(null)}
        width={460}
        destroyOnHidden
        styles={{ body: { padding: '14px 2px 6px' } }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button icon={<CloseOutlined />} onClick={() => setApprovalModal(null)}
              style={{ borderRadius: 3, width: 36, height: 36 }} />
            <Button type="primary" ghost icon={<CheckOutlined />} onClick={confirmApproval}
              style={{ borderColor: approvalModal?.action === 'approved' ? COLORS.success : COLORS.danger, color: approvalModal?.action === 'approved' ? COLORS.success : COLORS.danger, borderRadius: 3, width: 36, height: 36 }} />
          </div>
        }
      >
        {approvalModal && (
          <div style={{ padding: '4px 0 0' }}>
            <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 12, lineHeight: 1.6 }}>
              项目：<strong style={{ color: COLORS.textPrimary }}>{approvalModal.req.projectName}</strong>&nbsp;&nbsp;|&nbsp;&nbsp;金额：<strong style={{ color: COLORS.primary }}>&yen;{formatMoney(approvalModal.req.amount)}</strong>
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, color: approvalModal.action === 'approved' ? COLORS.textPrimary : COLORS.danger, marginBottom: 6 }}>
              {approvalModal.action === 'approved' ? '审批意见' : '驳回原因 *'}
            </div>
            <Input.TextArea rows={3}
              placeholder={approvalModal.action === 'approved' ? '输入审批意见（可选）…' : '请输入驳回原因…'}
              value={approvalComment}
              onChange={e => setApprovalComment(e.target.value)}
              style={{ borderRadius: 6, fontSize: 13 }}
            />
          </div>
        )}
      </Modal>

      {/* 详情 Modal */}
      <Modal title="项目详情" open={!!detailModal} onCancel={() => setDetailModal(null)} footer={null} width={480}>
        {detailModal && (
          <div style={{ fontSize: 13 }}>
            <div style={detailRow}><span style={detailLabel}>客户</span><span>{detailModal.clientName}</span></div>
            <div style={detailRow}><span style={detailLabel}>项目</span><span>{detailModal.projectName}</span></div>
            <div style={detailRow}><span style={detailLabel}>销售编号</span><span>{detailModal.salesNo}</span></div>
            <div style={detailRow}><span style={detailLabel}>版本号</span><span>{detailModal.versionNo || '—'}</span></div>
            <div style={detailRow}><span style={detailLabel}>预期售价</span><span>&yen;{formatMoney(detailModal.totalAccountingPrice)}</span></div>
            <div style={detailRow}><span style={detailLabel}>折后报价</span><span>&yen;{formatMoney(detailModal.discountedPrice || 0)}{detailModal.discountRate !== undefined ? <span style={{ color: COLORS.textLight, marginLeft: 4 }}>({(() => { const v = (-detailModal.discountRate * 100); return (v > 0 ? '+' : '') + v.toFixed(1); })()}%)</span> : null}</span></div>
            <div style={detailRow}><span style={detailLabel}>项目利润</span><span>&yen;{formatMoney(detailModal.gp3Amount || 0)} <span style={{ color: COLORS.textLight }}>(<Gauge value={detailModal.gp3 * 100} />%)</span></span></div>
            <div style={detailRow}><span style={detailLabel}>提交人</span><span>{detailModal.submitter}</span></div>
            <div style={detailRow}><span style={detailLabel}>提交时间</span><span>{formatBeijing(detailModal.submitTime)}</span></div>
          </div>
        )}
      </Modal>

    </div>
  );
};

const Gauge: React.FC<{ value: number }> = ({ value }) => {
  const color = value >= 20 ? COLORS.success : value >= 15 ? COLORS.amber : COLORS.danger;
  return <span style={{ fontWeight: 600, color }}>{value.toFixed(1)}</span>;
};

const detailRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', padding: '6px 0',
  borderBottom: `1px solid ${COLORS.borderLight}`,
};
const detailLabel: React.CSSProperties = {
  fontWeight: 600, color: COLORS.textSecondary, minWidth: 80,
};

export default ApprovalList;
