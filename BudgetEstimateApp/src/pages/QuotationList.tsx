import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Tag, Button, Empty } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { mockQuotationSummaries } from '../mockData';
import { formatMoney } from '../utils/calculations';
import { parseFY, FYSelector } from '../utils/fiscalYear';
import { useMockVersion } from '../utils/mockStore';
import type { QuotationSummary } from '../types';
import { COLORS } from '../styles/constants';

const statusConfig: Record<string, { label: string; color: string }> = {
  draft:    { label: '草稿',   color: COLORS.textSecondary },
  pending:  { label: '待审批', color: COLORS.warning },
  approved: { label: '已通过', color: COLORS.success },
  rejected: { label: '已驳回', color: COLORS.danger },
};


const QuotationList: React.FC = () => {
  const navigate = useNavigate();
  const [statusTab, setStatusTab] = useState<string>('all');
  const [fySelect, setFySelect] = useState('FY2526');

  useMockVersion();
  const data = mockQuotationSummaries.map(q => ({ ...q }));

  const filtered = useMemo(() => {
    const fyRange = parseFY(fySelect);
    // 未来财年不显示任何数据
    if (fyRange.start > new Date()) return [];
    return data.filter(q => {
      // 财年过滤：创建或更新在财年范围内的报价
      const created = q.createdAt ? new Date(q.createdAt) : null;
      const updated = new Date(q.updatedAt);
      const inFy = (created && created >= fyRange.start && created <= fyRange.end)
                || (updated >= fyRange.start && updated <= fyRange.end);
      if (!inFy) return false;
      // 状态标签过滤
      if (statusTab === 'all') return true;
      return q.status === statusTab;
    });
  }, [data, statusTab, fySelect]);

  const getCount = useCallback((status?: string) => {
    if (!status) return data.length;
    return data.filter(q => q.status === status).length;
  }, [data]);

  const columns = [
    { title: '客户', dataIndex: 'clientName', width: 240,
      render: (v: string) => <span style={{ color: COLORS.primary }}>{v}</span> },
    { title: '项目', dataIndex: 'projectName', width: 200 },
    { title: '销售编号', dataIndex: 'salesNo', width: 110,
      render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { title: '版本', dataIndex: 'versionNo', width: 70, align: 'center' as const },
    {
      title: '状态', dataIndex: 'status', width: 80, align: 'center' as const,
      render: (v: string) => {
        const cfg = statusConfig[v] || { label: v, color: COLORS.textLight };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '总金额', dataIndex: 'amount', width: 130, align: 'right' as const,
      render: (v: number) => <span style={{ fontWeight: 600 }}>&yen;{formatMoney(v)}</span>,
    },
    {
      title: '总成本', dataIndex: 'totalCost', width: 120, align: 'right' as const,
      render: (v: number) => <span>&yen;{formatMoney(v)}</span>,
    },
    {
      title: '利润率', dataIndex: 'profitRate', width: 70, align: 'center' as const,
      render: (v: number) => {
        const color = v >= 20 ? COLORS.success : v >= 15 ? COLORS.amber : COLORS.danger;
        return <span style={{ fontWeight: 600, color }}>{v.toFixed(1)}%</span>;
      },
    },
    { title: '更新时间', dataIndex: 'updatedAt', width: 100 },
    {
      title: '', key: 'action', width: 70, align: 'center' as const,
      render: (_: unknown, record: QuotationSummary) => {
        return (
          <Button type="text" size="small" icon={<EyeOutlined style={{ fontSize: 18 }} />}
            onClick={() => navigate(`/quotations/${record.id}`)}
            style={{ color: COLORS.primary }} />
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark }}>报价列表</span>
        <FYSelector value={fySelect} onChange={setFySelect} />
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: `2px solid ${COLORS.border}` }}>
        <div onClick={() => setStatusTab('all')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: statusTab === 'all' ? `2px solid ${COLORS.primary}` : '2px solid transparent',
            color: statusTab === 'all' ? COLORS.primary : COLORS.textSecondary, fontWeight: statusTab === 'all' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>全部({getCount()})
        </div>
        <div onClick={() => setStatusTab('draft')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: statusTab === 'draft' ? `2px solid ${COLORS.textSecondary}` : '2px solid transparent',
            color: statusTab === 'draft' ? COLORS.textSecondary : COLORS.textLight, fontWeight: statusTab === 'draft' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>草稿({getCount('draft')})
        </div>
        <div onClick={() => setStatusTab('pending')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: statusTab === 'pending' ? `2px solid ${COLORS.warning}` : '2px solid transparent',
            color: statusTab === 'pending' ? COLORS.warning : COLORS.textLight, fontWeight: statusTab === 'pending' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>待审批({getCount('pending')})
        </div>
        <div onClick={() => setStatusTab('approved')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: statusTab === 'approved' ? `2px solid ${COLORS.success}` : '2px solid transparent',
            color: statusTab === 'approved' ? COLORS.success : COLORS.textLight, fontWeight: statusTab === 'approved' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>已通过({getCount('approved')})
        </div>
        <div onClick={() => setStatusTab('rejected')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: statusTab === 'rejected' ? `2px solid ${COLORS.danger}` : '2px solid transparent',
            color: statusTab === 'rejected' ? COLORS.danger : COLORS.textLight, fontWeight: statusTab === 'rejected' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>已驳回({getCount('rejected')})
        </div>
      </div>

      <div style={{
        borderRadius: 10, border: `1px solid ${COLORS.borderLight}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
      }}>
      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        pagination={false}
        size="small"
        bordered
        locale={{ emptyText: <Empty description="暂无符合条件的报价" /> }}
        style={{ background: '#fff', borderRadius: 8 }}
      />
      </div>
    </div>
  );
};

export default QuotationList;
