// ===== 组件来源类型 =====
export type SourcingType = 'PURCHASED' | 'SELF_MANUFACTURED';

// ===== 组件类型 =====
export type ItemType = 'COMPLETE_SET' | 'COMPONENT' | 'PART' | 'SOFTWARE' | 'SERVICE';

// ===== 组类型（固定组顺序：集成控制→包装运输→项目交付→其他）=====
export type GroupType = 'EQUIPMENT' | 'INTEGRATION' | 'PACKAGING_TRANSPORT' | 'PROJECT_DELIVERY' | 'IMPLEMENTATION_EXPENSE' | 'OTHER';

// ===== 组件目录中的组件 =====
export interface Component {
  id: string;
  code: string;
  nameCn: string;
  category: ItemType;
  brand: string;
  model: string;
  specification: string;
  note: string;                 // 备注说明
  supplier: string;              // 供应商（贸易商/代理商/厂商）
  sourcingType: SourcingType;
  unitCost: number;
  designHours: number;
  assemblyHours: number;
  hasWarranty: boolean;
  unit: string;                 // 计量单位（套/台/个/米…）
  reviewStatus: ReviewStatus;    // 物料审核状态
  version: string;               // 编码中的版本号，如 V1.0
  createdAt: string;
  updatedAt: string;
  changeLog: { version: string; date: string; note: string }[];
  tags?: string[];               // 标签路径数组，如 ["上下料系统","桁架上下料","桁架机械手"]
}

// ===== 组内明细项 =====
export interface GroupItem {
  id: string;
  itemNo: number;
  itemType: ItemType;
  componentId: string;
  code: string;                    // 编码（原name）
  description: string;             // 描述（原spec）
  qtyTotal: number;
  unit: string;
  sourcingType: SourcingType;    // 自制=true, 外购=false
  unitCost: number;
  designHours: number;
  assemblyHours: number;
  designHourRate: number;
  assemblyHourRate: number;
  directCost: number;
  marginRate: number;            // 毛利率
  basicPrice: number;
  accountingPrice: number;        // 预期售价
  hasWarranty: boolean;
  note: string;
}

// ===== 组 =====
export interface Group {
  id: string;
  groupNo: number;
  groupType: GroupType;
  name: string;
  isFixed: boolean;
  items: GroupItem[];
}

// ===== 项目版本 =====
export type ReviewStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface ProjectVersion {
  id: string;
  /** 所属项目 ID（某些场景下后端填充） */
  projectId?: string;
  versionNo: string;
  eurRate: number;
  taxRate: number;
  roundingDigits: number;
  warrantyRate: number;
  riskRate: number;
  commercialCost: number;
  totalDirectCost: number;
  totalAccountingPrice: number;
  discountedPrice: number;
  discountRate: number;
  gp3ProfitRate: number;
  gp3Amount: number;
  reviewStatus: ReviewStatus;
}

// ===== 项目 =====
export interface Project {
  id: string;
  salesNo: string;
  clientName: string;
  clientCode: string;
  projectScope: string;
  projectName: string;
  versionNo: string;
  projectStage: string;
  expectedAwardDate: string;
  projectLayout: string;       // 布置图（三维布局截图 PDF/PNG，base64 或文件名）
  deliveryPeriod: string;
  paymentTerms: string;
  postfix: string;
  note: string;
  currentVersion: ProjectVersion;
  groups: Group[];
}

// ===== 销售机会 =====
export interface SalesOpportunity {
  id: string;
  salesNo: string;
  clientName: string;
  projectName: string;
  amount: number;
  stage: string;                // 信息/线索/机会/投标/议价/中标
  winRate: number;              // 0-100
  status: string;               // 过程中/赢/输/冻结
  salesman: string;
  competitor: string;
  /** 输单时填写的赢家（谁赢得了订单），与 competitor（竞争对手列表）是不同字段 */
  winner?: string;
  expectedCloseDate: string;
  notes: string;
  reasons: string;              // 状态变更原因，格式：大类:子类:具体项;大类:子类
  createdAt: string;
  updatedAt: string;
  /** 首次标记为'赢'的时间（后续编辑不覆盖） */
  wonAt?: string;
  quotationId?: string;
  /** 是否存在报价（后端返回） */
  hasQuote?: boolean;
  /** 引用报价编制表中的折后金额（后端返回，最新报价的 amount） */
  quotationAmount?: number;
  /** 报价对应的税率（后端返回，用于含税→未税转换） */
  taxRate?: number;
  terminated?: boolean;
  promoteLocked?: boolean;
  blueTable?: BlueTable;       // 销售蓝表数据（可选）
}

// ===== 报价列表摘要 =====
export interface QuotationSummary {
  id: string;
  salesNo: string;
  clientName: string;
  projectName: string;
  versionNo: string;
  status: ReviewStatus;
  amount: number;
  totalCost: number;
  profitRate: number;
  updatedAt: string;
  createdAt?: string;
  projectId?: string;
  opportunityId?: string;
  locked?: boolean;
}

// ===== 审批请求 =====
/** @deprecated 不再使用，保留兼容 */
export interface ReviewRecord {
  id: string;
  reviewer: string;
  action: 'approved' | 'rejected';
  comment: string;
  createdAt: string;
}

/** 审批记录（planApproval / costApproval 共用） */
export interface ApprovalInfo {
  reviewer: string;
  action: 'approved' | 'rejected';
  comment: string;
  createdAt: string;
}

