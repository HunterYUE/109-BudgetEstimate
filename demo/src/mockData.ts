import type { Project, Group, GroupItem, Component, SalesOpportunity, QuotationSummary, ApprovalRequest, DeliveryProject, DeliveryNode, NodeChangeEntry } from './types';
import { calcDirectCost, calcItemPrices } from './utils/calculations';

// ===== 模拟组件数据库 =====
export const mockComponentDB: Component[] = [
  { id: 'c1',  code: 'M-RACK-3015-V1.0',   name_cn: '仓库料架及料箱', category: 'COMPLETE_SET', brand: '埃斯顿', model: '3015', specification: '13列*16层*2垛', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 23009, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: true },
  { id: 'c2',  code: 'M-RAIL-52M-V0.1',    name_cn: '轨道（含橡胶嵌条）', category: 'COMPONENT', brand: '埃斯顿', model: '52m', specification: '52米含橡胶嵌条', sourcing_type: 'PURCHASED', unit_cost: 23009, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: false },
  { id: 'c3',  code: 'M-LIFT-SYS-V1.0',    name_cn: '顶升系统', category: 'COMPLETE_SET', brand: '埃斯顿', model: 'LS-01', specification: '液压顶升', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 26549, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: true },
  { id: 'c4',  code: 'M-TRAY-50-V1.0',     name_cn: '料盘（含防锈纸）', category: 'COMPONENT', brand: '埃斯顿', model: '50张', specification: '含防锈纸50张', sourcing_type: 'PURCHASED', unit_cost: 2655, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: false },
  { id: 'c5',  code: 'M-STACKER-DS-V2.0',  name_cn: '双立柱堆垛机（SEW减速机）', category: 'COMPLETE_SET', brand: '埃斯顿', model: 'DS-2000', specification: '双立柱/SEW减速机/含货叉', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 530973, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: true },
  { id: 'c6',  code: 'M-CONV-OUT-V1.0',    name_cn: '原材料出库输送线', category: 'COMPLETE_SET', brand: '埃斯顿', model: 'CV-01', specification: '滚筒线+地坑安装', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 53097, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: true },
  { id: 'c7',  code: 'M-FORKLIFT-C-V0.2',  name_cn: '液压原材料出库车', category: 'COMPONENT', brand: '合力', model: 'HY-3T', specification: '3吨液压', sourcing_type: 'PURCHASED', unit_cost: 30973, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: false },
  { id: 'c8',  code: 'M-TABLE-SS-V0.1',    name_cn: '不锈钢台（韩国进口）', category: 'COMPONENT', brand: '韩国', model: 'SST-01', specification: '304不锈钢', sourcing_type: 'PURCHASED', unit_cost: 30973, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: false },
  { id: 'c9',  code: 'M-WMS-WCS-V1.0',     name_cn: 'WMS/WCS系统', category: 'SOFTWARE', brand: '埃斯顿', model: 'V3.0', specification: '仓储管理+设备控制', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 53097, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: true },
  { id: 'c10', code: 'M-FENCE-SET-V1.0',   name_cn: '安全围栏/管架/铁丝网', category: 'COMPONENT', brand: '埃斯顿', model: 'FNC-01', specification: '定制围栏含管架', sourcing_type: 'PURCHASED', unit_cost: 35398, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: false },
  { id: 'c11', code: 'E-MES-CCS-V3.0',     name_cn: 'JFY-MES/CCS', category: 'SOFTWARE', brand: '埃斯顿', model: 'MES-V5', specification: '制造执行系统/集中控制', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 70796, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: true },
  { id: 'c12', code: 'E-MES-HW-V1.0',      name_cn: 'MES硬件（扫描枪/打印机/平板）', category: 'COMPONENT', brand: '霍尼韦尔', model: 'HW-SET', specification: '含扫描枪/打印机/平板', sourcing_type: 'PURCHASED', unit_cost: 35398, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: false },
  { id: 'c13', code: 'E-NETWORK-V1.0',     name_cn: '网络及布线工程', category: 'SERVICE', brand: '埃斯顿', model: 'NW-01', specification: '含布线/交换机/施工', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 53097, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: true },
  { id: 'c14', code: 'E-SCREEN-75-V0.1',   name_cn: '75寸显示屏', category: 'COMPONENT', brand: '海信', model: '75H10', specification: '75寸4K显示屏', sourcing_type: 'PURCHASED', unit_cost: 4867, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: false },
  { id: 'c15', code: 'E-SMART-METER-V0.1', name_cn: '智能电表', category: 'COMPONENT', brand: '威胜', model: 'SM-01', specification: '智能电表含采集器', sourcing_type: 'PURCHASED', unit_cost: 1770, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: false },
  { id: 'c16', code: 'E-PROG-LASER-V2.0',  name_cn: '智能编程（激光切割/冲床）', category: 'SOFTWARE', brand: '埃斯顿', model: 'PROG-V2', specification: '激光/冲床加工程序', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 265487, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: true },
  { id: 'c17', code: 'S-PACK-BOX-V1.0',    name_cn: '包装箱', category: 'COMPONENT', brand: '定制', model: 'PKG-01', specification: '定制木箱/含防震', sourcing_type: 'PURCHASED', unit_cost: 65642, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: false },
  { id: 'c18', code: 'H-PM-COST-V1.0',     name_cn: '项目管理', category: 'SERVICE', brand: '', model: '', specification: '项目经理驻场管理', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 137909, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: true },
  { id: 'c19', code: 'H-FIELD-DEBUG-V1.0', name_cn: '安装调试费用', category: 'SERVICE', brand: '', model: '', specification: '现场安装调试', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 150432, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: true },
  { id: 'c20', code: 'H-TRAINING-V1.0',    name_cn: '现场培训', category: 'SERVICE', brand: '', model: '', specification: '操作培训+维护培训', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 30240, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: true },

  { id: 'c21', code: 'L-DESIGN-HRS',       name_cn: '设计工时汇总', category: 'SERVICE', brand: '', model: '', specification: '设备组/集成开发设计工时汇总', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 0, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: false },
  { id: 'c22', code: 'L-ASSEMBLY-HRS',     name_cn: '装配工时汇总', category: 'SERVICE', brand: '', model: '', specification: '设备组/集成开发装配工时汇总', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 0, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: false },
  { id: 'c23', code: 'R-RISK-COST-V1.0',   name_cn: '项目风险费用', category: 'SERVICE', brand: '', model: '', specification: '项目风险费用审批后方可使用', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 0, design_hour_rate: 174, assembly_hour_rate: 70, has_warranty: false },
];

