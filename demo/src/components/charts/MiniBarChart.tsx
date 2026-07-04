import React from 'react';
import type { BarItem } from './VerticalBarChart';
import { COLORS } from '../../styles/constants';

const TOP_COLORS = [COLORS.primary, '#5a2d82', COLORS.primary, '#5a2d82'];

interface Props {
  title: string;
  data: BarItem[];
  height?: number;
}

const MiniBarChart: React.FC<Props> = ({ title, data }) => {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 6 }}>{title}</div>
      {sorted.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: '#ccc', fontSize: 12 }}>暂无数据</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sorted.map((item, i) => {
            const color = i < 4 ? TOP_COLORS[i] : '#ccc';
            return (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span style={{ width: 60, textAlign: 'right', color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                <div style={{ flex: 1, height: 14, border: `2px solid ${color}`, position: 'relative' }} />
                <span style={{ width: 20, textAlign: 'right', color: '#888' }}>{item.value}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MiniBarChart;