export interface ApprovalRequest {
  id: string;
  approvalType: 'quotation' | 'plan' | 'cost' | 'promote';
  quotationId: string;
  /** 线索转机会审批时关联的机会 ID */
  opportunityId?: string;
  /** 交付审批时关联的交付项目 ID */
  deliveryId?: string;
  salesNo: string;
  clientName: string;
  projectName: string;
  versionNo: string;
  amount: number;
  totalCost: number;
  profitRate: number;
  /** 报价审批时为 GP3；交付审批时为交付项目相关状态的占位 */
  gp3: number;
  taxRate: number;
  totalAccountingPrice: number;
  discountedPrice?: number;
  /** 报价编制表中的折扣率（直接读取，不计算） */
  discountRate?: number;
  /** 项目利润金额（直接读取，不计算） */
  gp3Amount?: number;
  submitter: string;
  submitTime: string;
  status: ReviewStatus;
  /** 最新审批记录（后端列表查询返回） */
  latestRecord?: ReviewRecord;
  /** @deprecated 不再使用，保留向后兼容 */
  records?: ReviewRecord[];
}

// ===== 交付管理 =====
/** 节点变更历史条目 */
export interface NodeChangeEntry {
  id: string;
  field: 'status' | 'plannedDate';
  oldValue: string;
  newValue: string;
  changedAt: string;
  /** 修改人显示名（仅 plannedDate 类型） */
  modifier?: string;
  /** 修改完整时间戳（仅 plannedDate 类型） */
  changedAtFull?: string;
}

export interface DeliveryNode {
  /** 节点 ID（新建时由后端分配，可选） */
  id?: string;
  nodeNo: number;
  name: string;
  plannedStartDate: string;
  plannedEndDate: string;
  actualDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  baselineEndDate?: string;
  /** 旧数据中可能存在此字段 */
  baselinePlannedEndDate?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'delayed';
  comments: string;
  history: NodeChangeEntry[];
}

export interface DeliveryProject {
  id: string;
  opportunityId: string;
  salesNo: string;
  clientName: string;
  projectName: string;
  contractAmount: number;
  quotationId: string;          // 关联报价ID，用于加载成本对比数据
  status: '进行中' | '已完成' | '已延期';
  nodes: DeliveryNode[];
  // 实施计划审批
  planStatus: 'draft' | 'pending' | 'approved' | 'rejected';
  planApproval?: ApprovalInfo;
  // 成本对比审批
  costStatus: 'draft' | 'pending' | 'approved' | 'rejected';
  costApproval?: ApprovalInfo;
  /** 成本审批通过后的实际总成本，由成本对比表审批时写入 */
  totalActualCost?: number;
  /** 逐项实际成本 JSON: { itemId: number } */
  actualCosts?: Record<string, number>;
  createdAt: string;
  updatedAt: string;
  terminated?: boolean;
  promoteLocked?: boolean;
}


// ===== 客户管理 =====
export type CreditLevel = 'A' | 'B' | 'C';
export type ClientGrade = 'A' | 'B' | 'C';

export interface Contact {
  id: string;
  name: string;
  position: string;
  phone: string;
  email: string;
  decisionRole: '使用' | '技术' | '商务' | '高层';
  superior: string;
}

export interface ClientHistoryRecord {
  id: string;
  projectName: string;
  versionNo: string;
  salesNo: string;
  amount: number;
  status: '赢' | '输' | '冻结';
  date: string;
}

export type AccountType = 'enterprise' | 'subsidiary';

// ===== 销售蓝表 =====
export type VetoBudgetOption = 'ok' | 'possible' | 'failed';
export type TimelineOption = 'optimistic' | 'neutral' | 'negative';
export type InfluenceLevel = 'high' | 'medium' | 'low';
export type RoleType = 'EB' | 'UB' | 'TB' | 'COACH';
export type PricingLevel = 'very_strong' | 'strong' | 'competitive' | 'neutral' | 'slightly_weak' | 'weak' | 'very_weak';
export type ReactionMode = 'G' | 'T' | 'EK' | 'OC';

export interface BlueTableRole {
  id: string;
  roleType: RoleType;
  name?: string;               // 联系人姓名
  influence: InfluenceLevel;   // 影响力
  /** 影响力权重值，默认 高=5 中=3 低=1，可微调 */
  influenceWeight: number;
  support: number;             // 支持度 -5~+5
  demandFit: number;           // 需求匹配度 1~5
  relationship: number;        // 客户关系 1~5
}

export interface BlueTable {
  vetoBudget: VetoBudgetOption;
  /** 项目预算金额 */
  budgetAmount?: number;
  /** 客户节点计划描述（时间窗口、关键里程碑等） */
  timelinePlan: string;
  timelineOption: TimelineOption;
  roles: BlueTableRole[];
  pricing: PricingLevel;
  positioning: number;         // 项目定位 1~10
  reactionMode: ReactionMode;
  strategy: string;            // 下一步行动
  targets: { roleId: string; targetSupport: number; plan?: string }[];
  updatedAt: string;
}

export interface Client {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentId?: string;
  industry: string;
  region: string;
  salesman: string;
  creditLevel: CreditLevel;
  grade: ClientGrade;
  contacts: Contact[];
  history: ClientHistoryRecord[];
  createdAt: string;
}

// ===== 标签系统 =====
export interface TagNode {
  id: string;
  name: string;
  description?: string;
  children?: TagNode[];
}
