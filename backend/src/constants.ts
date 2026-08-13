// ── 后端全局常量（A22：魔法数字收敛，全后端唯一来源）──

/** 分页上限：列表接口单页硬上限（防一次拉全表撑爆内存/响应） */
export const PAGE_LIMIT = 1000;
/** 分页默认页大小（未传 limit 时的默认值） */
export const DEFAULT_PAGE_SIZE = 100;

/** 文本长度上限（detail/note 等字段） */
export const TEXT_MAX_500 = 500;
export const TEXT_MAX_100 = 100;

/** 密码最小长度（用户管理/工时重置统一口径） */
export const PASSWORD_MIN = 8;

/** 默认税率 13%（报价编制默认值；金额口径未税，含税转换唯一来源） */
export const DEFAULT_TAX_RATE = 0.13;
/** 默认欧元汇率（项目版本默认值） */
export const DEFAULT_EUR_RATE = 8.15;
/** 默认质保金/风险金比例 */
export const DEFAULT_WARRANTY_RATE = 0.01;
export const DEFAULT_RISK_RATE = 0.03;
