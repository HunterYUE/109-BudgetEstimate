/** 解析财年字符串（如 FY2526）为起止日期 */
export function parseFY(fy: string): { start: Date; end: Date } {
  const y1 = 2000 + parseInt(fy.slice(2, 4), 10);
  const y2 = 2000 + parseInt(fy.slice(4, 6), 10);
  // ⚠️ 财年末取 6月30日 23:59:59.999（而非 00:00），否则漏掉最后一天的事件
  return { start: new Date(y1, 6, 1), end: new Date(y2, 6, 0, 23, 59, 59, 999) };
}

/** 某日期所属财年的标签（FY2526 式）：日历月 ≥ 7（month>=6）→ 当年~次年，否则上一年~当年（与 parseFY 的 7月起始财年一致） */
export function fiscalYearLabel(d: Date): string {
  const m = d.getMonth();
  const y1 = m >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  const y2 = m >= 6 ? d.getFullYear() + 1 : d.getFullYear();
  return `FY${String(y1 % 100).padStart(2, '0')}${String(y2 % 100).padStart(2, '0')}`;
}