const RATES = { design: 174, assembly: 70 };
const TAX_RATE = 0.13;
const EUR_RATE = 8.15;

function makeItem(data: {
  code: string; description?: string; unit_cost: number; qty_total: number;
  item_type?: GroupItem['item_type']; sourcing_type?: GroupItem['sourcing_type'];
  design_hours?: number; assembly_hours?: number; margin_rate?: number;
  has_warranty?: boolean; component_id?: string; item_no?: number;
}): GroupItem {
  const sourcing = data.sourcing_type ?? 'SELF_MANUFACTURED';
  const dh = data.design_hours ?? 0;
  const ah = data.assembly_hours ?? 0;
  const directCost = calcDirectCost({
    unit_cost: data.unit_cost, qty_total: data.qty_total,
    design_hours: dh, design_hour_rate: RATES.design,
    assembly_hours: ah, assembly_hour_rate: RATES.assembly,
  });
  const prices = calcItemPrices(directCost, data.margin_rate ?? 0.35);
  return {
    id: crypto.randomUUID(),
    item_no: data.item_no ?? 1,
    item_type: data.item_type ?? 'COMPLETE_SET',
    component_id: data.component_id ?? '',
    code: data.code,
    description: data.description ?? '',
    qty_total: data.qty_total,
    unit: '套',
    sourcing_type: sourcing,
    unit_cost: data.unit_cost,
    design_hours: dh,
    assembly_hours: ah,
    design_hour_rate: RATES.design,
    assembly_hour_rate: RATES.assembly,
    direct_cost: directCost,
    margin_rate: data.margin_rate ?? 0.35,
    basic_price: prices.basic_price,
    accounting_price: prices.accounting_price,
    has_warranty: data.has_warranty ?? (sourcing !== 'PURCHASED'),
    note: '',
  };
}

// ===== 设备组 1 =====
const group1Items: GroupItem[] = [
  makeItem({ item_no: 1, component_id: 'c1',  code: 'M-RACK-3015-V1.0', description: '仓库料架及料箱，13列×16层×2垛', unit_cost: 23009, qty_total: 26, margin_rate: 0.35 }),
  makeItem({ item_no: 2, component_id: 'c2',  code: 'M-RAIL-52M-V0.1', description: '轨道52米，含橡胶嵌条', unit_cost: 23009, qty_total: 1, sourcing_type: 'PURCHASED', margin_rate: 0.35 }),
  makeItem({ item_no: 3, component_id: 'c3',  code: 'M-LIFT-SYS-V1.0', description: '顶升系统液压式', unit_cost: 26549, qty_total: 1, margin_rate: 0.35 }),
  makeItem({ item_no: 4, component_id: 'c4',  code: 'M-TRAY-50-V1.0', description: '料盘含防锈纸50张，410个', unit_cost: 2655, qty_total: 410, sourcing_type: 'PURCHASED', margin_rate: 0.35 }),
  makeItem({ item_no: 5, component_id: 'c5',  code: 'M-STACKER-DS-V2.0', description: '双立柱堆垛机SEW减速机含货叉', unit_cost: 530973, qty_total: 1, margin_rate: 0.35 }),
  makeItem({ item_no: 6, component_id: 'c6',  code: 'M-CONV-OUT-V1.0', description: '原材料出库滚筒线+地坑', unit_cost: 53097, qty_total: 1, margin_rate: 0.35 }),
  makeItem({ item_no: 7, component_id: 'c7',  code: 'M-FORKLIFT-C-V0.2', description: '液压原材料出库车3T', unit_cost: 30973, qty_total: 3, sourcing_type: 'PURCHASED', margin_rate: 0.35 }),
  makeItem({ item_no: 8, component_id: 'c8',  code: 'M-TABLE-SS-V0.1', description: '不锈钢台韩国进口', unit_cost: 30973, qty_total: 1, sourcing_type: 'PURCHASED', margin_rate: 0.35 }),
  makeItem({ item_no: 9, component_id: 'c9',  code: 'M-WMS-WCS-V1.0', description: 'WMS/WCS系统V3.0', unit_cost: 53097, qty_total: 1, margin_rate: 1.5 }),
  makeItem({ item_no: 10, component_id: 'c10', code: 'M-FENCE-SET-V1.0', description: '安全围栏管架铁丝网', unit_cost: 35398, qty_total: 1, sourcing_type: 'PURCHASED', margin_rate: 0.35 }),
];

