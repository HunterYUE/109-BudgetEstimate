import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Tag } from 'antd';
import { SyncOutlined, HistoryOutlined } from '@ant-design/icons';
import { mockDeliveryProjects } from '../mockData';
import { formatMoney } from '../utils/calculations';
import { useMockVersion } from '../utils/mockStore';
import type { DeliveryProject } from '../types';
import { COLORS } from '../styles/constants';

const statusTag: Record<string, { label: string; color: string }> = {
  '进行中': { label: '进行中', color: 'blue' },
  '已完成': { label: '已完成', color: 'green' },
  '已延期': { label: '已延期', color: 'red' },
};

const DeliveryManagement: React.FC = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'active' | 'completed'>('active');

  useMockVersion();
  const projects = mockDeliveryProjects;

  const grouped = useMemo(() => {
    const active = projects.filter(p => p.status !== '已完成');
    const completed = projects.filter(p => p.status === '已完成');
    return { active, completed };
  }, [projects]);

  const displayList = filter === 'active' ? grouped.active : grouped.completed;

  const renderProjectCard = (p: DeliveryProject) => {
    const nodes = p.nodes || [];
    const done = nodes.filter(n => n.status === 'completed' || n.status === 'delayed').length;
    const total = nodes.length;
    const cfg = statusTag[p.status] || { label: p.status, color: 'default' };
    

    return (
      <Card
        key={p.id}
        size="small"
        hoverable
        onClick={() => navigate(`/delivery/${p.id}`)}
        style={{
          borderRadius: 6, marginBottom: 8, cursor: 'pointer',
          borderLeft: `4px solid ${
            p.status === '已完成' ? COLORS.success : p.status === '已延期' ? COLORS.danger : COLORS.primary
          }`,
        }}
        styles={{ body: { padding: '14px 20px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* 项目信息 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#0d1b2a', letterSpacing: 1 }}>{p.clientName}</span>
              <Tag color={cfg.color} style={{ margin: 0, fontSize: 12, lineHeight: '20px', borderRadius: 3, border: 'none' }}>{cfg.label}</Tag>
            </div>
            <div style={{ fontSize: 13, color: '#999', marginTop: 4, display: 'flex', gap: 16 }}>
              <span>{p.projectName}</span>
              <span style={{ color: '#d9d9d9' }}>|</span>
              <span>{p.salesNo}</span>
              <span style={{ color: '#d9d9d9' }}>|</span>
              <span>合同金额 &yen;{formatMoney(p.contractAmount)}</span>
            </div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 2, display: 'flex', gap: 16 }}>
              <span>计划：<StatusBadge status={p.planStatus} /></span>
              <span>成本：<StatusBadge status={p.costStatus} draftLabel="草稿" /></span>
            </div>
          </div>

          {/* 进度指示 */}
          <div style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: p.status === '已完成' ? '#e8f5e9' : p.status === '已延期' ? '#ffebee' : '#e6f0fa',
            fontSize: 13, fontWeight: 700,
            color: p.status === '已完成' ? COLORS.success : p.status === '已延期' ? COLORS.danger : COLORS.primary,
          }}>
            {done}/{total}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div>
      <div style={{ fontSize: 17, fontWeight: 700, color: '#0d1b2a', marginBottom: 4 }}>交付管理</div>
      <div style={{ fontSize: 13, color: '#999', marginBottom: 16 }}>&nbsp;</div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #e8e8e8' }}>
        <div onClick={() => setFilter('active')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: filter === 'active' ? '2px solid COLORS.primary' : '2px solid transparent',
            color: filter === 'active' ? COLORS.primary : '#666', fontWeight: filter === 'active' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>
          <SyncOutlined style={{ color: COLORS.primary, marginRight: 6 }} />进行中 ({grouped.active.length})
        </div>
        <div onClick={() => setFilter('completed')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: filter === 'completed' ? '2px solid COLORS.success' : '2px solid transparent',
            color: filter === 'completed' ? COLORS.success : '#666', fontWeight: filter === 'completed' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>
          <HistoryOutlined style={{ color: COLORS.success, marginRight: 6 }} />历史项目 ({grouped.completed.length})
        </div>
      </div>

      {displayList.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999', background: '#fff', borderRadius: 6 }}>
          {filter === 'active' ? '暂无进行中的交付项目' : '暂无历史项目'}
        </div>
      ) : (
        displayList.map(renderProjectCard)
      )}
    </div>
  );
};

const statusLabelMap: Record<string, string> = {
  draft: '待提交', pending: '待审批', approved: '已通过', rejected: '已驳回',
};
const statusColorMap: Record<string, string> = {
  draft: '#999', pending: '#e65100', approved: COLORS.success, rejected: COLORS.danger,
};

const StatusBadge: React.FC<{ status: string; draftLabel?: string }> = ({ status, draftLabel }) => {
  const label = status === 'draft' && draftLabel ? draftLabel : (statusLabelMap[status] || status);
  return <span style={{ color: statusColorMap[status] || '#999', fontWeight: 600 }}>{label}</span>;
};

export default DeliveryManagement;
