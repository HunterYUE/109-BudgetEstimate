/** 解析财年字符串（如 FY2526）为起止日期 */
export function parseFY(fy: string): { start: Date; end: Date } {
  const y1 = 2000 + parseInt(fy.slice(2, 4), 10);
  const y2 = 2000 + parseInt(fy.slice(4, 6), 10);
  // ⚠️ 财年末取 6月30日 23:59:59.999（而非 00:00），否则漏掉最后一天的事件
  return { start: new Date(y1, 6, 1), end: new Date(y2, 6, 0, 23, 59, 59, 999) };
}