// ===== 设备组 2 =====
const group2Items: GroupItem[] = [
  makeItem({ item_no: 1, code: 'M-UNIT-FEED', description: '随行运动单元', unit_cost: 70796, qty_total: 2, margin_rate: 0.35 }),
  makeItem({ item_no: 2, code: 'M-CLAMP-ARM', description: '夹紧臂', unit_cost: 35398, qty_total: 2, margin_rate: 0.35 }),
];

// ===== 固定组：集成开发组 =====
const integrationItems: GroupItem[] = [
  makeItem({ item_no: 1, code: 'E-MES-CCS', description: 'MES/CCS制造执行系统', unit_cost: 70796, qty_total: 1, margin_rate: 1.5, has_warranty: true }),
  makeItem({ item_no: 2, code: 'E-SVR-HW', description: '系统服务器', unit_cost: 53097, qty_total: 1, sourcing_type: 'PURCHASED', margin_rate: 0.35, has_warranty: true, design_hours: 16, assembly_hours: 48 }),
  makeItem({ item_no: 3, code: 'E-PLC-CTRL', description: 'PLC控制系统', unit_cost: 26549, qty_total: 2, margin_rate: 0.35, has_warranty: true, design_hours: 128, assembly_hours: 128 }),
  makeItem({ item_no: 4, code: 'E-INFRA', description: '基础设施', unit_cost: 35398, qty_total: 1, sourcing_type: 'PURCHASED', margin_rate: 0.35, has_warranty: true, design_hours: 64, assembly_hours: 128 }),
];

// ===== 固定组：包装运输 =====
const packagingTransportItems: GroupItem[] = [
  makeItem({ item_no: 1, component_id: 'c17', code: 'S-PACK-BOX-V1.0', description: '设备包装费', unit_cost: 65642, qty_total: 1, sourcing_type: 'PURCHASED', margin_rate: 0.15 }),
  makeItem({ item_no: 2, code: 'S-TRANS-INSURE', description: '运输保险费', unit_cost: 26549, qty_total: 1, sourcing_type: 'PURCHASED', margin_rate: 0.15 }),
  makeItem({ item_no: 3, code: 'S-FREIGHT', description: '设备运输费', unit_cost: 88496, qty_total: 1, sourcing_type: 'PURCHASED', margin_rate: 0.15 }),
];

// ===== 固定组：项目交付 =====
// ===== 固定组：项目交付 =====
const projectDeliveryItems: GroupItem[] = [
  makeItem({ item_no: 1, code: 'H-DESIGN-REVIEW', description: '设计会签', unit_cost: RATES.design, qty_total: 160, item_type: 'SERVICE', margin_rate: 0.15 }),
  makeItem({ item_no: 2, code: 'H-SITE-INSTALL', description: '现场安装', unit_cost: RATES.assembly, qty_total: 640, item_type: 'SERVICE', margin_rate: 0.15 }),
  makeItem({ item_no: 3, code: 'H-SITE-DEBUG', description: '现场调试', unit_cost: RATES.design, qty_total: 480, item_type: 'SERVICE', margin_rate: 0.15 }),
  makeItem({ item_no: 4, code: 'H-SITE-TRAIN', description: '现场培训', unit_cost: RATES.design, qty_total: 80, item_type: 'SERVICE', margin_rate: 0.15 }),
  makeItem({ item_no: 5, code: 'H-SITE-PROD', description: '现场陪产', unit_cost: RATES.design, qty_total: 960, item_type: 'SERVICE', margin_rate: 0.15 }),
  makeItem({ item_no: 6, code: 'H-PM', description: '项目管理', unit_cost: RATES.design, qty_total: 640, item_type: 'SERVICE', margin_rate: 0.15 }),
];

