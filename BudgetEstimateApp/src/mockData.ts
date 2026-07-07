import type { Project, GroupItem, Component, SalesOpportunity, QuotationSummary, ApprovalRequest, DeliveryProject, DeliveryNode, NodeChangeEntry, Client, TagNode } from './types';
import { calcDirectCost, calcItemPrices } from './utils/calculations';

// ===== 标签树 =====
export const mockTagTree: TagNode[] = [
  {
    id: 't1', name: '上下料系统',
    children: [
      { id: 't1-1', name: '桁架上下料', children: [
        { id: 't1-1-1', name: '桁架机械手' },
        { id: 't1-1-2', name: '吸盘架' },
      ]},
    ],
  },
  {
    id: 't2', name: '输送系统',
    children: [
      { id: 't2-1', name: '辊道输送' },
      { id: 't2-2', name: '皮带输送' },
      { id: 't2-3', name: 'RGV小车' },
      { id: 't2-4', name: 'AGV搬运' },
    ],
  },
  {
    id: 't3', name: '加工设备',
    children: [
      { id: 't3-1', name: '激光切割' },
      { id: 't3-2', name: '冲压' },
      { id: 't3-3', name: '折弯' },
    ],
  },
  {
    id: 't4', name: '机器人系统',
    children: [
      { id: 't4-1', name: '机器人上下料', children: [
        { id: 't4-1-1', name: '机器人抓手' },
        { id: 't4-1-2', name: '分拣机构' },
        { id: 't4-1-3', name: '机器人地轨' },
      ]},
      { id: 't4-2', name: '六轴机器人' },
      { id: 't4-3', name: '协作机器人' },
      { id: 't4-4', name: '焊接工作站' },
      { id: 't4-5', name: '机器人控制系统' },
    ],
  },
  {
    id: 't5', name: '仓储设备',
    children: [
      { id: 't5-1', name: '堆垛机' },
      { id: 't5-2', name: '料塔' },
      { id: 't5-3', name: '提升机' },
      { id: 't5-4', name: '托盘' },
      { id: 't5-5', name: '拆包台' },
      { id: 't5-6', name: '倒托设备' },
    ],
  },
  {
    id: 't6', name: '控制系统',
    children: [
      { id: 't6-1', name: 'PLC控制柜' },
      { id: 't6-2', name: '配电柜' },
      { id: 't6-3', name: '操作终端' },
      { id: 't6-4', name: '工业PC' },
      { id: 't6-5', name: '网络布线' },
      { id: 't6-6', name: '服务器' },
    ],
  },
  {
    id: 't7', name: '检测/视觉',
    children: [
      { id: 't7-1', name: '视觉检测' },
      { id: 't7-2', name: '传感检测' },
      { id: 't7-3', name: '测量系统' },
    ],
  },
  { id: 't8', name: '安全防护' },
  { id: 't9', name: '包装运输' },
  { id: 't10', name: '工程服务', children: [
    { id: 't10-1', name: '设计工费' },
    { id: 't10-2', name: '装配工费' },
    { id: 't10-3', name: '安装工费' },
    { id: 't10-4', name: '调试工费' },
    { id: 't10-5', name: '培训工费' },
    { id: 't10-6', name: '陪产工费' },
    { id: 't10-7', name: '项目管理工费' },
  ] },
  { id: 't11', name: '软件系统' },
];

