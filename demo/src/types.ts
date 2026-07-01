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
  name_cn: string;
  category: ItemType;
  brand: string;
  model: string;
  specification: string;
  note: string;                 // 备注说明
  supplier: string;              // 供应商（贸易商/代理商/厂商）
  sourcing_type: SourcingType;
  unit_cost: number;
  design_hours: number;
  assembly_hours: number;
  has_warranty: boolean;
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
  item_no: number;
  item_type: ItemType;
  component_id: string;
  code: string;                    // 编码（原name）
  description: string;             // 描述（原spec）
  qty_total: number;
  unit: string;
  sourcing_type: SourcingType;    // 自制=true, 外购=false
  unit_cost: number;
  design_hours: number;
  assembly_hours: number;
  design_hour_rate: number;
  assembly_hour_rate: number;
  direct_cost: number;
  margin_rate: number;            // 毛利率
  basic_price: number;
  accounting_price: number;        // 预期售价
  has_warranty: boolean;
  note: string;
}

// ===== 组 =====
export interface Group {
  id: string;
  group_no: number;
  group_type: GroupType;
  name: string;
  is_fixed: boolean;
  items: GroupItem[];
}

// ===== 项目版本 =====
export type ReviewStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface ProjectVersion {
  id: string;
  version_no: string;
  eur_rate: number;
  tax_rate: number;
  rounding_digits: number;
  warranty_rate: number;
  risk_rate: number;
  commercial_cost: number;
  total_direct_cost: number;
  total_accounting_price: number;
  discounted_price: number;
  discount_rate: number;
  rp1_profit_rate: number;
  gp3_profit_rate: number;
  review_status: ReviewStatus;
}

// ===== 项目 =====
export interface Project {
  id: string;
  sales_no: string;
  client_name: string;
  client_code: string;
  project_scope: string;
  project_stage: string;
  expected_award_date: string;
  project_layout: string;       // 布置图（三维布局截图 PDF/PNG，base64 或文件名）
  delivery_period: string;
  payment_terms: string;
  postfix: string;
  note: string;
  current_version: ProjectVersion;
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
  expectedCloseDate: string;
  notes: string;
  reasons: string;              // 状态变更原因，格式：大类:子类:具体项;大类:子类
  createdAt: string;
  updatedAt: string;
  quotationId?: string;
  terminated?: boolean;
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
  opportunityId?: string;
  locked?: boolean;
}

// ===== 审批请求 =====
export interface ReviewRecord {
  id: string;
  reviewer: string;
  action: 'approved' | 'rejected';
  comment: string;
  createdAt: string;
}

export interface ApprovalRequest {
  id: string;
  approvalType: 'quotation' | 'plan' | 'cost';
  quotationId: string;
  /** 交付审批时关联的交付项目 ID */
  deliveryId?: string;
  salesNo: string;
  clientName: string;
  projectName: string;
  amount: number;
  totalCost: number;
  profitRate: number;
  /** 报价审批时为 GP3；交付审批时为交付项目相关状态的占位 */
  gp3: number;
  submitter: string;
  submitTime: string;
  status: ReviewStatus;
  records: ReviewRecord[];
}

// ===== 交付管理 =====
/** 节点变更历史条目 */
export interface NodeChangeEntry {
  id: string;
  field: 'status' | 'plannedDate';
  oldValue: string;
  newValue: string;
  changedAt: string;
}

export interface DeliveryNode {
  id: string;
  nodeNo: number;
  name: string;
  plannedStartDate: string;
  plannedEndDate: string;
  actualDate?: string;
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
  planApproval?: { reviewer: string; action: 'approved' | 'rejected'; comment: string; createdAt: string };
  // 成本对比审批
  costStatus: 'draft' | 'pending' | 'approved' | 'rejected';
  costApproval?: { reviewer: string; action: 'approved' | 'rejected'; comment: string; createdAt: string };
  /** 成本审批通过后的实际总成本，由成本对比表审批时写入 */
  totalActualCost?: number;
  createdAt: string;
  updatedAt: string;
  terminated?: boolean;
}

/** 成本对比行（引用报价表 GroupItem）*/
export interface ItemCostRow {
  key: string;
  groupName: string;
  groupType: GroupType;
  code: string;
  description: string;
  qty: number;
  unitCost: number;
  estimatedCost: number;       // = direct_cost
  actualCost: number;          // 交付经理录入
  variance: number;
  varianceRate: number;
  isOutOfRange: boolean;
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
  salesNo: string;
  amount: number;
  status: '赢' | '输' | '冻结';
  date: string;
}

export type AccountType = 'enterprise' | 'subsidiary';

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