// ===== 固定组：实施费用 =====
const implementationExpenseItems: GroupItem[] = [
  makeItem({ item_no: 1, code: 'E-TRAVEL', description: '差旅费用', unit_cost: 150000, qty_total: 1, margin_rate: 0, sourcing_type: 'PURCHASED', item_type: 'SERVICE' }),
  makeItem({ item_no: 2, code: 'E-MGMT-FEE', description: '项目管理费', unit_cost: 200000, qty_total: 1, margin_rate: 0, sourcing_type: 'PURCHASED', item_type: 'SERVICE' }),
];

// ===== 固定组：其他 =====
const otherItems: GroupItem[] = [
  makeItem({ item_no: 1, code: 'S-SITE-RENT', description: '场地租赁', unit_cost: 0, qty_total: 0, margin_rate: 0.05, sourcing_type: 'PURCHASED' }),
  makeItem({ item_no: 2, code: 'S-EQP-RENT', description: '设备租赁', unit_cost: 1750, qty_total: 2, margin_rate: 0.05, sourcing_type: 'PURCHASED' }),
];

// ===== 项目（固定组按集成控制→包装运输→项目交付→其他排序）=====
export const mockProject: Project = {
  id: 'proj-001',
  sales_no: 'A2026-001',
  client_name: '南京埃斯顿智能工业集团股份有限公司',
  client_code: 'ESD-2026-001',
  project_scope: '2年质保',
  project_stage: '投标',
  expected_award_date: '2026-03-15',
  project_layout: '',
  delivery_period: '合同生效后5个月发货，货到现场后3个月安调完毕，具备试生产条件',
  payment_terms: '预付30% 发货60% 验收0% 质保10%',
  postfix: 'YD',
  note: '',
  current_version: {
    id: 'ver-001',
    version_no: 'V1.0',
    eur_rate: EUR_RATE,
    tax_rate: TAX_RATE,
    rounding_digits: 0,
    warranty_rate: 0.04,
    risk_rate: 0.02,
    commercial_cost: 0,
    total_direct_cost: 0,
    total_accounting_price: 0,
    discounted_price: 11800000,
    discount_rate: 0,
    rp1_profit_rate: 0,
    gp3_profit_rate: 0,
    review_status: 'draft',
  },
  groups: [
    { id: 'grp-1', group_no: 1, group_type: 'EQUIPMENT', name: 'MS3015-13x16-2', is_fixed: false, items: group1Items },
    { id: 'grp-2', group_no: 2, group_type: 'EQUIPMENT', name: '喂入单元', is_fixed: false, items: group2Items },
    { id: 'grp-int', group_no: 3, group_type: 'INTEGRATION', name: '集成开发组', is_fixed: true, items: integrationItems },
    { id: 'grp-pack', group_no: 4, group_type: 'PACKAGING_TRANSPORT', name: '包装运输', is_fixed: true, items: packagingTransportItems },
    { id: 'grp-delivery', group_no: 5, group_type: 'PROJECT_DELIVERY', name: '项目交付', is_fixed: true, items: projectDeliveryItems },
    { id: 'grp-implement', group_no: 6, group_type: 'IMPLEMENTATION_EXPENSE', name: '差旅和管理', is_fixed: true, items: implementationExpenseItems },
    { id: 'grp-other', group_no: 7, group_type: 'OTHER', name: '其他', is_fixed: true, items: otherItems },
  ],
};

