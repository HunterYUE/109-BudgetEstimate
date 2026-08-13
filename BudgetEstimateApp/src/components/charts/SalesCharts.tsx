import React from 'react';
import { COLORS } from '../../styles/colors';
import { fmtK } from '../../utils/analysisShared';

// ── SV G 销售漏斗 ──
export interface FunnelProps {
  funnelData: { stage: string; count: number; amount: number; color: string }[];
  fyInfo: { count: number; amount: number };
  fyLead: { count: number; amount: number };
  fyOpp: { count: number; amount: number };
  fyWon: { count: number; amount: number };
  /** 财年"机会+"阶段输单（中标转化率分母 = 赢 + 机会+输单；线索/信息阶段输单未进入机会，不计入） */
  fyOppLost: { count: number; amount: number };
}

export const SalesFunnel: React.FC<FunnelProps> = ({ funnelData, fyInfo, fyLead, fyOpp, fyWon, fyOppLost }) => {
  // 四阶段可视化数据
  const stages = [
    { key: 'info', label: '信息', color: COLORS.textLight },
    { key: 'lead', label: '线索', color: COLORS.primary },
    { key: 'opp', label: '机会', color: COLORS.purple },
    { key: 'won', label: '赢单', color: COLORS.success },
  ] as const;

  // 漏斗几何参数
  const hs = [70, 70, 150];
  const angles = [60, 30, 20];
  const rad = angles.map(a => a * Math.PI / 180);
  const halfDeltas = rad.map((r, i) => Math.round(hs[i] * Math.tan(r)));
  const topW = 480;
  const pts = [{ x: 0, w: topW }];
  for (let i = 0; i < halfDeltas.length; i++) {
    pts.push({ x: pts[i].x + hs[i], w: pts[i].w - 2 * halfDeltas[i] });
  }
  pts.push({ x: pts[3].x, w: pts[3].w });

  // 汇总机会阶段（含投标/议价）
  const oppAgg = funnelData.filter(f => ['机会', '投标', '议价'].includes(f.stage));

  const stageMap: Record<string, string> = { info: '信息', lead: '线索', won: '中标' };
  const countFor = (key: string) => {
    if (key === 'opp') return oppAgg.reduce((s, f) => s + f.count, 0);
    const f = (funnelData||[]).find(f => f.stage === stageMap[key]);
    return f?.count || 0;
  };
  const amountFor = (key: string) => {
    if (key === 'opp') return oppAgg.reduce((s, f) => s + f.amount, 0);
    const f = (funnelData||[]).find(f => f.stage === stageMap[key]);
    return f?.amount || 0;
  };

  const fyData: Record<string, { count: number; amount: number }> = {
    info: fyInfo, lead: fyLead, opp: fyOpp, won: fyWon,
  };

  // 财年累计均值转化率（项目数口径）：线索/信息、机会/线索、中标/(赢+机会+输)
  // ⚠️ 仅项目数口径；金额口径因财年累计各阶段金额重叠、无递进意义，不展示
  // 中标转化率 = 赢/(赢+机会+输)：机会→中标的推进率（已决出的机会+项目，不含进行中；线索/信息输单未进机会不计入）
  const convData = [
    { key: 'lead', cnt: fyInfo.count > 0 ? fyLead.count / fyInfo.count * 100 : 0 },
    { key: 'opp', cnt: fyLead.count > 0 ? fyOpp.count / fyLead.count * 100 : 0 },
    { key: 'won', cnt: (fyWon.count + fyOppLost.count) > 0 ? fyWon.count / (fyWon.count + fyOppLost.count) * 100 : 0 },
  ];

  return (
    <div style={{ position: 'relative', padding: '0' }}>
      <svg width="100%" height="346" viewBox="0 0 680 346" style={{ display: 'block' }}>
        <g transform="translate(260, 25)">
          {/* 漏斗填充 */}
          <polygon
            points={pts.map(p => `${-p.w / 2},${p.x} `).join('') +
              [...pts].reverse().map(p => `${p.w / 2},${p.x} `).join('')}
            fill="rgba(0, 80, 158, 0.12)" stroke="none"
          />

          {/* 轮廓线 - 左 */}
          {stages.slice(0, 3).map((st, idx) => (
            <line key={'l-' + st.key}
              x1={-pts[idx].w / 2} y1={pts[idx].x}
              x2={-pts[idx + 1].w / 2} y2={pts[idx + 1].x}
              stroke={st.color} strokeWidth={2.5} strokeLinecap="round" />
          ))}
          {/* 轮廓线 - 右 */}
          {stages.slice(0, 3).map((st, idx) => (
            <line key={'r-' + st.key}
              x1={pts[idx].w / 2} y1={pts[idx].x}
              x2={pts[idx + 1].w / 2} y2={pts[idx + 1].x}
              stroke={st.color} strokeWidth={2.5} strokeLinecap="round" />
          ))}

          {/* 顶边 / 底边 */}
          <line x1={-pts[0].w / 2} y1={0} x2={pts[0].w / 2} y2={0}
            stroke={COLORS.textLight} strokeWidth={2.5} strokeLinecap="round" />
          <line x1={-pts[3].w / 2} y1={pts[3].x} x2={pts[3].w / 2} y2={pts[3].x}
            stroke={COLORS.danger} strokeWidth={2.5} strokeLinecap="round" />

          {/* 阶段标注 */}
          {stages.map((st, idx) => {
            const halfW = pts[idx].w / 2;
            const y = pts[idx].x;
            const count = countFor(st.key);
            const amount = amountFor(st.key);
            const fyc = fyData[st.key]?.count || 0;
            const fya = fyData[st.key]?.amount || 0;
            const conv = convData.find(c => c.key === st.key);

            return (
              <g key={st.key}>
                {/* 水平分割线（虚线） */}
                {idx > 0 && idx < stages.length - 1 && (
                  <line x1={-halfW} y1={y} x2={halfW} y2={y}
                    stroke={st.color} strokeWidth={1.5} strokeDasharray="5,4" />
                )}
                {/* 引出线 */}
                <line x1={halfW} y1={y} x2={pts[0].w / 2 + 105} y2={y}
                  stroke={st.color} strokeWidth={1.5} strokeDasharray="4,3" />
                <circle cx={pts[0].w / 2 + 105} cy={y} r={3} fill={st.color} />

                {/* 阶段标签 */}
                <text x={pts[0].w / 2 + 105} y={y - 10}
                  fill={st.color} fontSize={13} fontWeight="700"
                  textAnchor="middle">{st.label}</text>
                {/* 当期数据（中标阶段不显示） */}
                {st.key !== 'won' && (
                  <text x={pts[0].w / 2 + 46} y={y + 14}
                    fill={COLORS.textSecondary} fontSize={11}
                    dominantBaseline="middle">{count}/{fmtK(amount)}</text>
                )}
                {/* 财年累计（中标阶段与红点对齐） */}
                <text x={pts[0].w / 2 + (st.key === 'won' ? 80 : 115)} y={y + 14}
                  fill={COLORS.primary} fontSize={11} fontWeight={600}
                  dominantBaseline="middle">{fyc}/{fmtK(fya)}</text>

                {/* 阶段间转化率（漏斗内居中）：财年累计均值转化率（项目数口径） */}
                {conv && (
                  <text x={0} y={y + 14} fontSize={12} textAnchor="middle">
                    <tspan fill={COLORS.primary} fontWeight="600">{conv.cnt.toFixed(1)}%</tspan>
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};

/**
 * 竖状柱状图 ⚠️ B11：已收敛至 components/charts/VerticalBarChart.tsx 单源
 * （SalesAnalysis 与 DeliveryAnalysis 共用），此处不再重复定义。
 */