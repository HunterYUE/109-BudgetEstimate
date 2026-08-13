import React from 'react';
import { Card } from 'antd';
import { COLORS } from '../../styles/colors';
import { withAlpha } from '../../utils/color';
import useMediaQuery from '../../utils/useMediaQuery';

export interface KpiCardItem {
  label: string;
  value: string;
  color: string;
  icon: React.ReactNode;
  /** 上月/前月对比行（Sales/Delivery 分析传，Dashboard 不传） */
  prevValues?: { value: string; color: string }[];
  /** 卡片可点击跳转（对齐工时应用仪表盘可点卡） */
  onClick?: () => void;
}

/**
 * KPI 概览卡片行（Dashboard / SalesAnalysis / DeliveryAnalysis 共享）。
 * 样式对齐工时应用仪表盘 KpiCards：左侧 38×38 彩色图标块（淡色底）+ 右侧深色大数值在上 + 浅灰小标签在下，
 * 卡片圆角 10 / 边框 #e8edf4 / 轻阴影；桌面端（≥1280）单行等分填满行宽，窄屏回退 wrap + 160px 基准换行。
 * prevValues 为本项目「上月/前月」对比扩展（参考应用无此特性）。
 * 本组件不做 memo（三个调用方均内联构建 items，memo 命中无意义）；卡片 hoverable 渲染。
 */
export const OverviewCards: React.FC<{
  items: KpiCardItem[];
  style?: React.CSSProperties;
}> = ({ items, style }) => {
  // 桌面判定（视口 ≥1280）：内容区 ≈ 视口−60 侧栏−48 padding。窄屏 wrap 自动换行成多行
  const isNarrow = useMediaQuery('(max-width: 1279px)');
  return (
    <div style={{
      display: 'flex',
      flexWrap: isNarrow ? 'wrap' : 'nowrap',
      gap: 16, marginBottom: 20, ...style,
    }}>
      {items.map((item, i) => (
        <Card key={item.label || i} size="small"
          hoverable
          onClick={item.onClick}
          style={{
            flex: isNarrow ? '1 1 160px' : '1 1 0', borderRadius: 10, border: `1px solid ${COLORS.borderCard}`,
            boxShadow: '0 2px 8px rgba(13,27,42,0.05)',
            cursor: item.onClick ? 'pointer' : 'default',
            minWidth: 0,
            transition: 'box-shadow 0.2s, transform 0.15s',
          }}
          styles={{ body: { padding: '14px 14px', textAlign: 'left' as const } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: withAlpha(item.color, 0.12), color: item.color,
            }}>{item.icon}</div>
            <div style={{ minWidth: 0 }}>
              {/* 数值过长（如千位分隔）时省略号截断，不把卡片撑破 */}
              <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.textDark, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.value}
              </div>
              <div style={{ fontSize: 9, color: COLORS.textLight, marginTop: 3, letterSpacing: 0.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.label}
              </div>
              {item.prevValues && item.prevValues.length === 2 && (
                <div style={{ fontSize: 9, fontWeight: 600, lineHeight: 1.2, marginTop: 3, opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span style={{ color: item.prevValues[0].color }}>{item.prevValues[0].value}</span>
                  <span style={{ color: COLORS.textLight, margin: '0 3px' }}>|</span>
                  <span style={{ color: item.prevValues[1].color }}>{item.prevValues[1].value}</span>
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};