// ===== 销售机会 Mock =====
export const mockOpportunities: SalesOpportunity[] = [
  { id: 'opp-1', salesNo: 'A2026-01-001', clientName: '南京埃斯顿智能工业集团股份有限公司', projectName: '双料垛料库 MS3015-13*16-2', amount: 11800000, stage: '投标', winRate: 60, status: '过程中', salesman: '张明', competitor: '西门子', expectedCloseDate: '2026-03-15', notes: '', createdAt: '2026-01-10', updatedAt: '2026-06-20', quotationId: 'proj-001' },
  { id: 'opp-2', salesNo: 'A2026-01-002', clientName: '徐工集团', projectName: '智能仓储系统升级', amount: 8500000, stage: '议价', winRate: 80, status: '过程中', salesman: '李华', competitor: '倍福、西门子、库卡', expectedCloseDate: '2026-04-01', notes: '客户对价格比较敏感', createdAt: '2026-01-15', updatedAt: '2026-06-18', quotationId: 'proj-002' },
  { id: 'opp-3', salesNo: 'A2025-11-001', clientName: '三一重工', projectName: '挖掘机智能产线', amount: 15200000, stage: '中标', winRate: 100, status: '赢', salesman: '王芳', competitor: '库卡', expectedCloseDate: '2026-02-28', notes: '已签订合同', createdAt: '2025-11-20', updatedAt: '2026-02-28', quotationId: 'proj-003' , reasons: '竞对:价格:主机成本,解决方案成本;竞对:客户关系' },
  { id: 'opp-4', salesNo: 'A2026-06-001', clientName: '中联重科', projectName: '高空作业平台装配线', amount: 3200000, stage: '信息', winRate: 15, status: '过程中', salesman: '张明', competitor: '', expectedCloseDate: '2026-08-01', notes: '初步接触阶段', createdAt: '2026-06-01', updatedAt: '2026-06-15' },
  { id: 'opp-5', salesNo: 'A2026-03-001', clientName: '比亚迪汽车', projectName: '电池 pack 自动化产线', amount: 22000000, stage: '机会', winRate: 45, status: '冻结', salesman: '李华', competitor: '', expectedCloseDate: '2026-09-30', notes: '客户预算审批暂停', createdAt: '2026-03-01', updatedAt: '2026-06-10' },
  { id: 'opp-6', salesNo: 'A2026-04-001', clientName: '格力电器', projectName: '空调控制器 SMT 线', amount: 6800000, stage: '线索', winRate: 30, status: '过程中', salesman: '王芳', competitor: '西门子、倍福', expectedCloseDate: '2026-07-15', notes: '已发送初步方案', createdAt: '2026-04-10', updatedAt: '2026-06-12' },
  { id: 'opp-7', salesNo: 'A2025-12-001', clientName: '海康威视', projectName: '摄像头组装测试线', amount: 9600000, stage: '投标', winRate: 50, status: '输', salesman: '张明', competitor: '西门子', expectedCloseDate: '2026-03-01', notes: '丢单(竞对):客户关系 竞争对手与客户有长期合作', createdAt: '2025-12-01', updatedAt: '2026-03-01', quotationId: 'proj-004' , reasons: '竞对:价格:主机价格;竞对:客户关系' },
  { id: 'opp-8', salesNo: 'A2026-02-001', clientName: '宁德时代', projectName: '模组 PACK 线二期', amount: 18000000, stage: '机会', winRate: 55, status: '过程中', salesman: '陈伟', competitor: '库卡', expectedCloseDate: '2026-06-30', notes: '二期扩建项目', createdAt: '2026-02-15', updatedAt: '2026-06-19' },
  { id: 'opp-9', salesNo: 'A2026-05-001', clientName: '美的集团', projectName: '中央空调智能产线', amount: 13500000, stage: '议价', winRate: 70, status: '输', salesman: '李华', competitor: '倍福', expectedCloseDate: '2026-05-30', notes: '取消(客户):缩减预算 客户年度预算缩减30%', createdAt: '2026-03-15', updatedAt: '2026-05-30' , reasons: '取消:预算缩减;取消:需求变更' },
  { id: 'opp-10', salesNo: 'A2026-04-002', clientName: '富士康', projectName: '电子组装自动化线', amount: 7800000, stage: '机会', winRate: 40, status: '输', salesman: '王芳', competitor: '西门子', expectedCloseDate: '2026-04-15', notes: '放弃(我方):利润过低 毛利率不足12%', createdAt: '2026-02-01', updatedAt: '2026-04-15' , reasons: '放弃:利润率过低' },
  { id: 'opp-11', salesNo: 'A2026-06-002', clientName: '上汽集团', projectName: '动力电池智能产线', amount: 16500000, stage: '投标', winRate: 50, status: '输', salesman: '陈伟', competitor: '西门子', expectedCloseDate: '2026-06-15', notes: '丢单(竞对):价格:产品成本 竞争对手设备报价低30%', createdAt: '2026-04-01', updatedAt: '2026-06-15' , reasons: '竞对:价格:解决方案价格;竞对:技术方案:痛点发掘和解决' },
  { id: 'opp-12', salesNo: 'A2026-05-002', clientName: '中兴通讯', projectName: '5G基站组装线', amount: 9200000, stage: '机会', winRate: 35, status: '输', salesman: '李华', competitor: '倍福', expectedCloseDate: '2026-05-20', notes: '取消(客户):需求变更 客户转向购买标准设备', createdAt: '2026-03-10', updatedAt: '2026-05-20' , reasons: '取消:需求变更' },

  { id: 'opp-13', salesNo: 'A2026-07-001', clientName: '一汽大众', projectName: '焊装线自动化改造', amount: 21000000, stage: '中标', winRate: 100, status: '赢', salesman: '张明', competitor: '西门子、倍福', expectedCloseDate: '2026-07-15', notes: '技术方案胜出', createdAt: '2026-05-01', updatedAt: '2026-07-15', reasons: '竞对:价格:主机成本,解决方案成本;竞对:客户关系' },
  { id: 'opp-14', salesNo: 'A2026-07-002', clientName: '华为技术', projectName: '数据中心智能温控系统', amount: 28000000, stage: '中标', winRate: 100, status: '赢', salesman: '李华', competitor: '施耐德', expectedCloseDate: '2026-07-20', notes: '品牌优势', createdAt: '2026-04-15', updatedAt: '2026-07-20', reasons: '竞对:技术方案:痛点发掘和解决;竞对:品牌' },
  { id: 'opp-15', salesNo: 'A2026-06-003', clientName: '中国中车', projectName: '转向架智能生产线', amount: 19500000, stage: '中标', winRate: 100, status: '赢', salesman: '王芳', competitor: 'ABB', expectedCloseDate: '2026-06-30', notes: '', createdAt: '2026-03-20', updatedAt: '2026-06-30', reasons: '竞对:价格:主机成本;竞对:技术方案:痛点发掘和解决' },
  { id: 'opp-16', salesNo: 'A2026-07-003', clientName: '万华化学', projectName: '化工仓储自动化升级', amount: 12500000, stage: '中标', winRate: 100, status: '赢', salesman: '陈伟', competitor: '罗克韦尔', expectedCloseDate: '2026-07-10', notes: '', createdAt: '2026-04-01', updatedAt: '2026-07-10', reasons: '竞对:客户关系' },
];

