import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Tag } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { mockOpportunities, mockApprovalRequests, mockDeliveryProjects } from '../mockData';

import { COLORS } from '../styles/constants';

const fmtK = (v: number) => Math.round(v / 1000).toLocaleString() + 'K';

/* ── KPI 卡片 ── */
const KpiCard: React.FC<{ label: string; value: string; color: string; icon: string; subValue?: string }> =
  ({ label, value, color, icon, subValue }) => (
    <Card size="small" hoverable
      style={{
        flex: 1, borderRadius: 8, border: `1px solid ${COLORS.borderLight}`,
        transition: 'box-shadow 0.2s, transform 0.15s',
      }}
      styles={{ body: { padding: '16px 12px', textAlign: 'center' } }}
    >
      <div style={{ fontSize: 20, marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 4, letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
      {subValue && <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, marginTop: 2 }}>{subValue}</div>}
    </Card>
  );

/* ── 区块标题 ── */
const SectionTitle: React.FC<{ title: string }> = ({ title }) => (
  <div style={{
    fontSize: 15, fontWeight: 700, color: COLORS.textDark, marginBottom: 14, letterSpacing: 0.5,
    display: 'flex', alignItems: 'center', gap: 10,
  }}>
    <span style={{
      display: 'inline-block', width: 3, height: 16, borderRadius: 2,
      background: `linear-gradient(${COLORS.primary}, ${COLORS.purple})`,
    }} />
    {title}
  </div>
);

