import React, { useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { parseMoneyInput } from '../utils/tableUtils';
import { formatMoney } from '../utils/calculations';

/** 金额点击编辑组件：¥ 前缀 + 数字过滤 + 格式化 + 失焦/Enter 提交 + Escape 回退。
 *  原为 ItemCostTable ActualCostInput 单文件实现，提取共享供多处复用。 */
export const MoneyInput: React.FC<{
  value: number;
  onCommit: (v: number) => void;
  fontSize?: number;
  align?: 'left' | 'right';
  style?: CSSProperties;
}> = ({ value, onCommit, fontSize = 13, align = 'right', style }) => {
  const [text, setText] = useState(() => value ? '¥' + formatMoney(value) : '');
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const committed = useRef(value);

  // 外部值变化时同步显示（未编辑状态）
  useEffect(() => {
    if (!editing && committed.current !== value) {
      committed.current = value;
      setText(value ? '¥' + formatMoney(value) : '');
    }
  }, [value, editing]);

  const commit = () => {
    const num = parseMoneyInput(text);
    committed.current = num;
    setText(num ? '¥' + num.toLocaleString() : '');
    // ⚠️ 最终审计修正：值未变化不回调 onCommit（此前失焦/Enter 无条件回调，
    //   金额未改也触发父级 setState + 标记 dirty，造成多余渲染与「未改也显示未保存」的假象）；
    //   取整比较——显示即 Math.round(value)，浮点存储（如 1234.6 内部误差）不得误判为变更
    if (Math.round(num) !== Math.round(value)) onCommit(num);
    setEditing(false);
  };

  if (!editing) {
    return (
      <span onClick={() => { setEditing(true); setText(text.replace(/[^0-9]/g, '')); setTimeout(() => inputRef.current?.focus(), 0); }}
        style={{ cursor: 'text', fontWeight: 600, fontSize, color: '#000', display: 'block', textAlign: align, padding: '2px 4px', minHeight: 28, lineHeight: '24px', ...style }}>
        {text || '¥0'}
      </span>
    );
  }

  return (
    <input ref={inputRef} value={text} onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setText(committed.current ? '¥' + formatMoney(committed.current) : ''); } }}
      style={{ width: '100%', height: 28, border: 'none', padding: '2px 4px', textAlign: align, fontSize, fontWeight: 600, outline: 'none', boxSizing: 'border-box', background: 'transparent', MozAppearance: 'textfield', ...style }} />
  );
};

export default MoneyInput;