// ===== 报价摘要 Mock =====
export const mockQuotationSummaries: QuotationSummary[] = [
  { id: 'proj-001', salesNo: 'A2026-01-001', clientName: '南京埃斯顿智能工业集团股份有限公司', projectName: '双料垛料库 MS3015-13*16-2', versionNo: 'V1.0', status: 'draft', amount: 11800000, totalCost: 9200000, profitRate: 22.0, updatedAt: '2026-06-22', opportunityId: 'opp-1' },
  { id: 'proj-002', salesNo: 'A2026-01-002', clientName: '徐工集团', projectName: '智能仓储系统升级', versionNo: 'V1.2', status: 'pending', amount: 8500000, totalCost: 6800000, profitRate: 20.0, updatedAt: '2026-06-20', opportunityId: 'opp-2' },
  { id: 'proj-003', salesNo: 'A2025-11-001', clientName: '三一重工', projectName: '挖掘机智能产线', versionNo: 'V2.0', status: 'approved', amount: 15200000, totalCost: 11800000, profitRate: 22.4, updatedAt: '2026-02-25', opportunityId: 'opp-3' },
  { id: 'proj-004', salesNo: 'A2025-12-001', clientName: '海康威视', projectName: '摄像头组装测试线', versionNo: 'V1.1', status: 'rejected', amount: 9600000, totalCost: 8200000, profitRate: 14.6, updatedAt: '2026-02-28', opportunityId: 'opp-7' },
  { id: 'proj-005', salesNo: 'A2026-03-001', clientName: '比亚迪汽车', projectName: '电池 pack 自动化产线', versionNo: 'V1.0', status: 'pending', amount: 22000000, totalCost: 18500000, profitRate: 15.9, updatedAt: '2026-06-10', opportunityId: 'opp-5' },
];

// ===== 审批请求 Mock =====
export const mockApprovalRequests: ApprovalRequest[] = [
  { id: 'apr-1', quotationId: 'proj-002', salesNo: 'A2026-01-002', clientName: '徐工集团', projectName: '智能仓储系统升级', amount: 8500000, totalCost: 6800000, profitRate: 20.0, gp3: 0.165, submitter: '李华', submitTime: '2026-06-20', status: 'pending', records: [] },
  { id: 'apr-2', quotationId: 'proj-001', salesNo: 'A2026-01-001', clientName: '南京埃斯顿智能工业集团股份有限公司', projectName: '双料垛料库 MS3015-13*16-2', amount: 11800000, totalCost: 9200000, profitRate: 22.0, gp3: 0.185, submitter: '张明', submitTime: '2026-06-18', status: 'approved', records: [{ id: 'rec-1', reviewer: '刘总监', action: 'approved', comment: '毛利率达标，同意', createdAt: '2026-06-19' }] },
  { id: 'apr-3', quotationId: 'proj-004', salesNo: 'A2025-12-001', clientName: '海康威视', projectName: '摄像头组装测试线', amount: 9600000, totalCost: 8200000, profitRate: 14.6, gp3: 0.128, submitter: '张明', submitTime: '2026-02-26', status: 'rejected', records: [{ id: 'rec-2', reviewer: '刘总监', action: 'rejected', comment: 'GP3 仅 12.8%，低于 15% 红线，请重新核算成本或调整报价', createdAt: '2026-02-27' }] },
  { id: 'apr-4', quotationId: 'proj-005', salesNo: 'A2026-03-001', clientName: '比亚迪汽车', projectName: '电池 pack 自动化产线', amount: 22000000, totalCost: 18500000, profitRate: 15.9, gp3: 0.138, submitter: '陈伟', submitTime: '2026-06-10', status: 'pending', records: [] },
  { id: 'apr-5', quotationId: 'proj-003', salesNo: 'A2025-11-001', clientName: '三一重工', projectName: '挖掘机智能产线', amount: 15200000, totalCost: 11800000, profitRate: 22.4, gp3: 0.195, submitter: '王芳', submitTime: '2026-02-20', status: 'approved', records: [{ id: 'rec-3', reviewer: '刘总监', action: 'approved', comment: '方案成熟，报价合理', createdAt: '2026-02-22' }] },
];

