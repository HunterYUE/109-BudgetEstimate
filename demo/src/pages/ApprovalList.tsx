import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Tag, Button, Modal, Input, message, Empty } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, HistoryOutlined, EyeOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { mockApprovalRequests, mockDeliveryProjects, mockQuotationSummaries } from '../mockData';
import { formatMoney } from '../utils/calculations';
import type { ApprovalRequest, ReviewRecord } from '../types';
import { COLORS } from '../styles/constants';

const statusConfig: Record<string, { label: string; color: string }> = {
  pending:  { label: '待审批', color: COLORS.warning },
  approved: { label: '已通过', color: '#2e7d32' },
  rejected: { label: '已驳回', color: COLORS.danger },
};

const typeColor = (t: string) => t === 'quotation' ? COLORS.primary : t === 'plan' ? COLORS.warning : COLORS.success;

const ApprovalList: React.FC = () => {
  const navigate = useNavigate();
  const [msg, ctx] = message.useMessage();
  const [requests, setRequests] = useState<ApprovalRequest[]>(() =>
    mockApprovalRequests.map(r => ({
      ...r,
      records: r.records.map(rec => ({ ...rec })),
    }))
  );
  const [filter, setFilter] = useState<'draft' | 'pending' | 'done' | 'all'>('pending');
  const [detailModal, setDetailModal] = useState<ApprovalRequest | null>(null);
  const [historyModal, setHistoryModal] = useState<ApprovalRequest | null>(null);

  const filtered = useMemo(() => {
    if (filter === 'pending') return requests.filter(r => r.status === 'pending');
    if (filter === 'done') return requests.filter(r => r.status !== 'pending');
    return requests;
  }, [requests, filter]);

  const draftItems = useMemo(() => {
    const items = [];
    for (const q of mockQuotationSummaries) {
      if (q.status === 'draft') items.push({ id: 'dq-' + q.id, approvalType: 'quotation', clientName: q.clientName, projectName: q.projectName, salesNo: q.salesNo, amount: q.amount, submitter: '方案经理', quotationId: q.id });
    }
    for (const p of mockDeliveryProjects) {
      if (p.planStatus === 'draft') items.push({ id: 'dp-' + p.id, approvalType: 'plan', clientName: p.clientName, projectName: p.projectName, salesNo: p.salesNo, amount: p.contractAmount, submitter: '方案经理', deliveryId: p.id, quotationId: p.quotationId });
      if (p.costStatus === 'draft') items.push({ id: 'dc-' + p.id, approvalType: 'cost', clientName: p.clientName, projectName: p.projectName, salesNo: p.salesNo, amount: p.contractAmount, submitter: '交付经理', deliveryId: p.id, quotationId: p.quotationId });
    }
    return items;
  }, []);

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

  const confirmApproval = useCallback(() => {
    const modal = approvalModal;
    if (!modal) return;
    if (modal.action === 'rejected' && !approvalComment.trim()) {
      msg.warning('驳回必须填写原因');
      return;
    }
    const record: ReviewRecord = {
      id: 'rec-' + crypto.randomUUID().slice(0, 6),
      reviewer: '刘总监',
      action: modal.action,
      comment: approvalComment,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setRequests(prev => prev.map(r => r.id === modal.req.id ? { ...r, status: modal.action === 'approved' ? 'approved' : 'rejected', records: [...r.records, record] } : r));
    // 交付审批同步回 DeliveryProject
    if (modal.req.deliveryId) {
      const proj = mockDeliveryProjects.find(p => p.id === modal.req.deliveryId);
      if (proj) {
        const appraisal = { reviewer: '刘总监', action: modal.action as 'approved' | 'rejected', comment: approvalComment, createdAt: record.createdAt };
        if (modal.req.approvalType === 'plan') { proj.planStatus = modal.action; proj.planApproval = appraisal; }
        else if (modal.req.approvalType === 'cost') { proj.costStatus = modal.action; proj.costApproval = appraisal; }
      }
    }
    if (modal.action === 'approved') msg.success('已通过');
    else msg.warning('已驳回');
    setApprovalModal(null);
  }, [approvalModal, approvalComment, msg]);

  return (
    <div>
      {ctx}
      <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark, marginBottom: 4 }}>审批管理</div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: `2px solid ${COLORS.border}` }}>
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
            borderBottom: filter === 'done' ? '2px solid #2e7d32' : '2px solid transparent',
            color: filter === 'done' ? '#2e7d32' : COLORS.textSecondary, fontWeight: filter === 'done' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>已审批({requests.filter(r => r.status !== 'pending').length})
        </div>
        <div onClick={() => setFilter('all')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: filter === 'all' ? `2px solid ${COLORS.primary}` : '2px solid transparent',
            color: filter === 'all' ? COLORS.primary : COLORS.textSecondary, fontWeight: filter === 'all' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>全部({requests.length})
        </div>
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
                      {item.approvalType === 'quotation' ? '报价审批' : item.approvalType === 'plan' ? '实施计划' : '成本对比'}
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
                    onClick={() => item.deliveryId ? navigate('/delivery/' + item.deliveryId) : navigate('/quotations/' + item.quotationId)}
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
                  req.status === 'approved' ? '#2e7d32' : COLORS.danger
                }`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.textDark }}>{req.clientName}</span>
                    {req.status !== 'pending' && <Tag color={statusConfig[req.status]?.color} style={{ fontWeight: 600, fontSize: 12, lineHeight: '20px', borderRadius: 3 }}>{statusConfig[req.status]?.label}</Tag>}
                    <Tag color={typeColor(req.approvalType)} style={{ fontSize: 12, border: 'none', fontWeight: 600 }}>{req.approvalType === 'quotation' ? '报价审批' : req.approvalType === 'plan' ? '实施计划' : '成本对比'}</Tag>
                  </div>
                  <div style={{ display: 'flex', gap: 24, fontSize: 13, color: COLORS.textSecondary, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>{req.projectName}</span>
                    <span>{req.salesNo}</span>
                    <span><strong style={{ color: COLORS.primary }}>&yen;{formatMoney(req.amount)}</strong></span>
                    <span><Gauge value={req.profitRate} />%</span>
                    <span><Gauge value={req.gp3 * 100} />%</span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: COLORS.textLight }}>
                    {req.submitter}@{req.submitTime}
                    {req.records.length > 0 && (
                      <span> | {req.records[req.records.length - 1].reviewer}@{req.records[req.records.length - 1].createdAt}</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginLeft: 16, flexShrink: 0 }}>
                  <Button type="text" size="small" icon={<EyeOutlined style={{ fontSize: 18 }} />}
                    onClick={() => req.deliveryId ? navigate('/delivery/' + req.deliveryId) : navigate('/quotations/' + req.quotationId)}
                    style={{ color: COLORS.primary }} />
                  {req.records.length > 0 && (
                    <Button type="text" size="small" icon={<HistoryOutlined />}
                      onClick={() => setHistoryModal(req)}
                      style={{ color: COLORS.textSecondary }} />
                  )}
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
            <div style={detailRow}><span style={detailLabel}>报价金额</span><span>&yen;{formatMoney(detailModal.amount)}</span></div>
            <div style={detailRow}><span style={detailLabel}>总成本</span><span>&yen;{formatMoney(detailModal.totalCost)}</span></div>
            <div style={detailRow}><span style={detailLabel}>GP1</span><span><Gauge value={detailModal.profitRate} />%</span></div>
            <div style={detailRow}><span style={detailLabel}>GP3</span><span><Gauge value={detailModal.gp3 * 100} />%</span></div>
            <div style={detailRow}><span style={detailLabel}>提交人</span><span>{detailModal.submitter}</span></div>
            <div style={detailRow}><span style={detailLabel}>提交时间</span><span>{detailModal.submitTime}</span></div>
          </div>
        )}
      </Modal>

      {/* 审批历史 Modal */}
      <Modal
        title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.5 }}>审批记录</span>}
        open={!!historyModal}
        onCancel={() => setHistoryModal(null)}
        width={460}
        destroyOnHidden
        styles={{ body: { padding: '14px 2px 6px' } }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button icon={<CloseOutlined />} onClick={() => setHistoryModal(null)}
              style={{ borderRadius: 3, width: 36, height: 36 }} />
          </div>
        }>
        {historyModal && historyModal.records.length > 0 ? (
          <div style={{ position: 'relative', paddingLeft: 24 }}>
            <div style={{ position: 'absolute', left: 11, top: 4, bottom: 4, width: 2, background: COLORS.border }} />
            {historyModal.records.map(rec => (
              <div key={rec.id} style={{ position: 'relative', paddingBottom: 16 }}>
                <div style={{
                  position: 'absolute', left: -20, top: 4, width: 12, height: 12, borderRadius: '50%',
                  background: rec.action === 'approved' ? '#2e7d32' : COLORS.danger,
                  border: '2px solid #fff',
                }} />
                <div style={{ fontSize: 13, color: COLORS.textDark, fontWeight: 600 }}>
                  {rec.action === 'approved' ? '✓ 通过' : '✗ 驳回'} — {rec.reviewer}
                </div>
                <div style={{ fontSize: 12, color: COLORS.textLight }}>{rec.createdAt}</div>
                {rec.comment && <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>{rec.comment}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: COLORS.textLight, padding: 20 }}>暂无审批记录</div>
        )}
      </Modal>
    </div>
  );
};

const Gauge: React.FC<{ value: number }> = ({ value }) => {
  const color = value >= 20 ? COLORS.success : value >= 15 ? '#d46b08' : COLORS.danger;
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
