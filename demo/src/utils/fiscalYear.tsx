import React from 'react';
// eslint-disable-next-line react-refresh/only-export-components
export { parseFY } from './parseFY';

/** 财年选择器组件：减号 − 当前财年 + 增号 */
export const FYSelector: React.FC<{
  value: string;
  onChange: (v: string) => void;
}> = ({ value, onChange }) => {
  const y1 = parseInt(value.slice(2, 4), 10);
  const y2 = parseInt(value.slice(4, 6), 10);
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 0,
        userSelect: 'none',
      }}
    >
      <span
        onClick={() =>
          onChange(
            `FY${String(y1 - 1).padStart(2, '0')}${String(y1).padStart(2, '0')}`,
          )
        }
        style={{
          cursor: 'pointer', fontSize: 16, fontWeight: 700,
          color: '#00509e', padding: '2px 6px', lineHeight: 1,
        }}
      >
        −
      </span>
      <span
        style={{
          fontSize: 13, color: '#333', fontWeight: 600,
          padding: '0 4px', minWidth: 48, textAlign: 'center',
        }}
      >
        {value}
      </span>
      <span
        onClick={() =>
          onChange(
            `FY${String(y1 + 1).padStart(2, '0')}${String(y2 + 1).padStart(2, '0')}`,
          )
        }
        style={{
          cursor: 'pointer', fontSize: 16, fontWeight: 700,
          color: '#00509e', padding: '2px 6px', lineHeight: 1,
        }}
      >
        +
      </span>
    </span>
  );
};
