/** 解析财年字符串（如 FY2526）为起止日期 */
export function parseFY(fy: string) {
  const y1 = 2000 + parseInt(fy.slice(2, 4));
  const y2 = 2000 + parseInt(fy.slice(4, 6));
  return { start: new Date(y1, 6, 1), end: new Date(y2, 6, 0) };
}
