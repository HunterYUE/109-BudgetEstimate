import React from 'react';
import { Card } from 'antd';
import { COLORS } from '../../styles/colors';

export interface KpiCardItem {
  label: string;
  value: string;
  color: string;
  icon: React.ReactNode;
  prevValues?: { value: string; color: string }[];
}

/**
 * KPI 概览卡片行（SalesAnalysis / DeliveryAnalysis / Dashboard 共享）。
 * 默认视觉取 Sales/Delivery；Dashboard 传 iconSize=26 + flexWrap + marginBottom=10 保持原样。
 */
export const OverviewCards: React.FC<{
  items: KpiCardItem[];
  valueFontSize?: number;
  iconSize?: number;
  gap?: number;
  marginBottom?: number;
  flexWrap?: boolean;
}> = ({ items, valueFontSize = 22, iconSize = 20, gap = 16, marginBottom = 24, flexWrap = false }) => (
  <div style={{ display: 'flex', gap, marginBottom, flexWrap: flexWrap ? 'wrap' : undefined }}>
    {items.map((item, i) => (
      <Card key={item.label || i} size="small"
        style={{
          flex: 1, borderRadius: 8, border: `1px solid ${COLORS.borderLight}`,
          transition: 'box-shadow 0.2s, transform 0.15s',
        }}
        styles={{ body: { padding: '16px 12px', textAlign: 'center' as const } }}
        hoverable
      >
        <div style={{ fontSize: iconSize, marginBottom: 2, lineHeight: 1, color: item.color }}>{item.icon}</div>
        <div style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 4, letterSpacing: 0.3 }}>
          {item.label}
        </div>
        <div style={{ fontSize: valueFontSize, fontWeight: 700, color: item.color, lineHeight: 1.2 }}>
          {item.value}
        </div>
        {item.prevValues && item.prevValues.length === 2 && (
          <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.3, marginTop: 3, opacity: 0.7 }}>
            <span style={{ color: item.prevValues[0].color }}>{item.prevValues[0].value}</span>
            <span style={{ color: COLORS.textLight, margin: '0 4px' }}>|</span>
            <span style={{ color: item.prevValues[1].color }}>{item.prevValues[1].value}</span>
          </div>
        )}
      </Card>
    ))}
  </div>
);
