import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Tag } from 'antd';
import {
  RightOutlined, TrophyOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import { mockOpportunities, mockApprovalRequests, mockDeliveryProjects, mockClients, mockQuotationSummaries } from '../mockData';
import { parseFY } from '../utils/parseFY';
import { useMockVersion } from '../utils/mockStore';
import { COLORS } from '../styles/constants';

const fmtK = (v: number) => Math.round(v / 1000).toLocaleString() + 'K';

/* ── KPI 卡片（与销售分析完全一致） ── */
const KpiCard: React.FC<{
  label: string; value: string; color: string; icon: React.ReactNode;
  prevValues?: { value: string; color: string }[];
}> = ({ label, value, color, icon, prevValues }) => (
  <Card size="small" hoverable
    style={{
      flex: 1, borderRadius: 8, border: `1px solid ${COLORS.borderLight}`,
      transition: 'box-shadow 0.2s, transform 0.15s',
    }}
    styles={{ body: { padding: '16px 12px', textAlign: 'center' as const } }}
  >
    <div style={{ fontSize: 26, marginBottom: 4, lineHeight: 1, color }}>{icon}</div>
    <div style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 4, letterSpacing: 0.3 }}>
      {label}
    </div>
    <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
    {prevValues && prevValues.length === 2 && (
      <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.3, marginTop: 3, opacity: 0.7 }}>
        <span style={{ color: prevValues[0].color }}>{prevValues[0].value}</span>
        <span style={{ color: COLORS.textLight, margin: '0 4px' }}>|</span>
        <span style={{ color: prevValues[1].color }}>{prevValues[1].value}</span>
      </div>
    )}
  </Card>
);

/* ── 区块标题 ── */
const SectionTitle: React.FC<{ title: string; count?: number }> = ({ title, count }) => (
  <div style={{
    fontSize: 14, fontWeight: 700, color: COLORS.textDark, marginBottom: 16, letterSpacing: 0.5,
    display: 'flex', alignItems: 'center', gap: 10,
  }}>
    <span style={{ display: 'inline-block', width: 3, height: 16, borderRadius: 2, background: `linear-gradient(${COLORS.primary}, ${COLORS.purple})` }} />
    {title}
    {count !== undefined && (
      <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: COLORS.primary, borderRadius: 10, padding: '0 8px', lineHeight: '18px' }}>
        {count}
      </span>
    )}
  </div>
);

