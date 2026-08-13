import type { ItemType, SourcingType } from '../../types';
import { COLORS } from '../../styles/colors';

// ── 常量 ──

export const CATEGORY_OPTIONS: Record<ItemType, { label: string; color: string }> = {
  COMPLETE_SET:     { label: '成套', color: COLORS.primary },
  COMPONENT:        { label: '组件', color: '#008080' },
  PART:             { label: '零件', color: '#6d4c41' },
  SOFTWARE:         { label: '软件', color: COLORS.purple },
  SERVICE:          { label: '服务', color: COLORS.success },
};

export const CATEGORIES: ItemType[] = ['COMPLETE_SET', 'COMPONENT', 'PART', 'SOFTWARE', 'SERVICE'];
export const CATEGORY_LABELS = CATEGORIES.map(c => CATEGORY_OPTIONS[c].label);

export const UNITS = ['套', '台', '个', '米', '根', '条', '包', '箱', '组', 'KG', 'L', '套件', '节点', '人天', '项', '只', '块', '元/小时', '元/套', '元/台', '元/米', '元/个', '元/KG', '元/项'];

export const TYPE_ABBREV: Record<ItemType, string> = {
  COMPLETE_SET: 'EQ',
  COMPONENT: 'CP',
  PART: 'CP',
  SOFTWARE: 'SW',
  SERVICE: 'SV',
};

export const SOURCES: { value: SourcingType; label: string }[] = [
  { value: 'SELF_MANUFACTURED', label: '自制' },
  { value: 'PURCHASED', label: '外购' },
];

/** 审核状态统一配置（⚠️ B12：物料/报价/交付/审批 6 处 label+color 收敛单源；bg 供报价页状态徽章使用） */
export const STATUS_CONFIG: Record<string, { label: string; color: string; bg?: string }> = {
  draft:    { label: '草稿',   color: COLORS.textSecondary, bg: COLORS.bgTag },
  pending:  { label: '待审批', color: COLORS.warning,        bg: '#fff3e0' },
  approved: { label: '已通过', color: COLORS.success,        bg: '#e8f5e9' },
  rejected: { label: '已驳回', color: COLORS.danger,         bg: '#ffebee' },
};


// ── 编码规则 ──
// 格式：{类型缩写2位}-{用途6位}-{规格6位}-V{版本}
const ABBREV_TO_CATEGORY: Record<string, ItemType> = {
  EQ: 'COMPLETE_SET',
  CP: 'COMPONENT',
  SW: 'SOFTWARE',
  SV: 'SERVICE',
};

/** 校验编码格式：{类型缩写2位}-{用途6位}-{规格6位}-V{版本} */
export function validateCodeFormat(code: string): { valid: boolean; error?: string } {
  if (!code) return { valid: false, error: '请输入物料编码' };
  const m = code.match(/^([A-Z]{2})-([A-Z0-9]{6})-([A-Z0-9]{6})-V(\d+\.\d+)$/);
  if (!m) return { valid: false, error: '编码格式错误，正确格式：{类型缩写2位}-{用途6位}-{规格6位}-V{版本}' };
  const [, abbrev] = m;
  if (!ABBREV_TO_CATEGORY[abbrev]) return { valid: false, error: `未知的类型缩写"${abbrev}"，应为 EQ/CP/SW/SV` };
  return { valid: true };
}
