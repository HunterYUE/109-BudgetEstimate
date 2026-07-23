import type { ClientGrade } from '../../types';
import { COLORS } from '../../styles/colors';

export const gradeConfig: Record<ClientGrade, { label: string; color: string }> = {
  A: { label: 'A 类', color: COLORS.success },
  B: { label: 'B 类', color: COLORS.amber },
  C: { label: 'C 类', color: COLORS.danger },
};

export const creditConfig: Record<string, { label: string; color: string }> = {
  A: { label: '优', color: COLORS.success },
  B: { label: '良', color: COLORS.amber },
  C: { label: '差', color: COLORS.danger },
};

export const roleColors: Record<string, string> = {
  使用: COLORS.primary, 技术: COLORS.purple, 商务: COLORS.warning, 高层: COLORS.danger,
};

export const INDUSTRIES = [
  '安防/物联网', '半导体', '船舶制造', '电气控制', '电力电气',
  '工程机械', '计算机制造', '建筑幕墙', '家居家具',
  '家电制造', '农业机械', '汽车制造', '设备制造', '数据中心', '新能源电池',
  '新能源汽车', '其他',
];
export const REGIONS = ['东区', '南区', '北区'];
export const SALESPEOPLE = ['张明', '李华', '王芳', '陈伟'];

export const AREA_CODES: Record<string, string> = { 东区: 'EA', 南区: 'SO', 北区: 'NO', 国际: 'IN' };

/** 根据等级、区域、城市和已有客户列表生成编码 */
export function generateClientCode(grade: string, areaCode: string, cityCode: string, existingCodes: string[]): string {
  const prefix = `${grade}-${areaCode}-${cityCode}-`;
  let maxSeq = 0;
  for (const c of existingCodes) {
    if (c.startsWith(prefix)) {
      const seq = parseInt(c.slice(-4), 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  const seq = String(maxSeq + 1).padStart(4, '0');
  return prefix + seq;
}

export function makeId(): string {
  return 'cl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

