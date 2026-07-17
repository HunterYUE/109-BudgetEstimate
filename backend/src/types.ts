// ===== 数据库行类型 =====
// 对应 PostgreSQL 表结构，所有字段名用 snake_case 匹配数据库

export type SourcingType = 'PURCHASED' | 'SELF_MANUFACTURED';
export type ItemType = 'COMPLETE_SET' | 'COMPONENT' | 'PART' | 'SOFTWARE' | 'SERVICE';
export type GroupType = 'EQUIPMENT' | 'INTEGRATION' | 'PACKAGING_TRANSPORT' | 'PROJECT_DELIVERY' | 'IMPLEMENTATION_EXPENSE' | 'OTHER';
export type ReviewStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export type AccountType = 'enterprise' | 'subsidiary';
export type CreditLevel = 'A' | 'B' | 'C';
export type ClientGrade = 'A' | 'B' | 'C';
export type DecisionRole = '使用' | '技术' | '商务' | '高层';
export type OpportunityStage = '信息' | '线索' | '机会' | '投标' | '议价' | '中标';
export type OpportunityStatus = '过程中' | '赢' | '输' | '冻结';
export type DeliveryStatus = '进行中' | '已完成' | '已延期';
export type NodeStatus = 'pending' | 'in_progress' | 'completed' | 'delayed';
export type ApprovalType = 'quotation' | 'plan' | 'cost' | 'promote';
export type ApprovalAction = 'approved' | 'rejected';
export type VetoBudgetOption = 'ok' | 'possible' | 'failed';
export type TimelineOption = 'optimistic' | 'neutral' | 'negative';
export type InfluenceLevel = 'high' | 'medium' | 'low';
export type RoleType = 'EB' | 'UB' | 'TB' | 'COACH';
export type PricingLevel = 'very_strong' | 'strong' | 'competitive' | 'neutral' | 'slightly_weak' | 'weak' | 'very_weak';
export type ReactionMode = 'G' | 'T' | 'EK' | 'OC';

// --- Tags ---
export interface TagRow {
  id: string;
  name: string;
  description: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// --- Components ---
export interface ComponentRow {
  id: string;
  code: string;
  name_cn: string;
  category: ItemType;
  brand: string;
  model: string;
  specification: string;
  note: string;
  supplier: string;
  sourcing_type: SourcingType;
  unit_cost: number;
  design_hours: number;
  assembly_hours: number;
  has_warranty: boolean;
  unit: string;
  review_status: ReviewStatus;
  version: string;
  tags: string[] | null;
  change_log: any;
  created_at: string;
  updated_at: string;
}

// --- Projects ---
export interface ProjectRow {
  id: string;
  sales_no: string;
  client_name: string;
  client_code: string;
  project_name: string;
  project_scope: string;
  project_stage: string;
  expected_award_date: string;
  project_layout: string;
  delivery_period: string;
  payment_terms: string;
  postfix: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectVersionRow {
  id: string;
  project_id: string;
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
  total_cost: number;
  warranty_cost: number;
  risk_cost: number;
  material_cost: number;
  labor_cost: number;
  project_expense: number;
  review_status: ReviewStatus;
  created_at: string;
  updated_at: string;
}

export interface ProjectGroupRow {
  id: string;
  project_id: string;
  version_id: string;
  group_no: number;
  group_type: GroupType;
  name: string;
  is_fixed: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface GroupItemRow {
  id: string;
  group_id: string;
  item_no: number;
  item_type: ItemType;
  component_id: string | null;
  code: string;
  description: string;
  qty_total: number;
  unit: string;
  sourcing_type: SourcingType;
  unit_cost: number;
  design_hours: number;
  assembly_hours: number;
  design_hour_rate: number;
  assembly_hour_rate: number;
  direct_cost: number;
  margin_rate: number;
  basic_price: number;
  accounting_price: number;
  has_warranty: boolean;
  note: string;
}

// --- Sales ---
export interface SalesOpportunityRow {
  id: string;
  sales_no: string;
  client_name: string;
  project_name: string;
  amount: number;
  stage: OpportunityStage;
  win_rate: number;
  status: OpportunityStatus;
  salesman: string;
  competitor: string;
  expected_close_date: string;
  notes: string;
  reasons: string;
  quotation_id: string | null;
  terminated: boolean;
  promote_locked: boolean;
  winner: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlueTableRow {
  id: string;
  opportunity_id: string;
  veto_budget: VetoBudgetOption;
  budget_amount: number | null;
  timeline_plan: string;
  timeline_option: TimelineOption;
  pricing: PricingLevel;
  positioning: number;
  reaction_mode: ReactionMode;
  strategy: string;
  targets: any;
  updated_at: string;
}

export interface BlueTableRoleRow {
  id: string;
  blue_table_id: string;
  role_type: RoleType;
  name: string | null;
  influence: InfluenceLevel;
  influence_weight: number;
  support: number;
  demand_fit: number;
  relationship: number;
}

// --- Quotations ---
export interface QuotationRow {
  id: string;
  sales_no: string;
  client_name: string;
  project_name: string;
  version_no: string;
  status: ReviewStatus;
  amount: number;
  total_cost: number;
  profit_rate: number;
  opportunity_id: string | null;
  locked: boolean;
  created_at: string;
  updated_at: string;
}

// --- Approvals ---
export interface ApprovalRequestRow {
  id: string;
  approval_type: ApprovalType;
  quotation_id: string;
  opportunity_id: string | null;
  delivery_id: string | null;
  sales_no: string;
  client_name: string;
  project_name: string;
  amount: number;
  total_cost: number;
  profit_rate: number;
  gp3: number;
  version_no: string;
  tax_rate: number;
  total_accounting_price: number;
  discounted_price: number;
  discount_rate: number;
  gp3_amount: number;
  submitter: string;
  submit_time: string;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
}

export interface ApprovalRecordRow {
  id: string;
  approval_request_id: string;
  reviewer: string;
  action: ApprovalAction;
  comment: string;
  created_at: string;
}

// --- Deliveries ---
export interface DeliveryProjectRow {
  id: string;
  opportunity_id: string;
  sales_no: string;
  client_name: string;
  project_name: string;
  contract_amount: number;
  quotation_id: string;
  status: DeliveryStatus;
  plan_status: ReviewStatus;
  plan_approval: any;
  cost_status: ReviewStatus;
  cost_approval: any;
  total_actual_cost: number | null;
  terminated: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeliveryNodeRow {
  id: string;
  delivery_project_id: string;
  node_no: number;
  name: string;
  planned_start_date: string;
  planned_end_date: string;
  actual_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  baseline_planned_end_date: string | null;
  status: NodeStatus;
  comments: string;
  history: any;
  created_at: string;
  updated_at: string;
}

// --- Clients ---
export interface ClientRow {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parent_id: string | null;
  industry: string;
  region: string;
  salesman: string;
  credit_level: CreditLevel;
  grade: ClientGrade;
  created_at: string;
  updated_at: string;
}

export interface ClientContactRow {
  id: string;
  client_id: string;
  name: string;
  position: string;
  phone: string;
  email: string;
  decision_role: DecisionRole;
  superior: string;
}

export interface ClientHistoryRow {
  id: string;
  client_id: string;
  project_name: string;
  sales_no: string;
  amount: number;
  status: string;
  date: string;
}
