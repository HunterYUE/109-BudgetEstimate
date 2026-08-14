import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Tag, message, Empty, Spin } from 'antd';
import { SyncOutlined, HistoryOutlined } from '@ant-design/icons';
import { formatMoney } from '../utils/calculations';
import { deliveryService } from '../services/deliveryService';
import type { DeliveryProject } from '../types';
import { COLORS } from '../styles/colors';
import { STATUS_CONFIG } from '../components/material/materialConstants';
import { getProjectDelay, projectStatusColor, projectStatusBg } from '../utils/analysisShared';
import { tabItemStyle } from '../utils/tableUtils';
import { LIST_LIMIT } from '../utils/constants';

const statusTag: Record<string, { label: string; color: string }> = {
  '未开始': { label: '未开始', color: 'default' },
  '进行中': { label: '进行中', color: 'blue' },
  '已完成': { label: '已完成', color: 'green' },
};

/** 审批状态徽标（草稿可自定义标签，如成本对比显示"草稿"；⚠️ B12：label/color 收敛至 STATUS_CONFIG 单源） */
const StatusBadge: React.FC<{ status: string; draftLabel?: string }> = ({ status, draftLabel }) => {
  const cfg = STATUS_CONFIG[status];
  const label = status === 'draft' && draftLabel ? draftLabel : (cfg?.label || status);
  return <span style={{ color: cfg?.color || COLORS.textLight, fontWeight: 600 }}>{label}</span>;
};

const DeliveryManagement: React.FC = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'active' | 'completed'>('active');

  const [projects, setProjects] = useState<DeliveryProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageApi, msgContextHolder] = message.useMessage();

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      // ⚠️ 传 limit: LIST_LIMIT，避免后端默认 limit=100 导致列表截断
      const data = await deliveryService.list({ limit: LIST_LIMIT });
      setProjects(data);
    } catch {
      messageApi.warning('加载交付项目失败');
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const grouped = useMemo(() => {
    const active = projects.filter(p => p.status !== '已完成');
    const completed = projects.filter(p => p.status === '已完成');
    return { active, completed };
  }, [projects]);

  const displayList = filter === 'active' ? grouped.active : grouped.completed;

  const renderProjectCard = (p: DeliveryProject) => {
    const nodes = p.nodes || [];
    const done = nodes.filter(n => n.status === 'completed').length;
    const total = nodes.length;
    const cfg = statusTag[p.status] || { label: p.status, color: 'default' };
    // 延期中：派生维度（初始审批基线 vs 更新计划/实际/当前）
    const delayed = p.status !== '已完成' && getProjectDelay(p).delayed;

    return (
      <Card
        key={p.id}
        size="small"
        hoverable
        onClick={() => navigate(`/delivery/${p.id}`)}
        style={{
          borderRadius: 6, marginBottom: 8, cursor: 'pointer',
          borderLeft: `4px solid ${projectStatusColor(p.status, delayed)}`,
        }}
        styles={{ body: { padding: '14px 20px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* 项目信息 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: COLORS.textDark, letterSpacing: 1 }}>{p.clientName}</span>
              <Tag color={cfg.color} style={{ margin: 0, fontSize: 12, lineHeight: '20px', borderRadius: 3, border: 'none' }}>{cfg.label}</Tag>
              {delayed && <Tag color="red" style={{ margin: 0, fontSize: 12, lineHeight: '20px', borderRadius: 3, border: 'none' }}>延期中</Tag>}
            </div>
            <div style={{ fontSize: 13, color: COLORS.textLight, marginTop: 4, display: 'flex', gap: 16 }}>
              <span>{p.projectName}</span>
              <span style={{ color: COLORS.borderInput }}>|</span>
              <span>{p.salesNo}</span>
              <span style={{ color: COLORS.borderInput }}>|</span>
              <span>合同金额 &yen;{formatMoney(p.contractAmount)}</span>
            </div>
            <div style={{ fontSize: 12, color: COLORS.textLight, marginTop: 2, display: 'flex', gap: 16 }}>
              {/* ⚠️ B12 复核：计划审批状态 draft 显示「待提交」（与审批流语义一致，提交后才进入审批）；
                  成本状态默认「草稿」不变 */}
              <span>计划：<StatusBadge status={p.planStatus} draftLabel="待提交" /></span>
              <span>成本：<StatusBadge status={p.costStatus} draftLabel="草稿" /></span>
            </div>
          </div>

          {/* 进度指示 */}
          <div style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: projectStatusBg(p.status, delayed),
            fontSize: 13, fontWeight: 700,
            color: projectStatusColor(p.status, delayed),
          }}>
            {done}/{total}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div>
      {msgContextHolder}
      <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark, marginBottom: 4 }}>交付管理</div>

      <div style={{ display: 'flex', gap: 0, marginTop: 20, marginBottom: 20, borderBottom: `2px solid ${COLORS.border}` }}>
        <div onClick={() => setFilter('active')}
          style={tabItemStyle(filter === 'active', COLORS.primary)}>
          <SyncOutlined style={{ color: COLORS.primary, marginRight: 6 }} />进行中 ({grouped.active.length})
        </div>
        <div onClick={() => setFilter('completed')}
          style={tabItemStyle(filter === 'completed', COLORS.success)}>
          <HistoryOutlined style={{ color: COLORS.success, marginRight: 6 }} />历史项目 ({grouped.completed.length})
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      ) : displayList.length === 0 ? (
        <Empty description={filter === 'active' ? '暂无进行中的交付项目' : '暂无历史项目'}
          style={{ padding: 40, background: '#fff', borderRadius: 6 }} />
      ) : (
        displayList.map(renderProjectCard)
      )}
    </div>
  );
};

export default DeliveryManagement;