/* ── 框体柱状图（与销售分析风格一致） ── */
const VerticalBars: React.FC<{
  items: { label: string; value: number; color: string; displayValue?: string }[];
  height?: number;
  unit?: string;
  maxSlots?: number;
  groupGaps?: number[];
  gapSize?: number;
  barWidth?: number;
}> = ({ items, height = 120, unit, maxSlots, groupGaps, gapSize = 14, barWidth = 25 }) => {
  const slotCount = maxSlots || items.length;
  const maxVal = items.reduce((m, i) => Math.max(m, i.value), 0);
  const max = maxVal > 0 ? maxVal : 1;
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => i === 0 || v !== a[i - 1]);
  const slots = Array.from({ length: slotCount }, (_, i) => items[i] || null);
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <div style={{ width: 28, flexShrink: 0, height, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {[...ticks].reverse().map(t => (
            <span key={t} style={{ fontSize: 9, color: '#aaa', textAlign: 'right', lineHeight: 1 }}>{t}{unit}</span>
          ))}
        </div>
        <div style={{ flex: 1, height, position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 2 }}>
          {ticks.map(t => (
            <div key={t} style={{ position: 'absolute', left: 0, right: 0, top: `${(1 - t / max) * 100}%`, borderTop: `1px solid ${COLORS.borderLight}`, pointerEvents: 'none' }} />
          ))}
          {slots.map((item, i) => (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              flex: 1, justifyContent: 'flex-end', alignSelf: 'stretch',
              marginLeft: groupGaps?.includes(i - 1) ? gapSize : 0,
            }}>
              {item && item.color !== 'transparent' ? (
                <>
                  {item.displayValue ? (
                    <div style={{ fontSize: 9, fontWeight: 600, color: item.color, marginBottom: 3, textAlign: 'center', lineHeight: 1.2 }}>
                      {item.displayValue.split('\n').map((line, li) => (
                        <div key={li}>{line}</div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontSize: 9, fontWeight: 600, color: item.color, marginBottom: 3, textAlign: 'center', lineHeight: 1.2 }}>{item.value}{unit || ''}</span>
                  )}
                  <div style={{
                    width: barWidth,
                    height: `${Math.max((item.value / max) * 100, 4)}%`, minHeight: 4,
                    border: `3px solid ${item.color}`,
                    background: 'transparent',
                  }} />
                </>
              ) : (
                <div style={{ width: item && item.color === 'transparent' ? 16 : barWidth, height: 0 }} />
              )}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', marginTop: 6, paddingLeft: 32 }}>
        {slots.map((item, i) => (
          <span key={i} style={{
            flex: 1, textAlign: 'center', fontSize: 9, color: COLORS.textSecondary,
            lineHeight: 1.3, opacity: item && item.color !== 'transparent' ? 1 : 0,
            marginLeft: groupGaps?.includes(i - 1) ? gapSize : 0,
          }}>
            {item && item.color !== 'transparent' ? item.label.split('\n').map((l, j) => <span key={j} style={{ display: 'block' }}>{l}</span>) : ''}
          </span>
        ))}
      </div>
    </div>
  );
};

/* ── 饼图（引出线沿圆周分布） ── */
const PieChart: React.FC<{
  items: { label: string; value: number; color: string }[];
  pieSize?: number;
}> = ({ items, pieSize = 130 }) => {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) return null;
  const pad = 48;
  const W = pieSize + pad * 2;
  const H = pieSize + pad * 2;
  const cx = W / 2, cy = H / 2, r = pieSize / 2;
  type Slice = { start: number; end: number; label: string; value: number; color: string };
  let cur = 0;
  const slices: Slice[] = items.map(i => {
    const start = (cur / total) * 360;
    cur += i.value;
    return { start, end: (cur / total) * 360, ...i };
  });
  const polar = (angle: number, radius: number) => ({
    x: cx + radius * Math.cos((angle - 90) * Math.PI / 180),
    y: cy + radius * Math.sin((angle - 90) * Math.PI / 180),
  });
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      {slices.map(s => {
        const p1 = polar(s.start, r), p2 = polar(s.end, r);
        const large = s.end - s.start > 180 ? 1 : 0;
        return <path key={s.label} d={`M${cx} ${cy} L${p1.x} ${p1.y} A${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y} Z`} fill={s.color} opacity={0.85} />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.45} fill="#fff" />
      {slices.map(s => {
        const mid = (s.start + s.end) / 2;
        const rad = (mid - 90) * Math.PI / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const lx = cx + (r + 3) * cos;
        const ly = cy + (r + 3) * sin;
        const tx = cx + (r + 34) * cos;
        const ty = cy + (r + 34) * sin;
        const isRight = cos > 0.3, isLeft = cos < -0.3, isBottom = sin > 0.3;
        const anchor = isRight ? 'start' : isLeft ? 'end' : 'middle';
        const dx = isRight ? 8 : isLeft ? -8 : 0;
        const dy = isBottom ? 18 : -4;
        return (
          <g key={s.label}>
            <line x1={lx} y1={ly} x2={tx} y2={ty} stroke={s.color} strokeWidth={1.5} />
            <circle cx={tx} cy={ty} r={2.5} fill={s.color} />
            <text x={tx + dx} y={ty + dy} textAnchor={anchor} fontSize={11} fill={s.color}>{s.value}</text>
          </g>
        );
      })}
    </svg>
  );
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  useMockVersion();

  const now = useMemo(() => new Date(), []);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const kpi = useMemo(() => {
    const totalOpps = mockOpportunities.length;
    const totalAmount = mockOpportunities.reduce((s, o) => s + o.amount, 0);
    const pipelineAmount = mockOpportunities.filter(o => o.status === '过程中').reduce((s, o) => s + o.amount, 0);
    const monthWins = mockOpportunities.filter(o => o.status === '赢' && new Date(o.updatedAt) >= monthStart);
    const monthNew = mockOpportunities.filter(o => new Date(o.createdAt) >= monthStart);
    const pendingApprovals = mockApprovalRequests.filter(r => r.status === 'pending').length;
    const activeDeliveries = mockDeliveryProjects.filter(p => p.status !== '已完成');
    return {
      totalOpps, totalAmount, pipelineAmount,
      monthWinCount: monthWins.length, monthWinAmount: monthWins.reduce((s, o) => s + o.amount, 0),
      monthNewCount: monthNew.length, monthNewAmount: monthNew.reduce((s, o) => s + o.amount, 0),
      pendingApprovals,
      activeDeliveryCount: activeDeliveries.length,
      activeDeliveryAmount: activeDeliveries.reduce((s, p) => s + p.contractAmount, 0),
    };
  }, []);

  // ── 按月 KPI（最近3个完整月） ──
  const monthlyKpi = useMemo(() => {
    const now = new Date();
    const calcMonth = (offset: number) => {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const monthOpps = mockOpportunities.filter(o => {
        const created = new Date(o.createdAt);
        const effEnd = (o.status === '过程中' || o.status === '冻结') ? new Date() : new Date(o.updatedAt);
        return created <= mEnd && effEnd >= mStart;
      });
      const monthWins = monthOpps.filter(o => o.status === '赢' && new Date(o.updatedAt) >= mStart && new Date(o.updatedAt) <= mEnd);
      const monthLosses = monthOpps.filter(o => o.status === '输' && new Date(o.updatedAt) >= mStart && new Date(o.updatedAt) <= mEnd);
      const monthNew = mockOpportunities.filter(o => new Date(o.createdAt) >= mStart && new Date(o.createdAt) <= mEnd);
      const activeDel = mockDeliveryProjects.filter(p => p.status !== '已完成');
      const winCnt = monthWins.length, lossCnt = monthLosses.length;
      const total = winCnt + lossCnt;
      return {
        amt: monthOpps.reduce((s, o) => s + o.amount, 0), cnt: monthOpps.length,
        winAmt: monthWins.reduce((s, o) => s + o.amount, 0), winCnt,
        newAmt: monthNew.reduce((s, o) => s + o.amount, 0), newCnt: monthNew.length,
        winRate: total > 0 ? Math.round(winCnt / total * 100) : 0,
        delAmt: activeDel.reduce((s, p) => s + p.contractAmount, 0), delCnt: activeDel.length,
      };
    };
    return [calcMonth(1), calcMonth(2), calcMonth(3)];
  }, []);

  const recentWins = useMemo(() =>
    mockOpportunities.filter(o => o.status === '赢').sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5), []);

  const recentLosses = useMemo(() =>
    mockOpportunities.filter(o => o.status === '输').sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5), []);

  const pendingItems = useMemo(() => mockApprovalRequests.filter(r => r.status === 'pending').slice(0, 5), []);

  const stageDist = useMemo(() => {
    const stages = ['信息', '线索', '机会', '投标', '议价'];
    const colors = [COLORS.chartGray, COLORS.primary, COLORS.purple, COLORS.warning, COLORS.amber];
    const monthLabels = ['Apr', 'May', 'Jun'];
    const getPipelineStage = (o: typeof mockOpportunities[0], monthEnd: Date) => {
      if (new Date(o.createdAt) > monthEnd) return null;
      if ((o.status === '赢' || o.status === '输') && new Date(o.updatedAt) <= monthEnd) return null;
      return o.stage;
    };
    const result: { label: string; value: number; color: string }[] = [];
    for (const stage of stages) {
      const ci = stages.indexOf(stage);
      for (let mi = 3; mi >= 1; mi--) {
        const d = new Date(now.getFullYear(), now.getMonth() - mi, 1);
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const count = mockOpportunities.filter(o => getPipelineStage(o, monthEnd) === stage).length;
        result.push({ label: monthLabels[3 - mi], value: count, color: colors[ci] });
      }
    }
    return result;
  }, []);

  const getReasonInfo = (reasons: string): { label: string; color: string } => {
    const cat = reasons.split(':')[0];
    const map: Record<string, { label: string; color: string }> = {
      '竞对': { label: '竞对丢单', color: COLORS.danger },
      '取消': { label: '客户取消', color: COLORS.warning },
      '放弃': { label: '我方放弃', color: COLORS.textSecondary },
    };
    return map[cat] || { label: cat, color: COLORS.textSecondary };
  };

  const deliveryStats = useMemo(() => {
    const allNodes = mockDeliveryProjects.flatMap(p => p.nodes);
    const getStatusInMonth = (p: typeof mockDeliveryProjects[0], monthEnd: Date): string | null => {
      if (new Date(p.createdAt) > monthEnd) return null;
      if (new Date(p.updatedAt) <= monthEnd) return p.status;
      return '进行中';
    };
    const changedThisMonth = (p: typeof mockDeliveryProjects[0], monthEnd: Date): boolean => {
      const d = new Date(p.updatedAt);
      const monthStart = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), 1);
      return d >= monthStart && d <= monthEnd;
    };
    const monthLabels = ['Apr', 'May', 'Jun'];
    const statusNames = ['已完成', '进行中', '已延期'] as const;
    const statusColors = [COLORS.success, COLORS.primary, COLORS.danger] as const;
    const projectStatus: { label: string; value: number; color: string }[] = [];
    for (let si = 0; si < 3; si++) {
      for (let mi = 3; mi >= 1; mi--) {
        const d = new Date(now.getFullYear(), now.getMonth() - mi, 1);
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const count = mockDeliveryProjects.filter(p => getStatusInMonth(p, monthEnd) === statusNames[si]).length;
        projectStatus.push({ label: monthLabels[3 - mi], value: count, color: statusColors[si] });
      }
    }
    const getNodeStatusInMonth = (node: typeof allNodes[0], monthEnd: Date): string | null => {
      const start = new Date(node.plannedStartDate);
      if (start > monthEnd) return null;
      if (node.actualDate && new Date(node.actualDate) <= monthEnd) {
        return node.status === 'delayed' ? 'delayed' : 'completed';
      }
      return new Date(node.plannedEndDate) <= monthEnd ? 'delayed' : 'in_progress';
    };
    const nodeStNames = ['completed', 'in_progress', 'delayed', 'pending'] as const;
    const nodeStColors = [COLORS.success, COLORS.primary, COLORS.danger, COLORS.chartGray];
    const nodeStatus: { label: string; value: number; color: string }[] = [];
    for (let si = 0; si < 4; si++) {
      for (let mi = 3; mi >= 1; mi--) {
        const d = new Date(now.getFullYear(), now.getMonth() - mi, 1);
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const count = allNodes.filter(n => getNodeStatusInMonth(n, monthEnd) === nodeStNames[si]).length;
        nodeStatus.push({ label: monthLabels[3 - mi], value: count, color: nodeStColors[si] });
      }
    }
    const onTimeRate = mockDeliveryProjects.slice(0, 10).map(p => {
      const done = p.nodes.filter(n => n.status === 'completed' || n.status === 'delayed');
      const delayed = done.filter(n => n.status === 'delayed').length;
      const onTime = done.length - delayed;
      const rate = done.length > 0 ? Math.round((onTime / done.length) * 100) : 0;
      return {
        label: p.clientName.length > 5 ? p.clientName.slice(0, 4) + '…' : p.clientName,
        value: rate,
        color: rate >= 90 ? COLORS.success : rate >= 70 ? COLORS.warning : COLORS.danger,
      };
    });
    const getEstProfit = (p: typeof mockDeliveryProjects[0]) => {
      const q = mockQuotationSummaries.find(q => q.id === p.quotationId);
      return q ? Math.round(p.contractAmount * q.profitRate / 100) : 0;
    };
    const getActProfit = (p: typeof mockDeliveryProjects[0]) => p.totalActualCost ? p.contractAmount - p.totalActualCost : 0;
    const profitOverview: { label: string; value: number; color: string; displayValue?: string }[] = [];
    for (const prefix of ['概算', '实际'] as const) {
      for (let mi = 3; mi >= 1; mi--) {
        const d = new Date(now.getFullYear(), now.getMonth() - mi, 1);
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        let totalAmt = 0, totalProfit = 0;
        mockDeliveryProjects.forEach(p => {
          const status = getStatusInMonth(p, monthEnd);
          if (prefix === '概算' && status === '进行中') {
            totalProfit += getEstProfit(p);
            totalAmt += p.contractAmount;
          } else if (prefix === '实际' && status === '已完成' && changedThisMonth(p, monthEnd)) {
            totalProfit += getActProfit(p);
            totalAmt += p.contractAmount;
          }
        });
        profitOverview.push({
          label: monthLabels[3 - mi],
          value: Math.round(totalProfit / 1000),
          color: prefix === '概算' ? COLORS.primary : COLORS.success,
          displayValue: totalProfit > 0 ? `${fmtK(totalProfit)}\n（${fmtK(totalAmt)}）` : undefined,
        });
      }
    }
    return { projectStatus, nodeStatus, onTimeRate, profitOverview };
  }, []);

  const currentFy = useMemo(() => {
    const y = now.getFullYear(), m = now.getMonth();
    const y1 = m >= 6 ? y : y - 1;
    const y2 = m >= 6 ? y + 1 : y;
    return `FY${String(y1 % 100).padStart(2, '0')}${String(y2 % 100).padStart(2, '0')}`;
  }, []);

  const fyTrend = useMemo(() => {
    const fyRange = parseFY(currentFy);
    const fyOpps = mockOpportunities.filter(o => {
      const d = new Date(o.createdAt);
      return d >= fyRange.start && d <= fyRange.end;
    });
    const monthLabels = ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun'];
    return Array.from({ length: 12 }, (_, i) => {
      const month = (6 + i) % 12;
      const monthOpps = fyOpps.filter(o => new Date(o.createdAt).getMonth() === month);
      const count = monthOpps.length;
      const amount = monthOpps.reduce((s, o) => s + o.amount, 0);
      return {
        label: monthLabels[i],
        value: count > 0 ? Math.round(amount / 1000) : 0,
        color: COLORS.primary,
        displayValue: count > 0 ? `${fmtK(amount)}\n(${count})` : undefined,
      };
    });
  }, [currentFy]);

  const industryDist = useMemo(() => {
    const fyRange = parseFY(currentFy);
    const clientIndustry = new Map(mockClients.map(c => [c.name, c.industry]));
    const counts: Record<string, number> = {};
    mockOpportunities.forEach(o => {
      const created = new Date(o.createdAt);
      const effectiveEnd = (o.status === '过程中' || o.status === '冻结') ? new Date() : new Date(o.updatedAt);
      if (created <= fyRange.end && effectiveEnd >= fyRange.start) {
        const industry = clientIndustry.get(o.clientName) || '其他';
        counts[industry] = (counts[industry] || 0) + 1;
      }
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const colors = [COLORS.primary, COLORS.purple, COLORS.warning, COLORS.amber, COLORS.chartGray, COLORS.textSecondary, COLORS.danger];
    return sorted.slice(0, 6).map(([label, value], i) => ({ label, value, color: colors[i] || COLORS.chartGray }));
  }, [currentFy]);

  return (
    <div className="dashboard-container">
      {/* ── 标题 ── */}
      <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.textDark, marginBottom: 10, letterSpacing: 0.5 }}>
        仪表盘
      </div>

      {/* ── KPI 卡片行（等宽铺满，与销售分析一致） ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
        <KpiCard label="销售机会" value={`${fmtK(monthlyKpi[0].amt)} / ${monthlyKpi[0].cnt}`} color={COLORS.primary} icon="📊"
          prevValues={[
            { value: `${fmtK(monthlyKpi[1].amt)} / ${monthlyKpi[1].cnt}`, color: COLORS.primary },
            { value: `${fmtK(monthlyKpi[2].amt)} / ${monthlyKpi[2].cnt}`, color: COLORS.primary },
          ]} />
        <KpiCard label="本月赢单" value={`${fmtK(monthlyKpi[0].winAmt)} / ${monthlyKpi[0].winCnt}`} color={COLORS.success} icon="🏆"
          prevValues={[
            { value: `${fmtK(monthlyKpi[1].winAmt)} / ${monthlyKpi[1].winCnt}`, color: COLORS.success },
            { value: `${fmtK(monthlyKpi[2].winAmt)} / ${monthlyKpi[2].winCnt}`, color: COLORS.success },
          ]} />
        <KpiCard label="新增机会" value={`${fmtK(monthlyKpi[0].newAmt)} / ${monthlyKpi[0].newCnt}`} color={COLORS.amber} icon="✨"
          prevValues={[
            { value: `${fmtK(monthlyKpi[1].newAmt)} / ${monthlyKpi[1].newCnt}`, color: COLORS.amber },
            { value: `${fmtK(monthlyKpi[2].newAmt)} / ${monthlyKpi[2].newCnt}`, color: COLORS.amber },
          ]} />
        <KpiCard label="赢单率" value={`${monthlyKpi[0].winRate}%`} color={monthlyKpi[0].winRate >= 50 ? COLORS.success : COLORS.warning} icon="🎯"
          prevValues={[
            { value: `${monthlyKpi[1].winRate}%`, color: monthlyKpi[1].winRate >= 50 ? COLORS.success : COLORS.warning },
            { value: `${monthlyKpi[2].winRate}%`, color: monthlyKpi[2].winRate >= 50 ? COLORS.success : COLORS.warning },
          ]} />
        <KpiCard label="交付中" value={`${fmtK(monthlyKpi[0].delAmt)} / ${monthlyKpi[0].delCnt}`} color={COLORS.purple} icon="🚧"
          prevValues={[
            { value: `${fmtK(monthlyKpi[1].delAmt)} / ${monthlyKpi[1].delCnt}`, color: COLORS.purple },
            { value: `${fmtK(monthlyKpi[2].delAmt)} / ${monthlyKpi[2].delCnt}`, color: COLORS.purple },
          ]} />
      </div>

      {/* ── 交付状态 ── */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
        <Card size="small"
          style={{ flex: 1, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '18px 20px' } }}>
          <SectionTitle title="交付状态" />
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', minHeight: 150, marginTop: -18 }}>
            <div style={{ flex: 4, display: 'flex', flexDirection: 'column', marginLeft: -20 }}>
              <div style={{ fontSize: 10, color: COLORS.textLight, fontWeight: 500, textAlign: 'right', marginBottom: 2, paddingRight: 2 }}>项目状态</div>
              <VerticalBars items={deliveryStats.projectStatus} height={210} groupGaps={[2, 5]} gapSize={4} />
            </div>
            <div style={{ width: 1, background: COLORS.borderLight, flexShrink: 0 }} />
            <div style={{ flex: 5, display: 'flex', flexDirection: 'column', marginLeft: -10 }}>
              <div style={{ fontSize: 10, color: COLORS.textLight, fontWeight: 500, textAlign: 'right', marginBottom: 2, paddingRight: 2 }}>节点执行</div>
              <VerticalBars items={deliveryStats.nodeStatus} height={210} groupGaps={[2, 5, 8]} gapSize={5} />
            </div>
            <div style={{ width: 1, background: COLORS.borderLight, flexShrink: 0 }} />
            <div style={{ flex: 6, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, color: COLORS.textLight, fontWeight: 500, textAlign: 'right', marginBottom: 2, paddingRight: 2 }}>节点准时率</div>
              <VerticalBars items={deliveryStats.onTimeRate} height={210} unit="%" maxSlots={18} />
            </div>
            <div style={{ width: 1, background: COLORS.borderLight, flexShrink: 0 }} />
            <div style={{ flex: 4, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, color: COLORS.textLight, fontWeight: 500, textAlign: 'right', marginBottom: 2, paddingRight: 2 }}>利润概览</div>
              <VerticalBars items={deliveryStats.profitOverview} height={210} unit="K" />
            </div>
          </div>
        </Card>
      </div>

      {/* ── 底栏：管道节点 | 行业分布 | 机会趋势 ── */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <Card size="small"
          style={{ flex: '1 1 220px', minWidth: 190, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '16px 18px' } }}>
          <SectionTitle title="管道节点" />
          {stageDist.every(s => s.value === 0) ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textLight, fontSize: 13 }}>暂无活跃管道</div>
          ) : (
            <div style={{ marginTop: 50, marginLeft: -20 }}>
              <VerticalBars items={stageDist} height={250} groupGaps={[2, 5, 8, 11]} />
            </div>
          )}
        </Card>

        <Card size="small"
          style={{ flex: '1 1 283px', minWidth: 233, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '16px 18px' } }}>
          <SectionTitle title="行业分布" count={industryDist.reduce((s, i) => s + i.value, 0)} />
          {industryDist.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textLight, fontSize: 13 }}>暂无数据</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: -20 }}>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center', overflow: 'visible' }}>
                <PieChart items={industryDist} pieSize={240} />
              </div>
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {industryDist.map(i => (
                  <div key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: i.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>{i.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card size="small"
          style={{ flex: '1 1 397px', minWidth: 337, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '16px 18px' } }}>
          <SectionTitle title="机会趋势" count={fyTrend.reduce((s, m) => s + m.value, 0)} />
          {fyTrend.every(m => m.value === 0) ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textLight, fontSize: 13 }}>当前财年暂无新增</div>
          ) : (
            <div style={{ marginTop: 50 }}>
              <VerticalBars items={fyTrend} height={250} unit="K" />
            </div>
          )}
        </Card>
      </div>

      {/* ── 动态：近期赢单 | 待审批项 | 近期输单 ── */}
      <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
        <Card size="small"
          style={{ flex: '1 1 380px', minWidth: 300, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '4px 16px' } }}>
          <SectionTitle title="近期赢单" count={recentWins.length} />
          {recentWins.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textLight, fontSize: 13 }}>暂无赢单记录</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {recentWins.map(o => (
                <div key={o.id} onClick={() => navigate('/opportunities')}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = COLORS.bgSelected}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontSize: 18, lineHeight: 1, color: COLORS.success }}><TrophyOutlined /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.clientName}</div>
                    <div style={{ fontSize: 11, color: COLORS.textLight, display: 'flex', gap: 10, marginTop: 1 }}>
                      <span>{o.salesman}</span>
                      <span>{o.updatedAt}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.success, whiteSpace: 'nowrap' }}>¥{fmtK(o.amount)}</span>
                  <RightOutlined style={{ color: COLORS.textLight, fontSize: 12 }} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card size="small"
          style={{ flex: '1 1 380px', minWidth: 300, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '4px 16px' } }}>
          <SectionTitle title="待审批项" count={pendingItems.length} />
          {pendingItems.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textLight, fontSize: 13 }}>暂无待审批项</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {pendingItems.map(r => (
                <div key={r.id} onClick={() => navigate('/approval')}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = COLORS.bgSelected}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontSize: 18, lineHeight: 1, color: COLORS.warning }}><ClockCircleOutlined /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.clientName}</div>
                    <div style={{ fontSize: 11, color: COLORS.textLight, display: 'flex', gap: 10, marginTop: 1 }}>
                      <span>{r.submitter}</span>
                      <span>{r.submitTime}</span>
                      <span style={{ color: COLORS.textSecondary }}>¥{fmtK(r.amount)}</span>
                    </div>
                  </div>
                  <Tag color={r.approvalType === 'quotation' ? COLORS.primary : r.approvalType === 'plan' ? COLORS.warning : COLORS.success}
                    style={{ margin: 0, fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 4, padding: '1px 8px' }}>
                    {{ quotation: '报价', plan: '计划', cost: '成本' }[r.approvalType]}
                  </Tag>
                  <RightOutlined style={{ color: COLORS.textLight, fontSize: 12 }} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card size="small"
          style={{ flex: '1 1 380px', minWidth: 300, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}
          styles={{ body: { padding: '4px 16px' } }}>
          <SectionTitle title="近期输单" count={recentLosses.length} />
          {recentLosses.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textLight, fontSize: 13 }}>暂无输单记录</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {recentLosses.map(o => {
                const reason = getReasonInfo(o.reasons || '');
                return (
                  <div key={o.id} onClick={() => navigate('/opportunities')}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = COLORS.bgSelected}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ fontSize: 14 }}>❌</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.clientName}</div>
                      <div style={{ fontSize: 11, color: COLORS.textLight, display: 'flex', gap: 10, marginTop: 1 }}>
                        <span>{o.salesman}</span>
                        <span>{o.updatedAt}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>¥{fmtK(o.amount)}</span>
                      <Tag color={reason.color}
                        style={{ margin: 0, fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 4, padding: '1px 8px' }}>
                        {reason.label}
                      </Tag>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