// ===== 交付项目 Mock =====
const NODE_NAMES = [
  'Handover', '合同签订', 'Kickoff', '方案细化', '技术会签',
  '详细设计', '设计评审', '制造采购', '组装调试', '出厂验收',
  '包装发货', '现场安调', '验收整改', '终验收', '项目总结',
];

function makeNode(projectNo: number, nodeNo: number, overrides: Partial<DeliveryNode> & { plannedStartDate: string; plannedEndDate: string }): DeliveryNode {
  const history: NodeChangeEntry[] = [];
  // No history recorded for initial mock data (history is for runtime modifications only)
  return {
    id: `dn-${projectNo}-${nodeNo}`,
    nodeNo,
    name: NODE_NAMES[nodeNo - 1],
    status: 'pending',
    actualDate: undefined,
    comments: '',
    history,
    ...overrides,
  };
}

const nodesProject1: DeliveryNode[] = [
  makeNode(1, 1, { plannedStartDate: '2026-03-01', plannedEndDate: '2026-03-05', actualDate: '2026-03-05', status: 'completed', comments: '客户交接会议完成，资料齐全' }),
  makeNode(1, 2, { plannedStartDate: '2026-03-05', plannedEndDate: '2026-03-08', actualDate: '2026-03-08', status: 'completed' }),
  makeNode(1, 3, { plannedStartDate: '2026-03-10', plannedEndDate: '2026-03-12', actualDate: '2026-03-12', status: 'completed' }),
  makeNode(1, 4, { plannedStartDate: '2026-03-20', plannedEndDate: '2026-03-28', actualDate: '2026-03-28', status: 'completed', comments: '根据客户反馈调整了布局方案，新增2个检测位' }),
  makeNode(1, 5, { plannedStartDate: '2026-04-01', plannedEndDate: '2026-04-05', actualDate: '2026-04-05', status: 'completed' }),
  makeNode(1, 6, { plannedStartDate: '2026-04-15', plannedEndDate: '2026-04-22', actualDate: '2026-04-22', status: 'completed' }),
  makeNode(1, 7, { plannedStartDate: '2026-05-01', plannedEndDate: '2026-05-03', actualDate: '2026-05-03', status: 'completed' }),
  makeNode(1, 8, { plannedStartDate: '2026-05-20', plannedEndDate: '2026-06-01', actualDate: '2026-06-01', status: 'completed' }),
  makeNode(1, 9, { plannedStartDate: '2026-06-10', plannedEndDate: '2026-06-18', actualDate: '2026-06-18', status: 'completed' }),
  makeNode(1, 10, { plannedStartDate: '2026-06-20', plannedEndDate: '2026-06-22', actualDate: '2026-06-22', status: 'completed' }),
  makeNode(1, 11, { plannedStartDate: '2026-06-25', plannedEndDate: '2026-06-25', status: 'in_progress' }),
  makeNode(1, 12, { plannedStartDate: '2026-07-10', plannedEndDate: '2026-07-10', comments: '注意：现场地坑施工需提前确认' }),
  makeNode(1, 13, { plannedStartDate: '2026-07-25', plannedEndDate: '2026-07-25' }),
  makeNode(1, 14, { plannedStartDate: '2026-08-15', plannedEndDate: '2026-08-15' }),
  makeNode(1, 15, { plannedStartDate: '2026-08-30', plannedEndDate: '2026-08-30' }),
];

const nodesProject2: DeliveryNode[] = [
  makeNode(2, 1, { plannedStartDate: '2026-01-10', plannedEndDate: '2026-01-12', actualDate: '2026-01-12', status: 'completed' }),
  makeNode(2, 2, { plannedStartDate: '2026-01-15', plannedEndDate: '2026-01-18', actualDate: '2026-01-18', status: 'completed' }),
  makeNode(2, 3, { plannedStartDate: '2026-01-20', plannedEndDate: '2026-01-20', actualDate: '2026-01-20', status: 'completed' }),
  makeNode(2, 4, { plannedStartDate: '2026-02-01', plannedEndDate: '2026-02-05', actualDate: '2026-02-05', status: 'completed' }),
  makeNode(2, 5, { plannedStartDate: '2026-02-10', plannedEndDate: '2026-02-12', actualDate: '2026-02-12', status: 'completed' }),
  makeNode(2, 6, { plannedStartDate: '2026-02-20', plannedEndDate: '2026-02-25', actualDate: '2026-02-25', status: 'completed' }),
  makeNode(2, 7, { plannedStartDate: '2026-03-01', plannedEndDate: '2026-03-02', actualDate: '2026-03-02', status: 'completed' }),
  makeNode(2, 8, { plannedStartDate: '2026-03-20', plannedEndDate: '2026-03-25', actualDate: '2026-03-25', status: 'completed' }),
  makeNode(2, 9, { plannedStartDate: '2026-04-10', plannedEndDate: '2026-04-15', actualDate: '2026-04-15', status: 'completed' }),
  makeNode(2, 10, { plannedStartDate: '2026-04-20', plannedEndDate: '2026-04-22', actualDate: '2026-04-22', status: 'completed' }),
  makeNode(2, 11, { plannedStartDate: '2026-05-01', plannedEndDate: '2026-05-03', actualDate: '2026-05-03', status: 'completed' }),
  makeNode(2, 12, { plannedStartDate: '2026-05-20', plannedEndDate: '2026-05-25', actualDate: '2026-05-25', status: 'completed' }),
  makeNode(2, 13, { plannedStartDate: '2026-06-01', plannedEndDate: '2026-06-05', actualDate: '2026-06-05', status: 'completed' }),
  makeNode(2, 14, { plannedStartDate: '2026-06-15', plannedEndDate: '2026-06-18', actualDate: '2026-06-18', status: 'completed' }),
  makeNode(2, 15, { plannedStartDate: '2026-06-25', plannedEndDate: '2026-06-28', actualDate: '2026-06-28', status: 'completed' }),
];

