import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Tag } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { mockOpportunities, mockApprovalRequests, mockDeliveryProjects } from '../mockData';
import { COLORS } from '../styles/constants';

const fmtK = (v: number) => Math.round(v / 1000).toLocaleString() + 'K';

/* ── KPI 卡片（现代风格） ── */
const KpiCard: React.FC<{
  label: string; value: string; color: string; icon: string; subValue?: string; gradient?: string;
}> = ({ label, value, color, icon, subValue, gradient }) => (
  <Card size="small" hoverable
    style={{
      flex: 1, borderRadius: 12, border: 'none', overflow: 'hidden',
      background: gradient || '#fff',
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      transition: 'transform 0.2s, box-shadow 0.2s',
    }}
    styles={{ body: { padding: '20px 18px', position: 'relative' } }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)'; }}
  >
    <div style={{ fontSize: 24, marginBottom: 6, opacity: gradient ? 0.9 : 1 }}>{icon}</div>
    <div style={{ fontSize: 12, color: gradient ? 'rgba(255,255,255,0.7)' : COLORS.textLight, marginBottom: 4, fontWeight: 500, letterSpacing: 0.5 }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 700, color: gradient ? '#fff' : color, lineHeight: 1.15 }}>{value}</div>
    {subValue && <div style={{ fontSize: 13, fontWeight: 600, color: gradient ? 'rgba(255,255,255,0.6)' : COLORS.textSecondary, marginTop: 4 }}>{subValue}</div>}
  </Card>
);

/* ── 区块标题 ── */
const SectionTitle: React.FC<{ title: string }> = ({ title }) => (
  <div style={{
    fontSize: 14, fontWeight: 700, color: COLORS.textDark, marginBottom: 16, letterSpacing: 0.5,
    display: 'flex', alignItems: 'center', gap: 10,
  }}>
    <span style={{ display: 'inline-block', width: 3, height: 16, borderRadius: 2, background: `linear-gradient(${COLORS.primary}, ${COLORS.purple})` }} />
    {title}
  </div>
);

/* ── 管道阶段柱状图 ── */
const StageBar: React.FC<{ label: string; count: number; color: string; max: number }> = ({ label, count, color, max }) => {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <span style={{ width: 36, fontSize: 12, color: COLORS.textSecondary, textAlign: 'right' }}>{label}</span>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: COLORS.borderLight, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: color, opacity: 0.7, transition: 'width 0.4s' }} />
      </div>
      <span style={{ width: 24, fontSize: 13, fontWeight: 700, color, textAlign: 'right' }}>{count}</span>
    </div>
  );
};