// ===== 模拟组件数据库 =====
export const mockComponentDB: Component[] = [
  { id: 'c1',  code: 'M-RACK-3015-V1.0',   name_cn: '仓库料架及料箱', category: 'COMPLETE_SET', brand: '埃斯顿', model: '3015', specification: '13列*16层*2垛', unit: '套', supplier: '埃斯顿', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 23009, design_hours: 0, assembly_hours: 0, has_warranty: true, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-01-10', updatedAt: '2026-06-20', note: '', changeLog: [{ version: 'V1.0', date: '2025-01-10', note: '初始创建' }] },
  { id: 'c2',  code: 'M-RAIL-52M-V0.1',    name_cn: '轨道（含橡胶嵌条）', category: 'COMPONENT', brand: '埃斯顿', model: '52m', specification: '52米含橡胶嵌条', unit: '米', supplier: '埃斯顿', sourcing_type: 'PURCHASED', unit_cost: 23009, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-02-01', updatedAt: '2026-05-20', note: '', changeLog: [{ version: 'V1.0', date: '2025-02-01', note: '初始创建' }] },
  
  { id: 'c3',  code: 'M-LIFT-SYS-V1.0',    name_cn: '顶升系统', category: 'COMPLETE_SET', brand: '埃斯顿', model: 'LS-01', specification: '液压顶升', unit: '套', supplier: '埃斯顿', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 26549, design_hours: 0, assembly_hours: 0, has_warranty: true, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-01-20', updatedAt: '2026-04-15', note: '', changeLog: [{ version: 'V1.0', date: '2025-01-20', note: '初始创建' }] },
  { id: 'c4',  code: 'M-TRAY-50-V1.0',     name_cn: '料盘（含防锈纸）', category: 'COMPONENT', brand: '埃斯顿', model: '50张', specification: '含防锈纸50张', unit: '个', supplier: '埃斯顿', sourcing_type: 'PURCHASED', unit_cost: 2655, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-02-01', updatedAt: '2026-05-20', note: '', changeLog: [{ version: 'V1.0', date: '2025-02-01', note: '初始创建' }] },
  
  { id: 'c5',  code: 'M-STACKER-DS-V2.0',  name_cn: '双立柱堆垛机（SEW减速机）', category: 'COMPLETE_SET', brand: '埃斯顿', model: 'DS-2000', specification: '双立柱/SEW减速机/含货叉', unit: '套', supplier: '埃斯顿', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 530973, design_hours: 0, assembly_hours: 0, has_warranty: true, reviewStatus: 'approved', version: 'V2.0', createdAt: '2025-01-10', updatedAt: '2026-05-01', note: '', changeLog: [{ version: 'V2.0', date: '2025-01-10', note: '初始创建' }] },
  { id: 'c6',  code: 'M-CONV-OUT-V1.0',    name_cn: '原材料出库输送线', category: 'COMPLETE_SET', brand: '埃斯顿', model: 'CV-01', specification: '滚筒线+地坑安装', unit: '套', supplier: '埃斯顿', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 53097, design_hours: 0, assembly_hours: 0, has_warranty: true, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-02-15', updatedAt: '2026-04-20', note: '', changeLog: [{ version: 'V1.0', date: '2025-02-15', note: '初始创建' }] },
  { id: 'c7',  code: 'M-FORKLIFT-C-V0.2',  name_cn: '液压原材料出库车', category: 'COMPONENT', brand: '合力', model: 'HY-3T', specification: '3吨液压', unit: '台', supplier: '合力叉车', sourcing_type: 'PURCHASED', unit_cost: 30973, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-02-01', updatedAt: '2026-05-20', note: '', changeLog: [{ version: 'V1.0', date: '2025-02-01', note: '初始创建' }] },
  
  { id: 'c8',  code: 'M-TABLE-SS-V0.1',    name_cn: '不锈钢台（韩国进口）', category: 'COMPONENT', brand: '韩国', model: 'SST-01', specification: '304不锈钢', unit: '台', supplier: '韩国进口商贸', sourcing_type: 'PURCHASED', unit_cost: 30973, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-02-01', updatedAt: '2026-05-20', note: '', changeLog: [{ version: 'V1.0', date: '2025-02-01', note: '初始创建' }] },
  
  { id: 'c9',  code: 'M-WMS-WCS-V1.0',     name_cn: 'WMS/WCS系统', category: 'SOFTWARE', brand: '埃斯顿', model: 'V3.0', specification: '仓储管理+设备控制', unit: '套', supplier: '埃斯顿', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 53097, design_hours: 0, assembly_hours: 0, has_warranty: true, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-04-01', updatedAt: '2026-06-05', note: '', changeLog: [{ version: 'V1.0', date: '2025-04-01', note: '初始创建' }] },
  { id: 'c10', code: 'M-FENCE-SET-V1.0',   name_cn: '安全围栏/管架/铁丝网', category: 'COMPONENT', brand: '埃斯顿', model: 'FNC-01', specification: '定制围栏含管架', unit: '套', supplier: '埃斯顿', sourcing_type: 'PURCHASED', unit_cost: 35398, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-02-01', updatedAt: '2026-05-20', note: '', changeLog: [{ version: 'V1.0', date: '2025-02-01', note: '初始创建' }] },
  
  { id: 'c11', code: 'E-MES-CCS-V3.0',     name_cn: 'JFY-MES/CCS', category: 'SOFTWARE', brand: '埃斯顿', model: 'MES-V5', specification: '制造执行系统/集中控制', unit: '套', supplier: '埃斯顿', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 70796, design_hours: 0, assembly_hours: 0, has_warranty: true, reviewStatus: 'approved', version: 'V3.0', createdAt: '2025-01-05', updatedAt: '2026-06-15', note: '', changeLog: [{ version: 'V3.0', date: '2025-01-05', note: '初始创建' }] },
  { id: 'c12', code: 'E-MES-HW-V1.0',      name_cn: 'MES硬件（扫描枪/打印机/平板）', category: 'COMPONENT', brand: '霍尼韦尔', model: 'HW-SET', specification: '含扫描枪/打印机/平板', unit: '套', supplier: '霍尼韦尔', sourcing_type: 'PURCHASED', unit_cost: 35398, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-02-01', updatedAt: '2026-05-20', note: '', changeLog: [{ version: 'V1.0', date: '2025-02-01', note: '初始创建' }] },
  
  { id: 'c13', code: 'E-NETWORK-V1.0',     name_cn: '网络及布线工程', category: 'SERVICE', brand: '埃斯顿', model: 'NW-01', specification: '含布线/交换机/施工', unit: '项', supplier: '埃斯顿', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 53097, design_hours: 0, assembly_hours: 0, has_warranty: true, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-04-10', updatedAt: '2026-03-20', note: '', changeLog: [{ version: 'V1.0', date: '2025-04-10', note: '初始创建' }] },
  { id: 'c14', code: 'E-SCREEN-75-V0.1',   name_cn: '75寸显示屏', category: 'COMPONENT', brand: '海信', model: '75H10', specification: '75寸4K显示屏', unit: '台', supplier: '海信', sourcing_type: 'PURCHASED', unit_cost: 4867, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-02-01', updatedAt: '2026-05-20', note: '', changeLog: [{ version: 'V1.0', date: '2025-02-01', note: '初始创建' }] },
  
  { id: 'c15', code: 'E-SMART-METER-V0.1', name_cn: '智能电表', category: 'COMPONENT', brand: '威胜', model: 'SM-01', specification: '智能电表含采集器', unit: '个', supplier: '威胜', sourcing_type: 'PURCHASED', unit_cost: 1770, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-02-01', updatedAt: '2026-05-20', note: '', changeLog: [{ version: 'V1.0', date: '2025-02-01', note: '初始创建' }] },
  
  { id: 'c16', code: 'E-PROG-LASER-V2.0',  name_cn: '智能编程（激光切割/冲床）', category: 'SOFTWARE', brand: '埃斯顿', model: 'PROG-V2', specification: '激光/冲床加工程序', unit: '套', supplier: '埃斯顿', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 265487, design_hours: 0, assembly_hours: 0, has_warranty: true, reviewStatus: 'approved', version: 'V2.0', createdAt: '2025-02-20', updatedAt: '2026-06-12', note: '', changeLog: [{ version: 'V2.0', date: '2025-02-20', note: '初始创建' }] },
  { id: 'c17', code: 'S-PACK-BOX-V1.0',    name_cn: '包装箱', category: 'COMPONENT', brand: '定制', model: 'PKG-01', specification: '定制木箱/含防震', unit: '个', supplier: '定制包装厂', sourcing_type: 'PURCHASED', unit_cost: 65642, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-02-01', updatedAt: '2026-05-20', note: '', changeLog: [{ version: 'V1.0', date: '2025-02-01', note: '初始创建' }] },
  
  { id: 'c18', code: 'H-PM-COST-V1.0',     name_cn: '项目管理', category: 'SERVICE', brand: '', model: '', specification: '项目经理驻场管理', supplier: '', unit: '项', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 137909, design_hours: 0, assembly_hours: 0, has_warranty: true, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-03-10', updatedAt: '2026-05-30', note: '', changeLog: [{ version: 'V1.0', date: '2025-03-10', note: '初始创建' }] },
  { id: 'c19', code: 'H-FIELD-DEBUG-V1.0', name_cn: '安装调试费用', category: 'SERVICE', brand: '', model: '', specification: '现场安装调试', supplier: '', unit: '项', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 150432, design_hours: 0, assembly_hours: 0, has_warranty: true, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-04-20', updatedAt: '2026-06-08', note: '', changeLog: [{ version: 'V1.0', date: '2025-04-20', note: '初始创建' }] },
  { id: 'c20', code: 'H-TRAINING-V1.0',    name_cn: '现场培训', category: 'SERVICE', brand: '', model: '', specification: '操作培训+维护培训', supplier: '', unit: '项', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 30240, design_hours: 0, assembly_hours: 0, has_warranty: true, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-05-15', updatedAt: '2026-04-05', note: '', changeLog: [{ version: 'V1.0', date: '2025-05-15', note: '初始创建' }] },

  { id: 'c21', code: 'L-DESIGN-HRS',       name_cn: '设计工时汇总', category: 'SERVICE', brand: '', model: '', specification: '设备组/集成开发设计工时汇总', supplier: '', unit: '项', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 0, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-02-01', updatedAt: '2026-05-20', note: '', changeLog: [{ version: 'V1.0', date: '2025-02-01', note: '初始创建' }] },
  
  { id: 'c22', code: 'L-ASSEMBLY-HRS',     name_cn: '装配工时汇总', category: 'SERVICE', brand: '', model: '', specification: '设备组/集成开发装配工时汇总', supplier: '', unit: '项', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 0, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-02-01', updatedAt: '2026-05-20', note: '', changeLog: [{ version: 'V1.0', date: '2025-02-01', note: '初始创建' }] },
  
  { id: 'c23', code: 'R-RISK-COST-V1.0',   name_cn: '项目风险费用', category: 'SERVICE', brand: '', model: '', specification: '项目风险费用审批后方可使用', supplier: '', unit: '项', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 0, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-06-01', updatedAt: '2026-01-15', note: '', changeLog: [{ version: 'V1.0', date: '2025-06-01', note: '初始创建' }] },
  { id: 'c24', code: 'M-CONVEYOR-BELT-V0.3', name_cn: '输送带组件', category: 'COMPONENT', brand: '亚德客', model: 'CVB-600', specification: '600mm宽×12m 耐油橡胶', unit: '条', supplier: '亚德客', sourcing_type: 'PURCHASED', unit_cost: 18500, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'draft', version: 'V0.3', createdAt: '2026-06-15', updatedAt: '2026-06-20', note: '', changeLog: [{ version: 'V0.1', date: '2026-06-15', note: '初始创建' }, { version: 'V0.3', date: '2026-06-20', note: '修改规格' }] },
  { id: 'c25', code: 'E-VISION-SYS-V1.0',    name_cn: '视觉检测系统', category: 'SOFTWARE', brand: '海康机器人', model: 'VM-2000', specification: '2000万像素AI视觉，含镜头光源', unit: '套', supplier: '海康机器人', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 185000, design_hours: 0, assembly_hours: 0, has_warranty: true, reviewStatus: 'pending', version: 'V1.0', createdAt: '2026-06-22', updatedAt: '2026-06-25', note: '[新建]', changeLog: [{ version: 'V1.0', date: '2026-06-22', note: '初始创建，待审核' }] },
  { id: 'c26', code: 'M-ROBOT-ARM-V0.1',     name_cn: '六轴协作机器人', category: 'COMPLETE_SET', brand: '埃斯顿', model: 'ER6-700', specification: '6kg负载 / 700mm臂展 / ±0.02mm精度', unit: '台', supplier: '埃斯顿', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 380000, design_hours: 0, assembly_hours: 0, has_warranty: true, reviewStatus: 'draft', version: 'V0.1', createdAt: '2026-06-28', updatedAt: '2026-06-28', note: '', changeLog: [{ version: 'V0.1', date: '2026-06-28', note: '新建' }] },
  { id: 'c27', code: 'C-SENSOR-TEMP-V1.0',   name_cn: '温度传感器', category: 'PART', brand: '欧姆龙', model: 'E52-CA', specification: '热电偶式 -50~200°C', unit: '个', supplier: '欧姆龙', sourcing_type: 'PURCHASED', unit_cost: 850, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-06-01', updatedAt: '2026-04-10', note: '', changeLog: [{ version: 'V1.0', date: '2025-06-01', note: '初始创建' }] },
  { id: 'c28', code: 'C-SENSOR-PROX-V1.0',  name_cn: '接近开关', category: 'PART', brand: '倍福', model: 'PROX-M12', specification: 'M12 电感式 8mm检测距离', unit: '个', supplier: '倍福', sourcing_type: 'PURCHASED', unit_cost: 420, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-06-15', updatedAt: '2026-04-10', note: '', changeLog: [{ version: 'V1.0', date: '2025-06-15', note: '初始创建' }] },
  { id: 'c29', code: 'C-PLC-CONTROL-V2.0',  name_cn: 'PLC 控制系统', category: 'COMPLETE_SET', brand: '西门子', model: 'S7-1500', specification: '含CPU/IO模块/电源/背板', unit: '套', supplier: '西门子', sourcing_type: 'PURCHASED', unit_cost: 95000, design_hours: 0, assembly_hours: 0, has_warranty: true, reviewStatus: 'approved', version: 'V2.0', createdAt: '2025-03-01', updatedAt: '2026-06-01', note: '', changeLog: [{ version: 'V2.0', date: '2025-03-01', note: '初始创建' }] },
  { id: 'c30', code: 'M-AGV-TRANSPORT-V0.2', name_cn: 'AGV 智能运输车', category: 'COMPLETE_SET', brand: '埃斯顿', model: 'AGV-500', specification: '500kg负载 / 激光SLAM导航', unit: '台', supplier: '埃斯顿', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 295000, design_hours: 0, assembly_hours: 0, has_warranty: true, reviewStatus: 'pending', version: 'V0.2', createdAt: '2026-06-25', updatedAt: '2026-06-28', note: '[新建]', changeLog: [{ version: 'V0.2', date: '2026-06-25', note: '新建，待审核' }] },
  { id: 'c31', code: 'C-SERVO-DRIVE-V1.0',  name_cn: '伺服驱动器', category: 'COMPONENT', brand: '埃斯顿', model: 'ProNet-10A', specification: '10A 三相 220V', unit: '台', supplier: '埃斯顿', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 12500, design_hours: 0, assembly_hours: 0, has_warranty: true, reviewStatus: 'approved', version: 'V1.0', createdAt: '2025-04-01', updatedAt: '2026-05-15', note: '', changeLog: [{ version: 'V1.0', date: '2025-04-01', note: '初始创建' }] },
  { id: 'c32', code: 'S-CABLE-HARNESS-V1.0', name_cn: '线束总成', category: 'PART', brand: '定制', model: 'HARNESS-01', specification: '定制线束 含端子/护套 10m', unit: '根', supplier: '定制线束厂', sourcing_type: 'PURCHASED', unit_cost: 3800, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'draft', version: 'V1.0', createdAt: '2026-06-28', updatedAt: '2026-06-28', note: '', changeLog: [{ version: 'V1.0', date: '2026-06-28', note: '新建' }] },
  // — 人工费物料（单元：h，unit_cost = 小时费率）—
  { id: 'c33', code: 'H-LABOR-DESIGN-V1.0',      name_cn: '设计工费', category: 'SERVICE', brand: '', model: '', specification: '设计工时费率', supplier: '', unit: 'h', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 174, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2026-06-30', updatedAt: '2026-06-30', note: '人工费——设计工时', changeLog: [{ version: 'V1.0', date: '2026-06-30', note: '初始创建' }], tags: ['t10-1'] },
  { id: 'c34', code: 'H-LABOR-ASSEMBLY-V1.0',    name_cn: '装配工费', category: 'SERVICE', brand: '', model: '', specification: '装配工时费率', supplier: '', unit: 'h', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 70, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2026-06-30', updatedAt: '2026-06-30', note: '人工费——装配工时', changeLog: [{ version: 'V1.0', date: '2026-06-30', note: '初始创建' }], tags: ['t10-2'] },
  { id: 'c35', code: 'H-LABOR-INSTALL-V1.0',     name_cn: '安装工费', category: 'SERVICE', brand: '', model: '', specification: '安装工时费率', supplier: '', unit: 'h', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 70, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2026-06-30', updatedAt: '2026-06-30', note: '人工费——安装工时', changeLog: [{ version: 'V1.0', date: '2026-06-30', note: '初始创建' }], tags: ['t10-3'] },
  { id: 'c36', code: 'H-LABOR-COMMISSION-V1.0',  name_cn: '调试工费', category: 'SERVICE', brand: '', model: '', specification: '调试工时费率', supplier: '', unit: 'h', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 174, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2026-06-30', updatedAt: '2026-06-30', note: '人工费——调试工时', changeLog: [{ version: 'V1.0', date: '2026-06-30', note: '初始创建' }], tags: ['t10-4'] },
  { id: 'c37', code: 'H-LABOR-TRAIN-V1.0',       name_cn: '培训工费', category: 'SERVICE', brand: '', model: '', specification: '培训工时费率', supplier: '', unit: 'h', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 174, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2026-06-30', updatedAt: '2026-06-30', note: '人工费——培训工时', changeLog: [{ version: 'V1.0', date: '2026-06-30', note: '初始创建' }], tags: ['t10-5'] },
  { id: 'c38', code: 'H-LABOR-ACCOMPANY-V1.0',   name_cn: '陪产工费', category: 'SERVICE', brand: '', model: '', specification: '陪产工时费率', supplier: '', unit: 'h', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 70, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2026-06-30', updatedAt: '2026-06-30', note: '人工费——陪产工时', changeLog: [{ version: 'V1.0', date: '2026-06-30', note: '初始创建' }], tags: ['t10-6'] },
  { id: 'c39', code: 'H-LABOR-PM-V1.0',          name_cn: '项目管理工费', category: 'SERVICE', brand: '', model: '', specification: '项目管理工时费率', supplier: '', unit: 'h', sourcing_type: 'SELF_MANUFACTURED', unit_cost: 200, design_hours: 0, assembly_hours: 0, has_warranty: false, reviewStatus: 'approved', version: 'V1.0', createdAt: '2026-06-30', updatedAt: '2026-06-30', note: '人工费——项目管理工时', changeLog: [{ version: 'V1.0', date: '2026-06-30', note: '初始创建' }], tags: ['t10-7'] },
];

const LABOR_RATES = {
  design: mockComponentDB.find(c => c.tags?.includes('t10-1'))?.unit_cost ?? 174,
  assembly: mockComponentDB.find(c => c.tags?.includes('t10-2'))?.unit_cost ?? 70,
};
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
    design_hours: dh, design_hour_rate: LABOR_RATES.design,
    assembly_hours: ah, assembly_hour_rate: LABOR_RATES.assembly,
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
    design_hour_rate: LABOR_RATES.design,
    assembly_hour_rate: LABOR_RATES.assembly,
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
const projectDeliveryItems: GroupItem[] = [
  makeItem({ item_no: 1, code: 'H-DESIGN-REVIEW', description: '设计会签', unit_cost: LABOR_RATES.design, qty_total: 160, item_type: 'SERVICE', margin_rate: 0.15 }),
  makeItem({ item_no: 2, code: 'H-SITE-INSTALL', description: '现场安装', unit_cost: LABOR_RATES.assembly, qty_total: 640, item_type: 'SERVICE', margin_rate: 0.15 }),
  makeItem({ item_no: 3, code: 'H-SITE-DEBUG', description: '现场调试', unit_cost: LABOR_RATES.design, qty_total: 480, item_type: 'SERVICE', margin_rate: 0.15 }),
  makeItem({ item_no: 4, code: 'H-SITE-TRAIN', description: '现场培训', unit_cost: LABOR_RATES.design, qty_total: 80, item_type: 'SERVICE', margin_rate: 0.15 }),
  makeItem({ item_no: 5, code: 'H-SITE-PROD', description: '现场陪产', unit_cost: LABOR_RATES.design, qty_total: 960, item_type: 'SERVICE', margin_rate: 0.15 }),
  makeItem({ item_no: 6, code: 'H-PM', description: '项目管理', unit_cost: LABOR_RATES.design, qty_total: 640, item_type: 'SERVICE', margin_rate: 0.15 }),
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
    discounted_price: 0,
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
  { id: 'opp-1', salesNo: 'A2026-01-001-S', clientName: '南京埃斯顿智能工业集团股份有限公司', projectName: '双料垛料库 MS3015-13*16-2', amount: 11800000, stage: '投标', winRate: 72, status: '过程中', salesman: '张明', competitor: '西门子', expectedCloseDate: '2026-03-15', notes: '', createdAt: '2026-01-10', updatedAt: '2026-06-20', quotationId: 'proj-001', reasons: '',
    blueTable: {
      vetoBudget: 'ok', timelinePlan: '客户预计 3 月底定标', timelineOption: 'optimistic',
      roles: [
        { id: 'bt-r1', roleType: 'EB', name: '张总', influence: 'high', influenceWeight: 10, support: 3, demandFit: 4, relationship: 3 },
        { id: 'bt-r2', roleType: 'UB', name: '李工', influence: 'medium', influenceWeight: 3, support: 2, demandFit: 4, relationship: 2 },
        { id: 'bt-r3', roleType: 'TB', name: '王工', influence: 'medium', influenceWeight: 3, support: -1, demandFit: 3, relationship: 2 },
        { id: 'bt-r4', roleType: 'COACH', name: '刘经理', influence: 'medium', influenceWeight: 3, support: 4, demandFit: 4, relationship: 4 },
      ],
      pricing: 'competitive', positioning: 4, reactionMode: 'EK',
      strategy: '1. 约见 TB 王工进行技术交流，消除顾虑\n2. 安排客户参观标杆案例',
      targets: [{ roleId: 'bt-r3', targetSupport: 2 }],
      updatedAt: '2026-06-18',
    } },
  { id: 'opp-2', salesNo: 'A2026-01-002-S', clientName: '徐工集团', projectName: '智能仓储系统升级', amount: 8500000, stage: '议价', winRate: 80, status: '过程中', salesman: '李华', competitor: '倍福、西门子、库卡', expectedCloseDate: '2026-04-01', notes: '客户对价格比较敏感', createdAt: '2026-01-15', updatedAt: '2026-06-18', quotationId: 'proj-002', reasons: '',
    blueTable: {
      vetoBudget: 'ok', timelinePlan: '客户 4 月要完成预算审批，6 月前定标', timelineOption: 'optimistic',
      roles: [
        { id: 'bt2-r1', roleType: 'EB', name: '王部长', influence: 'high', influenceWeight: 10, support: 4, demandFit: 5, relationship: 4 },
        { id: 'bt2-r2', roleType: 'UB', name: '陈经理', influence: 'medium', influenceWeight: 3, support: 3, demandFit: 4, relationship: 3 },
        { id: 'bt2-r3', roleType: 'TB', name: '刘工', influence: 'low', influenceWeight: 1, support: 1, demandFit: 3, relationship: 2 },
        { id: 'bt2-r4', roleType: 'COACH', name: '周主任', influence: 'medium', influenceWeight: 3, support: 5, demandFit: 5, relationship: 5 },
      ],
      pricing: 'competitive', positioning: 3, reactionMode: 'T',
      strategy: '1. 利用 Coach 获取竞对报价信息\n2. 针对价格敏感点优化方案成本',
      targets: [{ roleId: 'bt2-r3', targetSupport: 3 }],
      updatedAt: '2026-06-15',
    } },
  { id: 'opp-3', salesNo: 'A2025-11-001-S', clientName: '三一重工', projectName: '挖掘机智能产线', amount: 15200000, stage: '中标', winRate: 100, status: '赢', salesman: '王芳', competitor: '库卡', expectedCloseDate: '2026-02-28', notes: '已签订合同', createdAt: '2025-11-20', updatedAt: '2026-02-28', quotationId: 'proj-003' , reasons: '竞对:价格:主机成本,解决方案;竞对:客户关系' },
  { id: 'opp-4', salesNo: 'A2026-06-001-S', clientName: '中联重科', projectName: '高空作业平台装配线', amount: 3200000, stage: '信息', winRate: 15, status: '过程中', salesman: '张明', competitor: '', expectedCloseDate: '2026-08-01', notes: '初步接触阶段', createdAt: '2026-06-01', updatedAt: '2026-06-15', reasons: '' },
  { id: 'opp-5', salesNo: 'A2026-03-001-S', clientName: '比亚迪汽车', projectName: '电池 pack 自动化产线', amount: 22000000, stage: '机会', winRate: 45, status: '冻结', salesman: '李华', competitor: '', expectedCloseDate: '2026-09-30', notes: '客户预算审批暂停', createdAt: '2026-03-01', updatedAt: '2026-06-10', reasons: '' },
  { id: 'opp-6', salesNo: 'A2026-04-001-S', clientName: '格力电器', projectName: '空调控制器 SMT 线', amount: 6800000, stage: '线索', winRate: 21, status: '过程中', salesman: '王芳', competitor: '西门子、倍福', expectedCloseDate: '2026-07-15', notes: '已发送初步方案', createdAt: '2026-04-10', updatedAt: '2026-06-12', reasons: '',
    blueTable: {
      vetoBudget: 'possible', timelinePlan: '客户 7 月底前要完成供应商筛选', timelineOption: 'optimistic',
      roles: [
        { id: 'bt6-r1', roleType: 'EB', name: '何经理', influence: 'high', influenceWeight: 10, support: 1, demandFit: 3, relationship: 2 },
        { id: 'bt6-r2', roleType: 'UB', name: '杨工', influence: 'medium', influenceWeight: 3, support: 0, demandFit: 2, relationship: 2 },
        { id: 'bt6-r3', roleType: 'TB', name: '', influence: 'medium', influenceWeight: 3, support: -1, demandFit: 2, relationship: 1 },
        { id: 'bt6-r4', roleType: 'COACH', name: '', influence: 'low', influenceWeight: 1, support: 2, demandFit: 3, relationship: 2 },
      ],
      pricing: 'neutral', positioning: 5, reactionMode: 'EK',
      strategy: '1. 进一步了解客户预算情况\n2. 寻找内部 Coach',
      targets: [],
      updatedAt: '2026-06-10',
    } },
  { id: 'opp-7', salesNo: 'A2025-12-001-S', clientName: '海康威视', projectName: '摄像头组装测试线', amount: 9600000, stage: '投标', winRate: 50, status: '输', salesman: '张明', competitor: '西门子', expectedCloseDate: '2026-03-01', notes: '丢单(竞对):客户关系 竞争对手与客户有长期合作', createdAt: '2025-12-01', updatedAt: '2026-03-01', quotationId: 'proj-004' , reasons: '竞对:价格:主机成本;竞对:客户关系' },
  { id: 'opp-8', salesNo: 'A2026-02-001-S', clientName: '宁德时代', projectName: '模组 PACK 线二期', amount: 18000000, stage: '机会', winRate: 48, status: '过程中', salesman: '陈伟', competitor: '库卡', expectedCloseDate: '2026-06-30', notes: '二期扩建项目', createdAt: '2026-02-15', updatedAt: '2026-06-19', reasons: '',
    blueTable: {
      vetoBudget: 'ok', timelinePlan: '客户 6 月底定标，交付周期需在 5 个月内', timelineOption: 'optimistic',
      roles: [
        { id: 'bt8-r1', roleType: 'EB', name: '林总', influence: 'high', influenceWeight: 10, support: 2, demandFit: 3, relationship: 3 },
        { id: 'bt8-r2', roleType: 'UB', name: '叶工', influence: 'medium', influenceWeight: 3, support: 1, demandFit: 3, relationship: 2 },
        { id: 'bt8-r3', roleType: 'TB', name: '陈工', influence: 'medium', influenceWeight: 3, support: -2, demandFit: 2, relationship: 1 },
      ],
      pricing: 'slightly_weak', positioning: 6, reactionMode: 'EK',
      strategy: '1. 了解 TB 陈工的技术顾虑\n2. 安排技术交流会展示方案优势',
      targets: [{ roleId: 'bt8-r3', targetSupport: 1 }],
      updatedAt: '2026-06-10',
    } },
  { id: 'opp-9', salesNo: 'A2026-05-001-S', clientName: '美的集团', projectName: '中央空调智能产线', amount: 13500000, stage: '议价', winRate: 70, status: '输', salesman: '李华', competitor: '倍福', expectedCloseDate: '2026-05-30', notes: '取消(客户):缩减预算 客户年度预算缩减30%', createdAt: '2026-03-15', updatedAt: '2026-05-30' , reasons: '取消:预算缩减;取消:需求变更' },
  { id: 'opp-10', salesNo: 'A2026-04-002-S', clientName: '富士康', projectName: '电子组装自动化线', amount: 7800000, stage: '机会', winRate: 40, status: '输', salesman: '王芳', competitor: '西门子', expectedCloseDate: '2026-04-15', notes: '放弃(我方):利润过低 毛利率不足12%', createdAt: '2026-02-01', updatedAt: '2026-04-15' , reasons: '放弃:利润过低' },
  { id: 'opp-11', salesNo: 'A2026-06-002-S', clientName: '上汽集团', projectName: '动力电池智能产线', amount: 16500000, stage: '投标', winRate: 50, status: '输', salesman: '陈伟', competitor: '西门子', expectedCloseDate: '2026-06-15', notes: '丢单(竞对):价格:产品成本 竞争对手设备报价低30%', createdAt: '2026-04-01', updatedAt: '2026-06-15' , reasons: '竞对:价格:解决方案;竞对:技术方案:痛点发掘;竞对:交货期' },
  { id: 'opp-12', salesNo: 'A2026-05-002-S', clientName: '中兴通讯', projectName: '5G基站组装线', amount: 9200000, stage: '机会', winRate: 35, status: '输', salesman: '李华', competitor: '倍福', expectedCloseDate: '2026-05-20', notes: '取消(客户):需求变更 客户转向购买标准设备', createdAt: '2026-03-10', updatedAt: '2026-05-20' , reasons: '取消:需求变更' },

  { id: 'opp-13', salesNo: 'A2026-07-001-S', clientName: '一汽大众', projectName: '焊装线自动化改造', amount: 21000000, stage: '中标', winRate: 100, status: '赢', salesman: '张明', competitor: '西门子、倍福', expectedCloseDate: '2026-07-15', notes: '技术方案胜出', createdAt: '2026-05-01', updatedAt: '2026-07-15', reasons: '竞对:价格:主机成本,解决方案;竞对:客户关系', quotationId: 'proj-006' },
  { id: 'opp-14', salesNo: 'A2026-07-002-S', clientName: '华为技术', projectName: '数据中心智能温控系统', amount: 28000000, stage: '中标', winRate: 100, status: '赢', salesman: '李华', competitor: '施耐德', expectedCloseDate: '2026-07-20', notes: '品牌优势', createdAt: '2026-04-15', updatedAt: '2026-07-20', reasons: '竞对:技术方案:痛点发掘;竞对:品牌', quotationId: 'proj-007' },
  { id: 'opp-15', salesNo: 'A2026-06-003-S', clientName: '中国中车', projectName: '转向架智能生产线', amount: 19500000, stage: '中标', winRate: 100, status: '赢', salesman: '王芳', competitor: 'ABB', expectedCloseDate: '2026-06-30', notes: '', createdAt: '2026-03-20', updatedAt: '2026-06-30', reasons: '竞对:价格:主机成本;竞对:技术方案:痛点发掘', quotationId: 'proj-008' },
  { id: 'opp-16', salesNo: 'A2026-07-003-S', clientName: '万华化学', projectName: '化工仓储自动化升级', amount: 12500000, stage: '中标', winRate: 100, status: '赢', salesman: '陈伟', competitor: '罗克韦尔', expectedCloseDate: '2026-07-10', notes: '', createdAt: '2026-04-01', updatedAt: '2026-07-10', reasons: '竞对:客户关系', quotationId: 'proj-009' },
  // 以下为补充月度销售额数据（FY2526 不同月份的赢单）
  { id: 'opp-17', salesNo: 'A2025-10-001-S', clientName: '格力电器', projectName: '空调压缩机装配线', amount: 16800000, stage: '中标', winRate: 100, status: '赢', salesman: '李华', competitor: '西门子', expectedCloseDate: '2025-10-30', notes: '', createdAt: '2025-08-15', updatedAt: '2025-10-25', reasons: '竞对:技术方案:痛点发掘', quotationId: 'proj-010' },
  { id: 'opp-18', salesNo: 'A2025-12-002-S', clientName: '宝钢股份', projectName: '冷轧板智能仓储系统', amount: 22300000, stage: '中标', winRate: 100, status: '赢', salesman: '王芳', competitor: 'ABB', expectedCloseDate: '2025-12-20', notes: '', createdAt: '2025-10-01', updatedAt: '2025-12-15', reasons: '竞对:价格:解决方案', quotationId: 'proj-011' },
  { id: 'opp-19', salesNo: 'A2026-04-002-S', clientName: '隆基绿能', projectName: '光伏组件自动包装线', amount: 14200000, stage: '中标', winRate: 100, status: '赢', salesman: '张明', competitor: '倍福', expectedCloseDate: '2026-04-25', notes: '', createdAt: '2026-02-01', updatedAt: '2026-04-20', reasons: '竞对:客户关系;竞对:品牌', quotationId: 'proj-012' },
  { id: 'opp-20', salesNo: 'A2026-05-002-S', clientName: '海尔智家', projectName: '洗碗机总装线升级', amount: 18600000, stage: '中标', winRate: 100, status: '赢', salesman: '陈伟', competitor: '库卡', expectedCloseDate: '2026-05-28', notes: '', createdAt: '2026-03-10', updatedAt: '2026-05-25', reasons: '竞对:价格:主机成本', quotationId: 'proj-013' },
  // ── FY2627 机会（2026-07 ~ ）──
  { id: 'opp-21', salesNo: 'A2026-08-001-S', clientName: '中联重科', projectName: '塔机智能装配线', amount: 16800000, stage: '信息', winRate: 20, status: '过程中', salesman: '张明', competitor: '西门子', expectedCloseDate: '2026-10-30', notes: '前期接洽中', createdAt: '2026-07-02', updatedAt: '2026-07-02', reasons: '' },
  { id: 'opp-22', salesNo: 'A2026-08-002-S', clientName: '京东方', projectName: '显示面板自动化检测线', amount: 22000000, stage: '线索', winRate: 30, status: '过程中', salesman: '王芳', competitor: '基恩士', expectedCloseDate: '2026-11-15', notes: '技术交流完成，待方案', createdAt: '2026-07-05', updatedAt: '2026-07-06', reasons: '' },
  { id: 'opp-23', salesNo: 'A2026-08-003-S', clientName: '药明康德', projectName: '医药仓储自动化系统', amount: 9500000, stage: '信息', winRate: 15, status: '过程中', salesman: '李华', competitor: '德马泰克', expectedCloseDate: '2026-09-30', notes: '初步需求沟通', createdAt: '2026-07-10', updatedAt: '2026-07-10', reasons: '' },
  { id: 'opp-24', salesNo: 'A2026-08-004-S', clientName: '中船重工', projectName: '船用钢板预处理线', amount: 25000000, stage: '机会', winRate: 45, status: '过程中', salesman: '陈伟', competitor: 'ABB', expectedCloseDate: '2026-12-20', notes: '已完成现场勘查', createdAt: '2026-07-15', updatedAt: '2026-07-16', reasons: '' },
];

// ===== 报价摘要 Mock =====
export const mockQuotationSummaries: QuotationSummary[] = [
  { id: 'proj-001', salesNo: 'A2026-01-001-S', clientName: '南京埃斯顿智能工业集团股份有限公司', projectName: '双料垛料库 MS3015-13*16-2', versionNo: 'V1.0', status: 'draft', amount: 11800000, totalCost: 9200000, profitRate: 22.0, createdAt: '2026-01-15', updatedAt: '2026-06-22', opportunityId: 'opp-1' },
  { id: 'proj-002', salesNo: 'A2026-01-002-S', clientName: '徐工集团', projectName: '智能仓储系统升级', versionNo: 'V1.2', status: 'pending', amount: 8500000, totalCost: 6800000, profitRate: 20.0, createdAt: '2026-01-20', updatedAt: '2026-06-20', opportunityId: 'opp-2' },
  { id: 'proj-003', salesNo: 'A2025-11-001-S', clientName: '三一重工', projectName: '挖掘机智能产线', versionNo: 'V2.0', status: 'approved', amount: 15200000, totalCost: 11800000, profitRate: 22.4, createdAt: '2025-11-15', updatedAt: '2026-02-25', opportunityId: 'opp-3' },
  { id: 'proj-004', salesNo: 'A2025-12-001-S', clientName: '海康威视', projectName: '摄像头组装测试线', versionNo: 'V1.1', status: 'rejected', amount: 9600000, totalCost: 8200000, profitRate: 14.6, createdAt: '2025-12-10', updatedAt: '2026-02-28', opportunityId: 'opp-7' },
  { id: 'proj-005', salesNo: 'A2026-03-001-S', clientName: '比亚迪汽车', projectName: '电池 pack 自动化产线', versionNo: 'V1.0', status: 'pending', amount: 22000000, totalCost: 18500000, profitRate: 15.9, createdAt: '2026-03-05', updatedAt: '2026-06-10', opportunityId: 'opp-5' },
  { id: 'proj-006', salesNo: 'A2026-07-001-S', clientName: '一汽大众', projectName: '焊装线自动化改造', versionNo: 'V1.0', status: 'approved', amount: 21000000, totalCost: 16800000, profitRate: 20.0, createdAt: '2026-06-01', updatedAt: '2026-07-15', opportunityId: 'opp-13' },
  { id: 'proj-007', salesNo: 'A2026-07-002-S', clientName: '华为技术', projectName: '数据中心智能温控系统', versionNo: 'V1.0', status: 'approved', amount: 28000000, totalCost: 21840000, profitRate: 22.0, createdAt: '2026-06-10', updatedAt: '2026-07-20', opportunityId: 'opp-14' },
  { id: 'proj-008', salesNo: 'A2026-06-003-S', clientName: '中国中车', projectName: '转向架智能生产线', versionNo: 'V1.0', status: 'approved', amount: 19500000, totalCost: 15600000, profitRate: 20.0, createdAt: '2026-05-01', updatedAt: '2026-06-30', opportunityId: 'opp-15' },
  { id: 'proj-009', salesNo: 'A2026-07-003-S', clientName: '万华化学', projectName: '化工仓储自动化升级', versionNo: 'V1.0', status: 'approved', amount: 12500000, totalCost: 10000000, profitRate: 20.0, createdAt: '2026-05-15', updatedAt: '2026-07-10', opportunityId: 'opp-16' },
  { id: 'proj-010', salesNo: 'A2025-10-001-S', clientName: '格力电器', projectName: '空调压缩机装配线', versionNo: 'V1.0', status: 'approved', amount: 16800000, totalCost: 13440000, profitRate: 20.0, createdAt: '2025-09-01', updatedAt: '2025-10-25', opportunityId: 'opp-17' },
  { id: 'proj-011', salesNo: 'A2025-12-002-S', clientName: '宝钢股份', projectName: '冷轧板智能仓储系统', versionNo: 'V1.0', status: 'approved', amount: 22300000, totalCost: 17840000, profitRate: 20.0, createdAt: '2025-11-01', updatedAt: '2025-12-15', opportunityId: 'opp-18' },
  { id: 'proj-012', salesNo: 'A2026-04-001-S', clientName: '隆基绿能', projectName: '光伏组件自动包装线', versionNo: 'V1.0', status: 'approved', amount: 14200000, totalCost: 11360000, profitRate: 20.0, createdAt: '2026-03-01', updatedAt: '2026-04-20', opportunityId: 'opp-19' },
  { id: 'proj-013', salesNo: 'A2026-05-002-S', clientName: '海尔智家', projectName: '洗碗机总装线升级', versionNo: 'V1.0', status: 'approved', amount: 18600000, totalCost: 14880000, profitRate: 20.0, createdAt: '2026-04-01', updatedAt: '2026-05-25', opportunityId: 'opp-20' },
];

// ===== 审批请求 Mock =====
export const mockApprovalRequests: ApprovalRequest[] = [
  // ── 报价审批 ──
  { id: 'apr-1', approvalType: 'quotation', quotationId: 'proj-002', salesNo: 'A2026-01-002-S', clientName: '徐工集团', projectName: '智能仓储系统升级', amount: 8500000, totalCost: 6800000, profitRate: 20.0, gp3: 0.165, submitter: '李华', submitTime: '2026-06-20', status: 'pending', records: [] },
  { id: 'apr-2', approvalType: 'quotation', quotationId: 'proj-001', salesNo: 'A2026-01-001-S', clientName: '南京埃斯顿智能工业集团股份有限公司', projectName: '双料垛料库 MS3015-13*16-2', amount: 11800000, totalCost: 9200000, profitRate: 22.0, gp3: 0.185, submitter: '张明', submitTime: '2026-06-18', status: 'approved', records: [{ id: 'rec-1', reviewer: '刘总监', action: 'approved', comment: '毛利率达标，同意', createdAt: '2026-06-19' }] },
  { id: 'apr-3', approvalType: 'quotation', quotationId: 'proj-004', salesNo: 'A2025-12-001-S', clientName: '海康威视', projectName: '摄像头组装测试线', amount: 9600000, totalCost: 8200000, profitRate: 14.6, gp3: 0.128, submitter: '张明', submitTime: '2026-02-26', status: 'rejected', records: [{ id: 'rec-2', reviewer: '刘总监', action: 'rejected', comment: 'GP3 仅 12.8%，低于 15% 红线，请重新核算成本或调整报价', createdAt: '2026-02-27' }] },
  { id: 'apr-4', approvalType: 'quotation', quotationId: 'proj-005', salesNo: 'A2026-03-001-S', clientName: '比亚迪汽车', projectName: '电池 pack 自动化产线', amount: 22000000, totalCost: 18500000, profitRate: 15.9, gp3: 0.138, submitter: '陈伟', submitTime: '2026-06-10', status: 'pending', records: [] },
  { id: 'apr-5', approvalType: 'quotation', quotationId: 'proj-003', salesNo: 'A2025-11-001-S', clientName: '三一重工', projectName: '挖掘机智能产线', amount: 15200000, totalCost: 11800000, profitRate: 22.4, gp3: 0.195, submitter: '王芳', submitTime: '2026-02-20', status: 'approved', records: [{ id: 'rec-3', reviewer: '刘总监', action: 'approved', comment: '方案成熟，报价合理', createdAt: '2026-02-22' }] },
  // ── 交付实施计划审批 ──
  { id: 'apr-plan-1', approvalType: 'plan', quotationId: 'proj-003', deliveryId: 'del-1', salesNo: 'A2026-003-E', clientName: '三一重工', projectName: '挖掘机智能产线', amount: 15200000, totalCost: 0, profitRate: 0, gp3: 0, submitter: '方案经理', submitTime: '2026-06-25', status: 'pending', records: [] },
  // ── 交付成本对比审批 ──
  { id: 'apr-cost-1', approvalType: 'cost', quotationId: 'proj-001', deliveryId: 'del-2', salesNo: 'A2026-001-E', clientName: '南京埃斯顿智能工业集团股份有限公司', projectName: '双料垛料库 MS3015-13*16-2', amount: 11800000, totalCost: 9580000, profitRate: 0, gp3: 0, submitter: '交付经理', submitTime: '2026-06-28', status: 'pending', records: [] },
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
  makeNode(3, 5, { plannedStartDate: '2026-05-05', plannedEndDate: '2026-05-05', actualDate: '2026-05-05', status: 'completed' }),
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
    id: 'del-1', opportunityId: 'opp-3', salesNo: 'A2026-003-E',
    clientName: '三一重工', projectName: '挖掘机智能产线',
    contractAmount: 15200000, quotationId: 'proj-003',
    status: '进行中', nodes: nodesProject1,
    planStatus: 'approved', planApproval: { reviewer: '刘总监', action: 'approved', comment: '计划合理，同意', createdAt: '2026-03-02' },
    costStatus: 'draft',
    createdAt: '2026-03-05', updatedAt: '2026-06-20',
  },
  {
    id: 'del-2', opportunityId: 'opp-1', salesNo: 'A2026-001-E',
    clientName: '南京埃斯顿智能工业集团股份有限公司', projectName: '双料垛料库 MS3015-13*16-2',
    contractAmount: 11800000, quotationId: 'proj-001',
    status: '已完成', nodes: nodesProject2,
    planStatus: 'approved', planApproval: { reviewer: '刘总监', action: 'approved', comment: '同意', createdAt: '2026-01-13' },
    costStatus: 'approved', costApproval: { reviewer: '刘总监', action: 'approved', comment: '成本控制在合理范围内', createdAt: '2026-06-30' },
    totalActualCost: 9580000,
    createdAt: '2026-01-12', updatedAt: '2026-06-28',
  },
  {
    id: 'del-3', opportunityId: 'opp-8', salesNo: 'A2026-008-E',
    clientName: '宁德时代', projectName: '模组 PACK 线二期',
    contractAmount: 18000000,
    status: '已延期', nodes: nodesProject3,
    planStatus: 'pending',
    costStatus: 'draft',
    createdAt: '2026-04-03', updatedAt: '2026-06-15',
  },
];

// ===== 客户管理 Mock =====
export const mockClients: Client[] = [
  {
    id: 'cl-1', code: 'ESD-2026-001', name: '南京埃斯顿智能工业集团股份有限公司',
    type: 'enterprise',
    industry: '工业自动化', region: '东区', salesman: '张明', creditLevel: 'A', grade: 'A',
    createdAt: '2025-06-01',
    contacts: [
      { id: 'con-1-1', name: '张总', position: '采购总监', phone: '13800001111', email: 'zhang@estun.cn', decisionRole: '高层', superior: '' },
      { id: 'con-1-2', name: '李工', position: '技术经理', phone: '13800001112', email: 'li@estun.cn', decisionRole: '技术', superior: '张总' },
    ],
    history: [
      { id: 'hist-1-1', projectName: '双料垛料库 MS3015-13*16-2', salesNo: 'A2026-01-001', amount: 11800000, status: '输', date: '2026-06-20' },
      { id: 'hist-1-2', projectName: '智能仓储系统升级', salesNo: 'A2025-08-002', amount: 7200000, status: '赢', date: '2025-09-15' },
    ],
  },
  {
    id: 'cl-2', code: 'XCMG-2026-001', name: '徐工集团',
    type: 'enterprise',
    industry: '工程机械', region: '东区', salesman: '李华', creditLevel: 'A', grade: 'A',
    createdAt: '2026-01-10',
    contacts: [
      { id: 'con-2-1', name: '王部长', position: '设备部部长', phone: '13900002221', email: 'wang@xcmg.com', decisionRole: '使用', superior: '' },
      { id: 'con-2-2', name: '陈经理', position: '商务经理', phone: '13900002222', email: 'chen@xcmg.com', decisionRole: '商务', superior: '王部长' },
      { id: 'con-2-3', name: '刘工', position: '电气主管', phone: '13900002223', email: 'liu@xcmg.com', decisionRole: '技术', superior: '王部长' },
    ],
    history: [
      { id: 'hist-2-1', projectName: '智能仓储系统升级', salesNo: 'A2026-01-002', amount: 8500000, status: '输', date: '2026-06-18' },
    ],
  },
  {
    id: 'cl-3', code: 'SANY-2025-001', name: '三一重工',
    type: 'enterprise',
    industry: '工程机械', region: '东区', salesman: '王芳', creditLevel: 'A', grade: 'A',
    createdAt: '2025-08-15',
    contacts: [
      { id: 'con-3-1', name: '赵总', position: '生产副总', phone: '13700003331', email: 'zhao@sany.com.cn', decisionRole: '高层', superior: '' },
      { id: 'con-3-2', name: '周工', position: '自动化科长', phone: '13700003332', email: 'zhou@sany.com.cn', decisionRole: '技术', superior: '赵总' },
    ],
    history: [
      { id: 'hist-3-1', projectName: '挖掘机智能产线', salesNo: 'A2025-11-001', amount: 15200000, status: '赢', date: '2026-02-28' },
      { id: 'hist-3-2', projectName: '焊接线自动化改造', salesNo: 'A2025-06-003', amount: 9800000, status: '赢', date: '2025-08-20' },
    ],
  },
  {
    id: 'cl-4', code: 'BYD-2026-001', name: '比亚迪汽车',
    type: 'enterprise',
    industry: '新能源汽车', region: '南区', salesman: '李华', creditLevel: 'B', grade: 'A',
    createdAt: '2026-03-01',
    contacts: [
      { id: 'con-4-1', name: '吴经理', position: '采购经理', phone: '13600004441', email: 'wu@byd.com', decisionRole: '商务', superior: '' },
    ],
    history: [
      { id: 'hist-4-1', projectName: '电池 pack 自动化产线', salesNo: 'A2026-03-001', amount: 22000000, status: '冻结', date: '2026-06-10' },
    ],
  },
  {
    id: 'cl-5', code: 'HIK-2025-001', name: '海康威视',
    type: 'enterprise',
    industry: '安防/物联网', region: '东区', salesman: '张明', creditLevel: 'A', grade: 'B',
    createdAt: '2025-09-01',
    contacts: [
      { id: 'con-5-1', name: '孙总', position: '运营总监', phone: '13500005551', email: 'sun@hikvision.com', decisionRole: '高层', superior: '' },
      { id: 'con-5-2', name: '郑工', position: '设备主管', phone: '13500005552', email: 'zheng@hikvision.com', decisionRole: '使用', superior: '孙总' },
      { id: 'con-5-3', name: '黄经理', position: '采购经理', phone: '13500005553', email: 'huang@hikvision.com', decisionRole: '商务', superior: '孙总' },
    ],
    history: [
      { id: 'hist-5-1', projectName: '摄像头组装测试线', salesNo: 'A2025-12-001', amount: 9600000, status: '输', date: '2026-03-01' },
    ],
  },
  {
    id: 'cl-6', code: 'CATL-2026-001', name: '宁德时代',
    type: 'enterprise',
    industry: '新能源电池', region: '东区', salesman: '陈伟', creditLevel: 'A', grade: 'A',
    createdAt: '2026-02-10',
    contacts: [
      { id: 'con-6-1', name: '林总', position: '生产总监', phone: '13400006661', email: 'lin@catl.com', decisionRole: '高层', superior: '' },
      { id: 'con-6-2', name: '叶工', position: '技术主管', phone: '13400006662', email: 'ye@catl.com', decisionRole: '技术', superior: '林总' },
    ],
    history: [
      { id: 'hist-6-1', projectName: '模组 PACK 线二期', salesNo: 'A2026-02-001', amount: 18000000, status: '输', date: '2026-06-19' },
    ],
  },
  {
    id: 'cl-7', code: 'MIDE-2026-001', name: '美的集团',
    type: 'enterprise',
    industry: '家电制造', region: '南区', salesman: '李华', creditLevel: 'B', grade: 'B',
    createdAt: '2026-02-20',
    contacts: [
      { id: 'con-7-1', name: '何经理', position: '采购经理', phone: '13300007771', email: 'he@midea.com', decisionRole: '商务', superior: '' },
      { id: 'con-7-2', name: '杨工', position: '自动化工程师', phone: '13300007772', email: 'yang@midea.com', decisionRole: '技术', superior: '何经理' },
    ],
    history: [
      { id: 'hist-7-1', projectName: '中央空调智能产线', salesNo: 'A2026-05-001', amount: 13500000, status: '输', date: '2026-05-30' },
    ],
  },
  {
    id: 'cl-8', code: 'FAW-2026-001', name: '一汽大众',
    type: 'enterprise',
    industry: '汽车制造', region: '北区', salesman: '张明', creditLevel: 'A', grade: 'A',
    createdAt: '2026-04-01',
    contacts: [
      { id: 'con-8-1', name: '马总', position: '采购总监', phone: '13200008881', email: 'ma@faw-vw.com', decisionRole: '高层', superior: '' },
    ],
    history: [
      { id: 'hist-8-1', projectName: '焊装线自动化改造', salesNo: 'A2026-07-001', amount: 21000000, status: '赢', date: '2026-07-15' },
    ],
  },
  // ---- 子公司 ----
  {
    id: 'cl-3-1', code: 'SANY-2026-002', name: '三一重装', type: 'subsidiary', parentId: 'cl-3',
    industry: '工程机械', region: '北区', salesman: '王芳', creditLevel: 'A', grade: 'B',
    createdAt: '2026-01-15',
    contacts: [
      { id: 'con-3-1-1', name: '高经理', position: '采购经理', phone: '13700003341', email: 'gao@sanyzz.com', decisionRole: '商务', superior: '' },
    ],
    history: [
      { id: 'hist-3-1-1', projectName: '矿用设备智能焊接线', salesNo: 'A2026-03-005', amount: 6800000, status: '赢', date: '2026-05-10' },
    ],
  },
  {
    id: 'cl-3-2', code: 'SANY-2026-003', name: '三一筑工', type: 'subsidiary', parentId: 'cl-3',
    industry: '工程机械', region: '东区', salesman: '王芳', creditLevel: 'B', grade: 'B',
    createdAt: '2026-02-01',
    contacts: [
      { id: 'con-3-2-1', name: '罗总', position: '设备总监', phone: '13700003351', email: 'luo@sanyzg.com', decisionRole: '高层', superior: '' },
      { id: 'con-3-2-2', name: '谭工', position: '电气工程师', phone: '13700003352', email: 'tan@sanyzg.com', decisionRole: '技术', superior: '' },
    ],
    history: [],
  },
  {
    id: 'cl-7-1', code: 'MIDE-2026-002', name: '美的暖通', type: 'subsidiary', parentId: 'cl-7',
    industry: '家电制造', region: '东区', salesman: '王芳', creditLevel: 'B', grade: 'B',
    createdAt: '2026-03-10',
    contacts: [
      { id: 'con-7-1-1', name: '秦经理', position: '采购主管', phone: '13300007781', email: 'qin@midea-nt.com', decisionRole: '商务', superior: '' },
    ],
    history: [],
  },
  {
    id: 'cl-7-2', code: 'MIDE-2026-003', name: '美的制冷', type: 'subsidiary', parentId: 'cl-7',
    industry: '家电制造', region: '南区', salesman: '李华', creditLevel: 'A', grade: 'A',
    createdAt: '2026-03-15',
    contacts: [
      { id: 'con-7-2-1', name: '梁工', position: '设备主管', phone: '13300007791', email: 'liang@midea-zl.com', decisionRole: '技术', superior: '' },
      { id: 'con-7-2-2', name: '邓经理', position: '生产经理', phone: '13300007792', email: 'deng@midea-zl.com', decisionRole: '使用', superior: '' },
    ],
    history: [],
  },

];