const nodesProject3: DeliveryNode[] = [
  makeNode(3, 1, { plannedStartDate: '2026-04-01', plannedEndDate: '2026-04-03', actualDate: '2026-04-03', status: 'completed' }),
  makeNode(3, 2, { plannedStartDate: '2026-04-05', plannedEndDate: '2026-04-06', actualDate: '2026-04-06', status: 'completed' }),
  makeNode(3, 3, { plannedStartDate: '2026-04-10', plannedEndDate: '2026-04-15', actualDate: '2026-04-15', status: 'completed' }),
  makeNode(3, 4, { plannedStartDate: '2026-04-25', plannedEndDate: '2026-05-05', actualDate: '2026-05-05', status: 'delayed' }),
  makeNode(3, 5, { plannedStartDate: '2026-05-05', plannedEndDate: '2026-05-05', status: 'completed' }),
  makeNode(3, 6, { plannedStartDate: '2026-05-20', plannedEndDate: '2026-06-01', actualDate: '2026-06-01', status: 'delayed' }),
  makeNode(3, 7, { plannedStartDate: '2026-06-05', plannedEndDate: '2026-06-05', status: 'in_progress' }),
  makeNode(3, 8, { plannedStartDate: '2026-06-20', plannedEndDate: '2026-06-20' }),
  makeNode(3, 9, { plannedStartDate: '2026-07-05', plannedEndDate: '2026-07-05' }),
  makeNode(3, 10, { plannedStartDate: '2026-07-15', plannedEndDate: '2026-07-15' }),
  makeNode(3, 11, { plannedStartDate: '2026-07-25', plannedEndDate: '2026-07-25' }),
  makeNode(3, 12, { plannedStartDate: '2026-08-10', plannedEndDate: '2026-08-10' }),
  makeNode(3, 13, { plannedStartDate: '2026-08-25', plannedEndDate: '2026-08-25' }),
  makeNode(3, 14, { plannedStartDate: '2026-09-10', plannedEndDate: '2026-09-10' }),
  makeNode(3, 15, { plannedStartDate: '2026-09-25', plannedEndDate: '2026-09-25' }),
];

export const mockDeliveryProjects: DeliveryProject[] = [
  {
    id: 'del-1', opportunityId: 'opp-3', salesNo: 'A2026-003',
    clientName: '三一重工', projectName: '挖掘机智能产线',
    contractAmount: 15200000, quotationId: 'proj-003',
    status: '进行中', nodes: nodesProject1,
    planStatus: 'approved', planApproval: { reviewer: '刘总监', action: 'approved', comment: '计划合理，同意', createdAt: '2026-03-02' },
    costStatus: 'draft',
    createdAt: '2026-03-05', updatedAt: '2026-06-20',
  },
  {
    id: 'del-2', opportunityId: 'opp-1', salesNo: 'A2026-001',
    clientName: '南京埃斯顿智能工业集团股份有限公司', projectName: '双料垛料库 MS3015-13*16-2',
    contractAmount: 11800000, quotationId: 'proj-001',
    status: '已完成', nodes: nodesProject2,
    planStatus: 'approved', planApproval: { reviewer: '刘总监', action: 'approved', comment: '同意', createdAt: '2026-01-13' },
    costStatus: 'approved', costApproval: { reviewer: '刘总监', action: 'approved', comment: '成本控制在合理范围内', createdAt: '2026-06-30' },
    createdAt: '2026-01-12', updatedAt: '2026-06-28',
  },
  {
    id: 'del-3', opportunityId: 'opp-8', salesNo: 'A2026-008',
    clientName: '宁德时代', projectName: '模组 PACK 线二期',
    contractAmount: 18000000, quotationId: 'proj-005',
    status: '已延期', nodes: nodesProject3,
    planStatus: 'pending',
    costStatus: 'draft',
    createdAt: '2026-04-03', updatedAt: '2026-06-15',
  },
];
