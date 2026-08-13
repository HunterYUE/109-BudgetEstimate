import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Tag, Button, Empty, message } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { quotationService } from '../services/quotationService';
import { formatMoney } from '../utils/calculations';
import { formatBeijing } from '../utils/timeFormat';
import { parseFY, FYSelector, fiscalYearLabel } from '../utils/fiscalYear';
import type { QuotationSummary } from '../types';
import { COLORS } from '../styles/colors';
import { STATUS_CONFIG } from '../components/material/materialConstants';
import { BARE_INPUT_STYLE } from '../utils/tableUtils';
import { tabItemStyle } from '../utils/tableUtils';

const QuotationList: React.FC = () => {
  const navigate = useNavigate();
  const [statusTab, setStatusTab] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [fySelect, setFySelect] = useState(() => fiscalYearLabel(new Date()));

  const [data, setData] = useState<QuotationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    quotationService.list({ limit: '1000' })
      .then(res => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) {
          setData([]);
          messageApi.error('加载报价数据失败');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [messageApi]);

  /** 报价是否属于所选财年（创建或更新落在财年内）；表格过滤与 Tab 徽标共用，避免口径分叉 */
  const inFy = useCallback((q: QuotationSummary): boolean => {
    const fyRange = parseFY(fySelect);
    if (fyRange.start > new Date()) return false; // 未来财年不显示任何数据
    const created = q.createdAt ? new Date(q.createdAt) : null;
    const updated = new Date(q.updatedAt);
    return (!!created && created >= fyRange.start && created <= fyRange.end)
        || (updated >= fyRange.start && updated <= fyRange.end);
  }, [fySelect]);

  const filtered = useMemo(() => {
    const s = searchText.trim().toLowerCase();
    return data.filter(q =>
      inFy(q) &&
      (statusTab === 'all' || q.status === statusTab) &&
      (!s || (q.salesNo || '').toLowerCase().includes(s) || (q.clientName || '').toLowerCase().includes(s))
    );
  }, [data, inFy, statusTab, searchText]);

  // Tab 徽标计数：与表格同口径（仅财年+状态过滤，不随搜索词变化）
  const getCount = useCallback((status?: string) => {
    return data.filter(q => inFy(q) && (!status || q.status === status)).length;
  }, [data, inFy]);

  const columns = useMemo(() => [
    { title: '客户', dataIndex: 'clientName', width: 240,
      render: (v: string) => <span style={{ color: COLORS.primary }}>{v}</span> },
    { title: '项目', dataIndex: 'projectName', width: 200 },
    { title: '销售编号', dataIndex: 'salesNo', width: 110,
      render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { title: '版本', dataIndex: 'versionNo', width: 70, align: 'center' as const },
    {
      title: '状态', dataIndex: 'status', width: 80, align: 'center' as const,
      render: (v: string) => {
        const cfg = STATUS_CONFIG[v] || { label: v, color: COLORS.textLight };
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
        const p = v || 0; // profitRate 可选字段，防缺值
        const color = p >= 20 ? COLORS.success : p >= 15 ? COLORS.amber : COLORS.danger;
        return <span style={{ fontWeight: 600, color }}>{p.toFixed(1)}%</span>;
      },
    },
    { title: '更新时间', dataIndex: 'updatedAt', width: 100,
      render: (v: string) => formatBeijing(v) },
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
  ], [navigate]);

  return (
    <div>
      {contextHolder}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark }}>报价列表</span>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <table style={{ borderCollapse: 'collapse' }}><tbody><tr>
            <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid ' + COLORS.border, verticalAlign: 'middle' }}>
              <input placeholder="搜索客户/销售号" value={searchText} onChange={e => setSearchText(e.target.value)}
                style={{ width: 180, ...BARE_INPUT_STYLE, fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
            </td>
          </tr></tbody></table>
          <FYSelector value={fySelect} onChange={setFySelect} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: `2px solid ${COLORS.border}` }}>
        <div onClick={() => setStatusTab('all')}
          style={tabItemStyle(statusTab === 'all', COLORS.primary)}>全部({getCount()})
        </div>
        <div onClick={() => setStatusTab('draft')}
          style={tabItemStyle(statusTab === 'draft', COLORS.textSecondary, COLORS.textLight)}>草稿({getCount('draft')})
        </div>
        <div onClick={() => setStatusTab('pending')}
          style={tabItemStyle(statusTab === 'pending', COLORS.warning, COLORS.textLight)}>待审批({getCount('pending')})
        </div>
        <div onClick={() => setStatusTab('approved')}
          style={tabItemStyle(statusTab === 'approved', COLORS.success, COLORS.textLight)}>已通过({getCount('approved')})
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
        loading={loading}
        pagination={false}
        scroll={{ x: 1190 }}
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
