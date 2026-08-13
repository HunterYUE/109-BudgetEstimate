// ── 后端全局常量（A22：魔法数字收敛，全后端唯一来源）──

/** 分页上限：列表接口单页硬上限（防一次拉全表撑爆内存/响应）。
 *  2026-08-13 截断重规划：1000→100000——正式部署 20+ 人按 4 条/人/工作日 ≈ 2.1 万条/财年，
 *  1000 会静默截断约 21 倍；工时前端 LIST_LIMIT 亦抬至 100000（前端拉取上限=后端上限，无额外截断） */
export const PAGE_LIMIT = 100000;
/** 分页默认页大小（未传 limit 时的默认值） */
export const DEFAULT_PAGE_SIZE = 100;

/** 密码最小长度（用户管理/工时重置统一口径） */
export const PASSWORD_MIN = 8;

/** 默认税率 13%（报价编制默认值；金额口径未税，含税转换唯一来源） */
export const DEFAULT_TAX_RATE = 0.13;
/** 默认欧元汇率（项目版本默认值） */
export const DEFAULT_EUR_RATE = 8.15;
/** 默认质保金/风险金比例 */
export const DEFAULT_WARRANTY_RATE = 0.01;
export const DEFAULT_RISK_RATE = 0.03;
