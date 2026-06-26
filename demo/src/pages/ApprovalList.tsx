import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Tag, Button, Modal, Input, message, Empty } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, HistoryOutlined, EyeOutlined } from '@ant-design/icons';
import { mockApprovalRequests } from '../mockData';
import { formatMoney } from '../utils/calculations';
import type { ApprovalRequest, ReviewRecord } from '../types';

const statusConfig: Record<string, { label: string; color: string }> = {
  pending:  { label: '待审批', color: '#e65100' },
  approved: { label: '已通过', color: '#2e7d32' },
  rejected: { label: '已驳回', color: '#c62828' },
};

const ApprovalList: React.FC = () => {
  const navigate = useNavigate();
  const [msg, ctx] = message.useMessage();
  const [requests, setRequests] = useState<ApprovalRequest[]>(() =>
    mockApprovalRequests.map(r => ({
      ...r,
      records: r.records.map(rec => ({ ...rec })),
    }))
  );
  const [filter, setFilter] = useState<'pending' | 'done' | 'all'>('pending');
  const [detailModal, setDetailModal] = useState<ApprovalRequest | null>(null);
  const [historyModal, setHistoryModal] = useState<ApprovalRequest | null>(null);

  const filtered = useMemo(() => {
    if (filter === 'pending') return requests.filter(r => r.status === 'pending');
    if (filter === 'done') return requests.filter(r => r.status !== 'pending');
    return requests;
  }, [requests, filter]);

  const handleApprove = useCallback((req: ApprovalRequest) => {
    let comment = '';
    Modal.confirm({
      title: (
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1a6b3c' }}><CheckCircleOutlined style={{ fontSize: 18, marginRight: 6 }} />确认通过</span>
      ),
      icon: null,
      content: (
        <div style={{ padding: '12px 0' }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 10, lineHeight: 1.6 }}>
            项目：<strong style={{ color: '#333' }}>{req.projectName}</strong>&nbsp;&nbsp;|&nbsp;&nbsp;金额：<strong style={{ color: '#00509e' }}>&yen;{formatMoney(req.amount)}</strong>
          </div>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#333', marginBottom: 6 }}>审批意见</div>
          <Input.TextArea rows={3} placeholder="输入审批意见（可选）…"
            onChange={e => { comment = e.target.value; }}
            style={{ borderRadius: 6, fontSize: 13 }}
          />
        </div>
      ),
      okText: '确认通过',
      okButtonProps: { style: { background: '#1a6b3c', borderColor: '#1a6b3c', borderRadius: 4 } },
      cancelText: '取消',
      cancelButtonProps: { style: { borderRadius: 4 } },
      onOk: () => {
        const record: ReviewRecord = {
          id: 'rec-' + crypto.randomUUID().slice(0, 6),
          reviewer: '刘总监',
          action: 'approved',
          comment,
          createdAt: new Date().toISOString().slice(0, 10),
        };
        setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'approved', records: [...r.records, record] } : r));
        msg.success('已通过');
      },
    });
  }, [msg]);

  const handleReject = useCallback((req: ApprovalRequest) => {
    let comment = '';
    Modal.confirm({
      title: (
        <span style={{ fontSize: 15, fontWeight: 600, color: '#c62828' }}><CloseCircleOutlined style={{ fontSize: 18, marginRight: 6 }} />确认驳回</span>
      ),
      icon: null,
      content: (
        <div style={{ padding: '12px 0' }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 10, lineHeight: 1.6 }}>
            项目：<strong style={{ color: '#333' }}>{req.projectName}</strong>&nbsp;&nbsp;|&nbsp;&nbsp;金额：<strong style={{ color: '#00509e' }}>&yen;{formatMoney(req.amount)}</strong>
          </div>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#c62828', marginBottom: 6 }}>驳回原因 *</div>
          <Input.TextArea rows={3} placeholder="请输入驳回原因…"
            onChange={e => { comment = e.target.value; }}
            style={{ borderRadius: 6, fontSize: 13 }}
          />
        </div>
      ),
      okText: '确认驳回',
      okType: 'danger',
      okButtonProps: { style: { borderRadius: 4 } },
      cancelText: '取消',
      cancelButtonProps: { style: { borderRadius: 4 } },
      onOk: () => {
        if (!comment.trim()) {
          msg.warning('驳回必须填写原因');
          return Promise.reject();
        }
        const record: ReviewRecord = {
          id: 'rec-' + crypto.randomUUID().slice(0, 6),
          reviewer: '刘总监',
          action: 'rejected',
          comment,
          createdAt: new Date().toISOString().slice(0, 10),
        };
        setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'rejected', records: [...r.records, record] } : r));
        msg.warning('已驳回');
      },
    });
  }, [msg]);

  return (
    <div>
      {ctx}
      <div style={{ fontSize: 17, fontWeight: 700, color: '#0d1b2a', marginBottom: 4 }}>审批管理</div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #e8e8e8' }}>
        <div onClick={() => setFilter('pending')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: filter === 'pending' ? '2px solid #e65100' : '2px solid transparent',
            color: filter === 'pending' ? '#e65100' : '#666', fontWeight: filter === 'pending' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>待审批({requests.filter(r => r.status === 'pending').length})
        </div>
        <div onClick={() => setFilter('done')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: filter === 'done' ? '2px solid #2e7d32' : '2px solid transparent',
            color: filter === 'done' ? '#2e7d32' : '#666', fontWeight: filter === 'done' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>已审批({requests.filter(r => r.status !== 'pending').length})
        </div>
        <div onClick={() => setFilter('all')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: filter === 'all' ? '2px solid #00509e' : '2px solid transparent',
            color: filter === 'all' ? '#00509e' : '#666', fontWeight: filter === 'all' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>全部({requests.length})
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty description="暂无审批记录" style={{ padding: 40, background: '#fff', borderRadius: 6 }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(req => (
            <Card
              key={req.id}
              size="small"
              style={{
                borderRadius: 4,
                borderLeft: `4px solid ${
                  req.status === 'pending' ? '#e65100' :
                  req.status === 'approved' ? '#2e7d32' : '#c62828'
                }`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#0d1b2a' }}>{req.clientName}</span>
                    <Tag color={statusConfig[req.status]?.color}>{statusConfig[req.status]?.label}</Tag>
                    {req.gp3 < 0.15 && req.status === 'pending' && (
                      <Tag color="#c62828" style={{ fontSize: 11 }}>GP3 低于 15%</Tag>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 24, fontSize: 13, color: '#666', flexWrap: 'wrap' }}>
                    <span>项目：{req.projectName}</span>
                    <span>编号：{req.salesNo}</span>
                    <span>金额：<strong style={{ color: '#00509e' }}>&yen;{formatMoney(req.amount)}</strong></span>
                    <span>利润率：<Gauge value={req.profitRate} />%</span>
                    <span>GP3：<Gauge value={req.gp3 * 100} />%</span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
                    提交人：{req.submitter} | 提交时间：{req.submitTime}
                    {req.records.length > 0 && (
                      <span> | 最后审批：{req.records[req.records.length - 1].reviewer} @ {req.records[req.records.length - 1].createdAt}</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginLeft: 16, flexShrink: 0 }}>
                  <Button type="text" size="small" icon={<EyeOutlined style={{ fontSize: 18 }} />}
                    onClick={() => navigate('/quotations/' + req.quotationId)}
                    style={{ color: '#00509e' }} />
                  {req.records.length > 0 && (
                    <Button type="text" size="small" icon={<HistoryOutlined />}
                      onClick={() => setHistoryModal(req)}
                      style={{ color: '#666' }}>
                      审批记录
                    </Button>
                  )}
                  {req.status === 'pending' && (
                    <>
                      <Button type="text" size="small" icon={<CheckCircleOutlined style={{ fontSize: 18 }} />}
                        onClick={() => handleApprove(req)}
                        style={{ color: '#1a6b3c' }} />
                      <Button type="text" size="small" icon={<CloseCircleOutlined style={{ fontSize: 18 }} />}
                        onClick={() => handleReject(req)}
                        style={{ color: '#c62828' }} />
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 详情 Modal */}
      <Modal title="项目详情" open={!!detailModal} onCancel={() => setDetailModal(null)} footer={null} width={480}>
        {detailModal && (
          <div style={{ fontSize: 13 }}>
            <div style={detailRow}><span style={detailLabel}>客户</span><span>{detailModal.clientName}</span></div>
            <div style={detailRow}><span style={detailLabel}>项目</span><span>{detailModal.projectName}</span></div>
            <div style={detailRow}><span style={detailLabel}>销售编号</span><span>{detailModal.salesNo}</span></div>
            <div style={detailRow}><span style={detailLabel}>报价金额</span><span>&yen;{formatMoney(detailModal.amount)}</span></div>
            <div style={detailRow}><span style={detailLabel}>总成本</span><span>&yen;{formatMoney(detailModal.totalCost)}</span></div>
            <div style={detailRow}><span style={detailLabel}>利润率</span><span><Gauge value={detailModal.profitRate} />%</span></div>
            <div style={detailRow}><span style={detailLabel}>GP3</span><span><Gauge value={detailModal.gp3 * 100} />%</span></div>
            <div style={detailRow}><span style={detailLabel}>提交人</span><span>{detailModal.submitter}</span></div>
            <div style={detailRow}><span style={detailLabel}>提交时间</span><span>{detailModal.submitTime}</span></div>
          </div>
        )}
      </Modal>

      {/* 审批历史 Modal */}
      <Modal title="审批记录" open={!!historyModal} onCancel={() => setHistoryModal(null)} footer={null} width={480}>
        {historyModal && historyModal.records.length > 0 ? (
          <div style={{ position: 'relative', paddingLeft: 24 }}>
            <div style={{ position: 'absolute', left: 11, top: 4, bottom: 4, width: 2, background: '#e8e8e8' }} />
            {historyModal.records.map((rec, i) => (
              <div key={rec.id} style={{ position: 'relative', paddingBottom: 16 }}>
                <div style={{
                  position: 'absolute', left: -20, top: 4, width: 12, height: 12, borderRadius: '50%',
                  background: rec.action === 'approved' ? '#2e7d32' : '#c62828',
                  border: '2px solid #fff',
                }} />
                <div style={{ fontSize: 13, color: '#0d1b2a', fontWeight: 600 }}>
                  {rec.action === 'approved' ? '✓ 通过' : '✗ 驳回'} — {rec.reviewer}
                </div>
                <div style={{ fontSize: 12, color: '#999' }}>{rec.createdAt}</div>
                {rec.comment && <div style={{ fontSize: 13, color: '#666', marginTop: 4, background: '#f5f5f5', padding: '6px 10px', borderRadius: 4 }}>{rec.comment}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>暂无审批记录</div>
        )}
      </Modal>
    </div>
  );
};

const Gauge: React.FC<{ value: number }> = ({ value }) => {
  const color = value >= 20 ? '#1a6b3c' : value >= 15 ? '#d46b08' : '#c62828';
  return <span style={{ fontWeight: 600, color }}>{value.toFixed(1)}</span>;
};

const detailRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', padding: '6px 0',
  borderBottom: '1px solid #f0f0f0',
};
const detailLabel: React.CSSProperties = {
  fontWeight: 600, color: '#666', minWidth: 80,
};

export default ApprovalList;