/* ── 小型竖状柱状图（管道阶段分布） ── */
const MiniStageChart: React.FC<{ data: { label: string; count: number; color: string }[] }> = ({ data }) => {
  const maxVal = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120, padding: '8px 0' }}>
      {data.map(d => {
        const h = Math.max(4, (d.count / maxVal) * 100);
        return (
          <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: d.color }}>{d.count}</span>
            <div style={{
              width: '100%', height: h, borderRadius: '3px 3px 0 0',
              background: d.color, opacity: 0.7,
              transition: 'height 0.3s',
            }} />
            <span style={{ fontSize: 10, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const now = useMemo(() => new Date(), []);
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const monthStart = new Date(thisYear, thisMonth, 1);

  // ── KPI 数据 ──
  const kpi = useMemo(() => {
    const totalOpps = mockOpportunities.length;
    const pipelineAmount = mockOpportunities
      .filter(o => o.status === '过程中')
      .reduce((s, o) => s + o.amount, 0);
    const monthWins = mockOpportunities.filter(o => {
      if (o.status !== '赢') return false;
      const d = new Date(o.updatedAt);
      return d >= monthStart;
    });
    const monthWinAmount = monthWins.reduce((s, o) => s + o.amount, 0);
    const pendingApprovals = mockApprovalRequests.filter(r => r.status === 'pending').length;
    const activeDeliveries = mockDeliveryProjects.filter(p => p.status !== '已完成').length;
    return { totalOpps, pipelineAmount, monthWinCount: monthWins.length, monthWinAmount, pendingApprovals, activeDeliveries };
  }, []);

  // ── 近期赢单 ──
  const recentWins = useMemo(() =>
    mockOpportunities.filter(o => o.status === '赢')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5), []);

  // ── 待审批项 ──
  const pendingItems = useMemo(() =>
    mockApprovalRequests.filter(r => r.status === 'pending'), []);

  // ── 管道阶段分布 ──
  const stageDist = useMemo(() => {
    const stages = ['信息', '线索', '机会', '投标', '议价'];
    const colors = [COLORS.chartGray, COLORS.primary, COLORS.purple, COLORS.warning, COLORS.amber];
    return stages.map((s, i) => ({
      label: s, color: colors[i],
      count: mockOpportunities.filter(o => o.stage === s && o.status === '过程中').length,
    }));
  }, []);

  // ── 近期动态 ──
  const recentActivities = useMemo(() => {
    const activities: { time: string; text: string; color: string }[] = [];
    for (const o of mockOpportunities.filter(o => o.status === '赢').slice(0, 3)) {
      activities.push({ time: o.updatedAt, text: `${o.clientName} — ${o.projectName} 赢单`, color: COLORS.success });
    }
    for (const r of mockApprovalRequests.filter(r => r.status === 'pending').slice(0, 3)) {
      activities.push({ time: r.submitTime, text: `${r.clientName} — ${r.projectName} 待审批`, color: COLORS.warning });
    }
    for (const p of mockDeliveryProjects.filter(p => p.status === '已完成').slice(0, 2)) {
      activities.push({ time: p.updatedAt, text: `${p.clientName} — ${p.projectName} 交付完成`, color: COLORS.primary });
    }
    return activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 8);
  }, []);

  const typeLabel = (t: string) => t === 'quotation' ? '报价' : t === 'plan' ? '计划' : '成本';

  return (
    <div>
      <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark, marginBottom: 20 }}>仪表盘</div>

      {/* ── Row 1: KPI 卡片 ── */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
        <KpiCard label="销售机会" value={String(kpi.totalOpps)} color={COLORS.primary} icon="📊" subValue={`管道 ¥${fmtK(kpi.pipelineAmount)}`} />
        <KpiCard label="本月赢单" value={`${kpi.monthWinCount} 个`} color={COLORS.success} icon="🏆" subValue={`¥${fmtK(kpi.monthWinAmount)}`} />
        <KpiCard label="待审批" value={String(kpi.pendingApprovals)} color={COLORS.warning} icon="📋" />
        <KpiCard label="进行中交付" value={String(kpi.activeDeliveries)} color={COLORS.purple} icon="🚧" />
      </div>

      {/* ── Row 2: 近期赢单 + 待审批 ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <Card size="small" style={{ flex: 1, borderRadius: 10, border: `1px solid ${COLORS.borderLight}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          styles={{ body: { padding: '16px 18px' } }}>
          <SectionTitle title="近期赢单" />
          {recentWins.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textLight, fontSize: 13 }}>暂无赢单记录</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentWins.map(o => (
                <div key={o.id} onClick={() => navigate('/opportunities')}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '8px 10px', borderRadius: 6, transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = COLORS.bgSelected}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontSize: 16 }}>🏆</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark }}>{o.clientName}</div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.projectName}</div>
                  </div>
                  <span style={{ fontSize: 12, color: COLORS.textLight, whiteSpace: 'nowrap' }}>{o.updatedAt}</span>
                  <span style={{ fontWeight: 700, color: COLORS.success, fontSize: 13, whiteSpace: 'nowrap' }}>¥{fmtK(o.amount)}</span>
                  <RightOutlined style={{ color: COLORS.textLight, fontSize: 12 }} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card size="small" style={{ flex: 1, borderRadius: 10, border: `1px solid ${COLORS.borderLight}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          styles={{ body: { padding: '16px 18px' } }}>
          <SectionTitle title="待审批项" />
          {pendingItems.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textLight, fontSize: 13 }}>暂无待审批项</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendingItems.map(r => (
                <div key={r.id} onClick={() => navigate('/approval')}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '8px 10px', borderRadius: 6, transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = COLORS.bgSelected}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontSize: 16 }}>📋</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark }}>{r.clientName}</div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary }}>{r.projectName}</div>
                  </div>
                  <Tag color={r.approvalType === 'quotation' ? COLORS.primary : r.approvalType === 'plan' ? COLORS.warning : COLORS.success}
                    style={{ margin: 0, fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 3 }}>
                    {typeLabel(r.approvalType)}
                  </Tag>
                  <span style={{ fontSize: 12, color: COLORS.textLight }}>{r.submitTime}</span>
                  <RightOutlined style={{ color: COLORS.textLight, fontSize: 12 }} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Row 3: 管道分布 + 近期动态 ── */}
      <div style={{ display: 'flex', gap: 16 }}>
        <Card size="small" style={{ flex: 1, borderRadius: 10, border: `1px solid ${COLORS.borderLight}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          styles={{ body: { padding: '16px 18px' } }}>
          <SectionTitle title="管道阶段分布" />
          <MiniStageChart data={stageDist} />
          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: COLORS.textLight }}>当前活跃管道总计 <strong style={{ color: COLORS.primary }}>¥{fmtK(kpi.pipelineAmount)}</strong></span>
          </div>
        </Card>

        <Card size="small" style={{ flex: 1, borderRadius: 10, border: `1px solid ${COLORS.borderLight}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          styles={{ body: { padding: '16px 18px' } }}>
          <SectionTitle title="近期动态" />
          {recentActivities.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textLight, fontSize: 13 }}>暂无动态</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentActivities.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: COLORS.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.text}</span>
                  <span style={{ fontSize: 11, color: COLORS.textLight, whiteSpace: 'nowrap' }}>{a.time}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
