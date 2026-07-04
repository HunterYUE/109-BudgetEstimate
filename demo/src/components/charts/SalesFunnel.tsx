import React from 'react';
import { COLORS } from '../../styles/constants';

const fmtK = (v: number) => Math.round(v / 1000).toLocaleString() + 'K';


interface FunnelStage {
  stage: string; count: number; amount: number; color: string;
}

interface Props {
  funnelData: FunnelStage[];
  fyInfo: { count: number; amount: number };
  fyLead: { count: number; amount: number };
  fyOpp: { count: number; amount: number };
  fyWon: { count: number; amount: number };
}

const SalesFunnel: React.FC<Props> = ({ funnelData, fyInfo, fyLead, fyOpp, fyWon }) => {
  const stages = [
    { key: 'info', label: '信息', color: '#999' },
    { key: 'lead', label: '线索', color: COLORS.primary },
    { key: 'opp', label: '机会', color: '#5a2d82' },
    { key: 'won', label: '中标', color: COLORS.success },
  ] as const;

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

  const oppAgg = funnelData.filter(f => ['机会', '投标', '议价'].includes(f.stage));

  const countFor = (key: string) => {
    if (key === 'opp') return oppAgg.reduce((s, f) => s + f.count, 0);
    const f = funnelData.find(f => f.stage === ({ info: '信息', lead: '线索', won: '中标' } as Record<string, string>)[key]);
    return f?.count || 0;
  };
  const amountFor = (key: string) => {
    if (key === 'opp') return oppAgg.reduce((s, f) => s + f.amount, 0);
    const f = funnelData.find(f => f.stage === ({ info: '信息', lead: '线索', won: '中标' } as Record<string, string>)[key]);
    return f?.amount || 0;
  };

  const fyData: Record<string, { count: number; amount: number }> = {
    info: fyInfo, lead: fyLead, opp: fyOpp, won: fyWon,
  };

  const convData = [
    { key: 'lead', cnt: fyInfo.count > 0 ? fyLead.count / fyInfo.count * 100 : 0, amt: fyInfo.amount > 0 ? fyLead.amount / fyInfo.amount * 100 : 0 },
    { key: 'opp', cnt: fyLead.count > 0 ? fyOpp.count / fyLead.count * 100 : 0, amt: fyLead.amount > 0 ? fyOpp.amount / fyLead.amount * 100 : 0 },
    { key: 'won', cnt: fyOpp.count > 0 ? fyWon.count / fyOpp.count * 100 : 0, amt: fyOpp.amount > 0 ? fyWon.amount / fyOpp.amount * 100 : 0 },
  ];

  return (
    <div style={{ position: 'relative', padding: '12px 0' }}>
      <svg width="100%" height="360" viewBox="0 0 620 360" style={{ display: 'block' }} preserveAspectRatio="xMidYMid meet">
        <g transform="translate(250, 40)">
          <polygon
            points={pts.map(p => `${-p.w / 2},${p.x} `).join('') +
              [...pts].reverse().map(p => `${p.w / 2},${p.x} `).join('')}
            fill="rgba(0, 80, 158, 0.12)" stroke="none"
          />
          {stages.slice(0, 3).map((st, idx) => (
            <line key={'l-' + st.key}
              x1={-pts[idx].w / 2} y1={pts[idx].x}
              x2={-pts[idx + 1].w / 2} y2={pts[idx + 1].x}
              stroke={st.color} strokeWidth={2.5} strokeLinecap="round" />
          ))}
          {stages.slice(0, 3).map((st, idx) => (
            <line key={'r-' + st.key}
              x1={pts[idx].w / 2} y1={pts[idx].x}
              x2={pts[idx + 1].w / 2} y2={pts[idx + 1].x}
              stroke={st.color} strokeWidth={2.5} strokeLinecap="round" />
          ))}
          <line x1={-pts[0].w / 2} y1={0} x2={pts[0].w / 2} y2={0}
            stroke="#999" strokeWidth={2.5} strokeLinecap="round" />
          <line x1={-pts[3].w / 2} y1={pts[3].x} x2={pts[3].w / 2} y2={pts[3].x}
            stroke="COLORS.success" strokeWidth={2.5} strokeLinecap="round" />

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
                {idx > 0 && idx < stages.length - 1 && (
                  <line x1={-halfW} y1={y} x2={halfW} y2={y}
                    stroke={st.color} strokeWidth={1.5} strokeDasharray="5,4" />
                )}
                <line x1={halfW} y1={y} x2={pts[0].w / 2 + 65} y2={y}
                  stroke={st.color} strokeWidth={1.5} strokeDasharray="4,3" />
                <circle cx={pts[0].w / 2 + 65} cy={y} r={3} fill={st.color} />
                <text x={pts[0].w / 2 + 65} y={y - 10}
                  fill={st.color} fontSize={13} fontWeight="700"
                  textAnchor="middle">{st.label}</text>
                <text x={pts[0].w / 2 + 65} y={y + 14}
                  fill="#666" fontSize={11} textAnchor="middle">{count}/{fmtK(amount)}</text>
                <text x={pts[0].w / 2 + 65} y={y + 28}
                  fill="COLORS.primary" fontSize={11} fontWeight={600} textAnchor="middle">{fyc}/{fmtK(fya)}</text>
                {conv && (
                  <text x={0} y={y + 14} fontSize={12} textAnchor="middle">
                    <tspan fill="COLORS.primary" fontWeight="600">{conv.cnt.toFixed(1)}%</tspan>
                    <tspan fill="#999"> / </tspan>
                    <tspan fill="COLORS.success" fontWeight="600">{conv.amt.toFixed(1)}%</tspan>
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

export default SalesFunnel;
