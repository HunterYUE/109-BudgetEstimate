/* ============================================================
   统一原因分类体系
   状态变更时选择原因，分析页面解析展示
   ============================================================ */

/** 原因项：可包含子项（价格→主机价格高/解决方案价格高）*/
export interface ReasonItem {
  label: string;
  items?: ReasonItem[];
}

/** 一个原因大类下的分组 */
export interface ReasonGroup {
  groupLabel: string;
  items: ReasonItem[];
}

/** 某一状态的原因配置 */
export interface StatusReasons {
  label: string;
  groups: ReasonGroup[];
}

/** 所有状态的原因分类 */
export const REASON_TAXONOMY: Record<string, StatusReasons> = {
  win: {
    label: '赢',
    groups: [
      {
        groupLabel: '竞对',
        items: [
          { label: '价格', items: [{ label: '主机成本' }, { label: '解决方案' }] },
          { label: '技术方案', items: [{ label: '痛点发掘' }, { label: '主机性能' }] },
          { label: '客户关系', items: [{ label: '客户关系' }] },
          { label: '品牌', items: [{ label: '品牌' }] },
          { label: '交货期', items: [{ label: '交货期' }] },
        ],
      },
    ],
  },
  loss: {
    label: '输',
    groups: [
      {
        groupLabel: '竞对',
        items: [
          { label: '价格', items: [{ label: '主机价格' }, { label: '解决方案' }] },
          { label: '技术方案', items: [{ label: '痛点发掘' }, { label: '主机性能' }] },
          { label: '客户关系', items: [{ label: '客户关系' }] },
          { label: '品牌', items: [{ label: '品牌' }] },
          { label: '交货期', items: [{ label: '交货期' }] },
        ],
      },
      {
        groupLabel: '取消',
        items: [
          { label: '预算缩减' },
          { label: '投资延后' },
          { label: '需求变更' },
          { label: '市场变化' },
        ],
      },
      {
        groupLabel: '放弃',
        items: [
          { label: '利润过低' },
          { label: '风险过高' },
          { label: '技术性能' },
          { label: '交付产能' },
          { label: '介入太晚' },
          { label: '客户关系' },
        ],
      },
    ],
  },
  freeze: {
    label: '冻结',
    groups: [
      {
        groupLabel: '冻结',
        items: [
          { label: '预算缩减' },
          { label: '投资延后' },
          { label: '需求变更' },
          { label: '市场变化' },
        ],
      },
    ],
  },
};

/** 存储格式：大类:子类:具体原因;大类:子类
    例  win → "竞对(正面):价格:主机成本低,解决方案成本低;竞对(正面):客户关系好"
        输(竞对) → "竞对(负面):价格:主机价格高;竞对(负面):客户关系差"
        输(取消) → "取消:预算缩减,需求变更"
        输(放弃) → "放弃:利润率过低"
        冻结 → "冻结:预算缩减"
*/
export function formatReasons(groupLabel: string, selections: { subLabel: string; detailItems: string[] }[]): string {
  return selections
    .map(sel => {
      const detail = sel.detailItems.length > 0 ? ':' + sel.detailItems.join(',') : '';
      return groupLabel + ':' + sel.subLabel + detail;
    })
    .join(';');
}

/** 解析存储的原因字符串 */
export interface ParsedReason {
  groupLabel: string;
  subLabel: string;
  detailItems: string[];
}

export function parseReasons(raw: string): ParsedReason[] {
  if (!raw) return [];
  return raw.split(';').filter(Boolean).map(part => {
    const segs = part.split(':');
    const groupLabel = segs[0] || '';
    const subLabel = segs[1] || '';
    const detailItems = segs.length > 2 ? segs[2].split(',').filter(Boolean) : [];
    return { groupLabel, subLabel, detailItems };
  });
}
