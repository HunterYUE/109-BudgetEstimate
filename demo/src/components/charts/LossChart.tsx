import React from 'react';
import { COLORS } from '../../styles/constants';

const SUB_PATTERNS = [
  { color: COLORS.primary, dashed: false },
  { color: COLORS.chartGray, dashed: false },
  { color: COLORS.primary, dashed: false },
  { color: COLORS.chartGray, dashed: false },
  { color: COLORS.primary, dashed: false },
  { color: COLORS.chartGray, dashed: false },
];

interface LossSubItem {
  subCategory: string;
  thirdLevel: string;
  count: number;
  color: string;
}

interface LossCategoryStack {
  category: string;
  count: number;
  percent: number;
  color: string;
  subItems: LossSubItem[];
}

interface Props {
  data: LossCategoryStack[];
}

const LossChart: React.FC<Props> = ({ data }) => {
  const total = data.reduce((s, d) => s + d.count, 0);
  const maxCount = Math.max(...data.map(d => d.count), 1);
  if (total === 0) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#bbb', fontSize: 13 }}>暂无输单数据</div>;
  }

  const bars = data.filter(cat => cat.count > 0).map(cat => {
    const active = cat.subItems.filter(s => s.count > 0);
    const barW = (cat.count / maxCount) * 100;
    return (
          <div key={cat.category}
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
            <div style={{ width: 64, flexShrink: 0, textAlign: 'right', fontSize: 10, color: COLORS.textSecondary }}>
              <div style={{ fontSize: 10, color: COLORS.textSecondary, lineHeight: 1.4 }}>{cat.category.replace(/\(.*\)/g, '')}</div>
            </div>
            <div style={{ flex: 1, position: 'relative', height: 30 }}>
              {/* 左侧基线 */}
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 1, background: '#ddd', zIndex: 1 }} />
              {/* 数据分段 */}
              <div style={{
                width: `${barW}%`, height: '100%', display: 'flex', position: 'absolute',
                left: 0, top: 0, zIndex: 2,
              }}>
                {active.map((sub, segIdx) => {
                  const p = SUB_PATTERNS[segIdx % SUB_PATTERNS.length];
                  const segW = (sub.count / cat.count) * 100;
                  const isLast = segIdx === active.length - 1;
                  return (
                    <div key={sub.subCategory + sub.thirdLevel}
                      style={{
                        width: `${segW}%`,
                        borderTop: `2px ${p.dashed ? 'dashed' : 'solid'} ${p.color}`,
                        borderBottom: `2px ${p.dashed ? 'dashed' : 'solid'} ${p.color}`,
                        borderRight: isLast ? `2px ${p.dashed ? 'dashed' : 'solid'} ${p.color}` : '1px solid #c0c8d4',
                        borderLeft: segIdx === 0 ? `2px ${p.dashed ? 'dashed' : 'solid'} ${p.color}` : 'none',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, color: p.color, fontWeight: 500,
                        padding: '0 2px', boxSizing: 'border-box',
                        overflow: 'hidden',
                      }}
                    >
                      <span style={{ lineHeight: 1.3, whiteSpace: 'nowrap' }}>
                        {sub.subCategory}
                        <span style={{ fontSize: 8 }}> ({sub.count})</span>
                      </span>
                      {sub.thirdLevel && <span style={{ lineHeight: 1.3, fontSize: 9, opacity: 0.65 }}>{sub.thirdLevel}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      });
  return (
    <div>
      {bars}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 9, color: '#aaa' }}>
        <div style={{ width: 64, flexShrink: 0 }} />
        <div style={{ flex: 1, position: 'relative', height: 14 }}>
          {Array.from({ length: maxCount + 1 }, (_, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: `${(i / maxCount) * 100}%`,
              transform: 'translateX(-50%)',
            }}>
              {i}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LossChart;