/* ── 活动条目 ── */
const ActivityItem: React.FC<{ time: string; text: string; color: string }> = ({ time, text, color }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0', borderBottom: `1px solid ${COLORS.borderLight}` }}>
    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, marginTop: 5, flexShrink: 0 }} />
    <div style={{ flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5 }}>{text}</div>
    <div style={{ fontSize: 11, color: COLORS.textLight, whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2 }}>{time}</div>
  </div>
);

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const now = useMemo(() => new Date(), []);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const kpi = useMemo(() => {
    const totalOpps = mockOpportunities.length;
    const pipelineAmount = mockOpportunities.filter(o => o.status === '过程中').reduce((s, o) => s + o.amount, 0);
    const monthWins = mockOpportunities.filter(o => o.status === '赢' && new Date(o.updatedAt) >= monthStart);
    const pendingApprovals = mockApprovalRequests.filter(r => r.status === 'pending').length;
    const activeDeliveries = mockDeliveryProjects.filter(p => p.status !== '已完成').length;
    return { totalOpps, pipelineAmount, monthWinCount: monthWins.length, monthWinAmount: monthWins.reduce((s, o) => s + o.amount, 0), pendingApprovals, activeDeliveries };
  }, []);

  const recentWins = useMemo(() =>
    mockOpportunities.filter(o => o.status === '赢').sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5), []);

  const pendingItems = useMemo(() => mockApprovalRequests.filter(r => r.status === 'pending').slice(0, 5), []);

  const stageDist = useMemo(() => {
    const stages = ['信息', '线索', '机会', '投标', '议价'];
    const colors = [COLORS.chartGray, COLORS.primary, COLORS.purple, COLORS.warning, COLORS.amber];
    const counts = stages.map(s => mockOpportunities.filter(o => o.stage === s && o.status === '过程中').length);
    const max = Math.max(...counts, 1);
    return stages.map((s, i) => ({ label: s, count: counts[i], color: colors[i], max }));
  }, []);

  const activities = useMemo(() => {
    const items: { time: string; text: string; color: string }[] = [];
    mockOpportunities.filter(o => o.status === '赢').slice(0, 3).forEach(o => items.push({ time: o.updatedAt, text: `${o.clientName} — ${o.projectName} 赢单`, color: COLORS.success }));
    mockApprovalRequests.filter(r => r.status === 'pending').slice(0, 3).forEach(r => items.push({ time: r.submitTime, text: `${r.clientName} — ${r.projectName} 待审批`, color: COLORS.warning }));
    mockDeliveryProjects.filter(p => p.status === '已完成').slice(0, 2).forEach(p => items.push({ time: p.updatedAt, text: `${p.clientName} — ${p.projectName} 交付完成`, color: COLORS.primary }));
    return items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 7);
  }, []);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* ── 标题 ── */}
      <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.textDark, marginBottom: 24, letterSpacing: 0.5 }}>
        仪表盘
      </div>

      {/* ── KPI 卡片行 ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
        <KpiCard label="销售机会" value={String(kpi.totalOpps)} color={COLORS.primary} icon="📊"
          subValue={`管道 ¥${fmtK(kpi.pipelineAmount)}`}
          gradient="linear-gradient(135deg, #eef4ff, #fff)" />
        <KpiCard label="本月赢单" value={`${kpi.monthWinCount} 个`} color={COLORS.success} icon="🏆"
          subValue={`¥${fmtK(kpi.monthWinAmount)}`}
          gradient="linear-gradient(135deg, #e8f5e9, #fff)" />
        <KpiCard label="待审批" value={String(kpi.pendingApprovals)} color={COLORS.warning} icon="📋"
          gradient="linear-gradient(135deg, #fff3e0, #fff)" />
        <KpiCard label="进行中交付" value={String(kpi.activeDeliveries)} color={COLORS.purple} icon="🚧"
          gradient="linear-gradient(135deg, #f0e6ff, #fff)" />
      </div>

      {/* ── 中栏：近期赢单 + 待审批 ── */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 28 }}>
        <Card size="small" style={{ flex: 1, borderRadius: 12, border: `1px solid ${COLORS.borderLight}`, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}
          styles={{ body: { padding: '18px 20px' } }}>
          <SectionTitle title="近期赢单" />
          {recentWins.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textLight, fontSize: 13 }}>暂无赢单记录</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {recentWins.map(o => (
                <div key={o.id} onClick={() => navigate('/opportunities')}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '9px 10px', borderRadius: 8, transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = COLORS.bgSelected}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontSize: 18 }}>🏆</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark }}>{o.clientName}</div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.projectName}</div>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.success, whiteSpace: 'nowrap' }}>¥{fmtK(o.amount)}</span>
                  <RightOutlined style={{ color: COLORS.textLight, fontSize: 13 }} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card size="small" style={{ flex: 1, borderRadius: 12, border: `1px solid ${COLORS.borderLight}`, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}
          styles={{ body: { padding: '18px 20px' } }}>
          <SectionTitle title="待审批项" />
          {pendingItems.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textLight, fontSize: 13 }}>暂无待审批项</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {pendingItems.map(r => (
                <div key={r.id} onClick={() => navigate('/approval')}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '9px 10px', borderRadius: 8, transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = COLORS.bgSelected}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontSize: 18 }}>📋</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark }}>{r.clientName}</div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary }}>{r.projectName}</div>
                  </div>
                  <Tag color={r.approvalType === 'quotation' ? COLORS.primary : r.approvalType === 'plan' ? COLORS.warning : COLORS.success}
                    style={{ margin: 0, fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 4, padding: '1px 8px' }}>
                    {{ quotation: '报价', plan: '计划', cost: '成本' }[r.approvalType]}
                  </Tag>
                  <RightOutlined style={{ color: COLORS.textLight, fontSize: 13 }} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── 底栏：管道分布 + 近期动态 ── */}
      <div style={{ display: 'flex', gap: 20 }}>
        <Card size="small" style={{ flex: 1, borderRadius: 12, border: `1px solid ${COLORS.borderLight}`, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}
          styles={{ body: { padding: '18px 20px' } }}>
          <SectionTitle title="管道阶段分布" />
          <div style={{ padding: '4px 0' }}>
            {stageDist.map(s => <StageBar key={s.label} {...s} />)}
          </div>
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: COLORS.bgLight, fontSize: 12, color: COLORS.textSecondary }}>
            当前活跃管道总计 <strong style={{ color: COLORS.primary, fontSize: 14 }}>¥{fmtK(kpi.pipelineAmount)}</strong>
          </div>
        </Card>

        <Card size="small" style={{ flex: 1, borderRadius: 12, border: `1px solid ${COLORS.borderLight}`, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}
          styles={{ body: { padding: '18px 20px' } }}>
          <SectionTitle title="近期动态" />
          {activities.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textLight, fontSize: 13 }}>暂无动态</div>
          ) : (
            <div>{activities.map((a, i) => <ActivityItem key={i} {...a} />)}</div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
