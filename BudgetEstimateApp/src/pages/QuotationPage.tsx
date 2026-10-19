import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Button, message, Modal, ConfigProvider, Spin } from 'antd';
import { PlusOutlined, DownloadOutlined, SaveOutlined, SendOutlined, CheckOutlined, CloseOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../utils/authContext';
import ProjectHeader from '../components/ProjectHeader';
import GroupCard from '../components/GroupCard';
import SummarySection from '../components/SummarySection';
import { componentService } from '../services/componentService';
import { quotationService } from '../services/quotationService';
import { opportunityService } from '../services/opportunityService';
import { approvalService } from '../services/approvalService';
import { clientService } from '../services/clientService';
import type { Group, GroupItem, Project, ProjectVersion, Component, Client } from '../types';
import { calcProjectSummary, calcDirectCost, calcItemPrices, rateToPercent, formatMoney, type ProjectSummary } from '../utils/calculations';
import { clearCache } from '../utils/api';
import { projectService } from '../services/projectService';
import IconButton from '../components/IconButton';
import { COLORS } from '../styles/colors';
import { uuid } from '../utils/uuid';
import { todayBeijing } from '../utils/timeFormat';
import { reviewStatusForSave } from '../utils/quotationStatus';
import { exportHtmlTable, escapeHtml } from '../utils/exportToExcel';
import { DEFAULT_DESIGN_HOURLY_RATE, DEFAULT_ASSEMBLY_HOURLY_RATE, TAX_RATE, LIST_LIMIT } from '../utils/constants';
import { STATUS_CONFIG } from '../components/material/materialConstants';


/** 生成销售编号占位符：A{年份}-{月份}-{3位流水}-S（销售阶段）
 * 与后端 /opportunities/next-sales-no（A{YYYY}-{MM}-{NNN}-S）及
 * compressNo 正则 /^A\d{4}-\d{2}-\d{3}-(.)/、confirmDeliver 后缀替换契约统一
 * 仅用于新建报价草稿的项目占位；正式机会创建时以后端 /next-sales-no 编号为准（会替换此占位符）
 * 转交付后后缀变为 -E，以前缀关联 */
function generateSalesNo(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 900) + 100).padStart(3, '0');
  return `A${year}-${month}-${seq}-S`;
}


/** 重新编号：按界面顺序（设备组在前、固定组顺延）重排全部组的 group_no。
 * 只重排 EQUIPMENT 会与新建设备组编号重复
 * （导出序号出现两个 2/3…，同号组刷新后顺序不稳定） */
function renumberGroups(groups: Group[]): Group[] {
  return groups.map((g, i) => ({ ...g, groupNo: i + 1 }));
}

/** 由汇总值构建版本保存载荷（统一 handleSave/handleSubmit 三处 saveVersion 字段映射，避免重复漂移） */
function buildVersionPayload(
  ver: ProjectVersion,
  s: ProjectSummary,
  overrides: Partial<Pick<ProjectVersion, 'versionNo' | 'reviewStatus'>> = {}
): Partial<ProjectVersion> {
  return {
    ...ver,
    ...overrides,
    totalDirectCost: s.totalDirectCost,
    totalAccountingPrice: s.totalAccountingPrice,
    discountedPrice: s.discountedPrice,
    discountRate: s.discountRate,
    gp3ProfitRate: s.gp3,
    gp3Amount: s.gp3Amount,
    totalCost: s.totalCost,
    warrantyCost: s.warrantyCost,
    riskCost: s.riskCost,
    materialCost: s.materialCost,
    laborCost: s.laborCost,
    projectExpense: s.projectExpense,
  };
}

/** 含税折后价 → 未税（不做取整）：calcProjectSummary 内部按未税计算、输出时再 ×(1+税率) 取整，
 * 若这里先 round，100 元会变成 88 → 99（每次保存漂移 ±1 元）。保留小数可由输出侧精确还原输入值 */
const toUntaxedDiscounted = (v: ProjectVersion): number | undefined =>
  v.discountedPrice ? v.discountedPrice / (1 + (v.taxRate ?? TAX_RATE)) : undefined;

/** 归属 currentVersion 的字段（handleProjectUpdate 写入版本而非项目） */
const VERSION_FIELDS: string[] = ['versionNo', 'eurRate', 'taxRate', 'warrantyRate', 'riskRate', 'commercialCost'];

/** 提取项目字段（create/update 共用；projects 表有 sales_no 列，更新时也必须携带，
 * 否则表头修改销售编号后只改了报价行、项目行仍是旧编号）
 * 不发送 versionNo（后端 projects 无该列），版本信息存于 currentVersion/版本保存 */
function buildProjectPayload(p: Project) {
  return {
    salesNo: p.salesNo,
    clientName: p.clientName, clientCode: p.clientCode,
    projectScope: p.projectScope, projectName: p.projectName || '', projectStage: p.projectStage,
    expectedAwardDate: p.expectedAwardDate, projectLayout: p.projectLayout,
    deliveryPeriod: p.deliveryPeriod, paymentTerms: p.paymentTerms,
    postfix: p.postfix, note: p.note,
  };
}

/** 通用删除确认弹窗（统一删除组/删除物料两个 Modal 结构） */
function ConfirmDeleteModal({ title, description, open, onCancel, onConfirm }: {
  title: string; description: string; open: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <Modal
      title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.5 }}>{title}</span>}
      open={open}
      onCancel={onCancel}
      width={420}
      destroyOnHidden
      styles={{ body: { padding: '24px 28px 12px' } }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button icon={<CloseOutlined />} onClick={onCancel}
            style={{ borderRadius: 3, width: 36, height: 36 }} />
          <Button type="primary" ghost icon={<CheckOutlined />} onClick={onConfirm}
            style={{ borderColor: COLORS.danger, color: COLORS.danger, borderRadius: 3, width: 36, height: 36 }} />
        </div>
      }
    >
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
        <div style={{ fontSize: 14, color: COLORS.textSecondary }}>{description}</div>
      </div>
    </Modal>
  );
}


/** 默认固定组及默认条目（新建报价草稿的初始分组） */
function getFixedGroups(): Group[] {
  const fi = (o: Partial<GroupItem>): GroupItem => ({
    id: uuid(), itemNo: 0, itemType: 'SERVICE', componentId: '',
    code: '', description: '', qtyTotal: 1, unit: '项',
    sourcingType: 'PURCHASED', unitCost: 0, designHours: 0, assemblyHours: 0,
    designHourRate: 175, assemblyHourRate: 85, directCost: 0, marginRate: 0.15,
    basicPrice: 0, accountingPrice: 0, hasWarranty: false, note: '',
    ...o,
  });
  return [
    { id: '', groupNo: 0, groupType: 'INTEGRATION', name: '集成控制', isFixed: true,
      items: [
        fi({ itemNo: 1, itemType: 'SOFTWARE', code: 'SW-JFYMES-000000-V1.0', description: '生产制造系统', qtyTotal: 1, unit: '套', sourcingType: 'SELF_MANUFACTURED', unitCost: 50000, designHours: 64, assemblyHours: 0, marginRate: 1.0, hasWarranty: false }),
        fi({ itemNo: 2, itemType: 'COMPONENT', code: 'CP-SERVER-000000-V1.0', description: '系统服务器', qtyTotal: 1, unit: '套', sourcingType: 'PURCHASED', unitCost: 45000, designHours: 16, assemblyHours: 16, marginRate: 0.2, hasWarranty: true }),
        fi({ itemNo: 3, itemType: 'COMPONENT', code: 'CP-CONCAB-000000-V1.0', description: '电气控制柜', qtyTotal: 1, unit: '台', sourcingType: 'SELF_MANUFACTURED', unitCost: 45000, designHours: 32, assemblyHours: 64, marginRate: 0.2, hasWarranty: true }),
        fi({ itemNo: 4, itemType: 'SERVICE', code: 'SV-ENERGS-W0E0P0-V1.0', description: '能源接入', qtyTotal: 1, unit: '套件', sourcingType: 'SELF_MANUFACTURED', unitCost: 0, designHours: 0, assemblyHours: 0, marginRate: 0.15, hasWarranty: false }),
        fi({ itemNo: 5, itemType: 'SERVICE', code: 'SV-NETFAC-010416-V1.0', description: '网络设施', qtyTotal: 1, unit: '套', sourcingType: 'SELF_MANUFACTURED', unitCost: 0, designHours: 0, assemblyHours: 0, marginRate: 0.15, hasWarranty: false }),
        fi({ itemNo: 6, itemType: 'SERVICE', code: 'SV-FOUNDA-204035-V1.0', description: '地基施工', qtyTotal: 1, unit: '套件', sourcingType: 'SELF_MANUFACTURED', unitCost: 0, designHours: 0, assemblyHours: 0, marginRate: 0.15, hasWarranty: false }),
      ]},
    { id: '', groupNo: 0, groupType: 'PACKAGING_TRANSPORT', name: '包装运输', isFixed: true,
      items: [
        fi({ itemNo: 1, itemType: 'COMPONENT', code: 'SV-PAKAGE-000000-V1.0', description: '设备包装', qtyTotal: 1, unit: '套件', sourcingType: 'SELF_MANUFACTURED', unitCost: 1000, designHours: 2, assemblyHours: 2, marginRate: 0.15, hasWarranty: false }),
        fi({ itemNo: 2, itemType: 'COMPONENT', code: 'SV-TRASPO-000000-V1.0', description: '设备运输', qtyTotal: 1, unit: '套件', sourcingType: 'SELF_MANUFACTURED', unitCost: 0, designHours: 0, assemblyHours: 0, marginRate: 0.15, hasWarranty: false }),
        fi({ itemNo: 3, itemType: 'COMPONENT', code: 'SV-INSURA-000000-V1.0', description: '运输保险', qtyTotal: 1, unit: '套件', sourcingType: 'SELF_MANUFACTURED', unitCost: 0, designHours: 0, assemblyHours: 0, marginRate: 0.15, hasWarranty: false }),
      ]},
    { id: '', groupNo: 0, groupType: 'PROJECT_DELIVERY', name: '项目交付', isFixed: true,
      items: [
        fi({ itemNo: 1, itemType: 'COMPONENT', code: 'SV-DESIGN-000000-V1.0', description: '设计会签', qtyTotal: 1, unit: '元/小时', sourcingType: 'SELF_MANUFACTURED', unitCost: 175, designHours: 0, assemblyHours: 0, marginRate: 0.1, hasWarranty: false }),
        fi({ itemNo: 2, itemType: 'COMPONENT', code: 'SV-SINSTL-000000-V1.0', description: '现场安装', qtyTotal: 1, unit: '元/小时', sourcingType: 'SELF_MANUFACTURED', unitCost: 85, designHours: 0, assemblyHours: 0, marginRate: 0.1, hasWarranty: false }),
        fi({ itemNo: 3, itemType: 'COMPONENT', code: 'SV-SDEBUG-000000-V1.0', description: '现场调试', qtyTotal: 1, unit: '元/小时', sourcingType: 'SELF_MANUFACTURED', unitCost: 175, designHours: 0, assemblyHours: 0, marginRate: 0.1, hasWarranty: false }),
        fi({ itemNo: 4, itemType: 'COMPONENT', code: 'SV-STRAIN-000000-V1.0', description: '现场培训', qtyTotal: 1, unit: '元/小时', sourcingType: 'SELF_MANUFACTURED', unitCost: 175, designHours: 0, assemblyHours: 0, marginRate: 0.1, hasWarranty: false }),
        fi({ itemNo: 5, itemType: 'COMPONENT', code: 'SV-SSTAND-000000-V1.0', description: '现场陪产', qtyTotal: 1, unit: '元/小时', sourcingType: 'SELF_MANUFACTURED', unitCost: 174, designHours: 0, assemblyHours: 0, marginRate: 0.1, hasWarranty: false }),
        fi({ itemNo: 6, itemType: 'COMPONENT', code: 'SV-PROMAN-000000-V1.0', description: '项目管理', qtyTotal: 1, unit: '元/小时', sourcingType: 'SELF_MANUFACTURED', unitCost: 240, designHours: 0, assemblyHours: 0, marginRate: 0.1, hasWarranty: false }),
      ]},
    { id: '', groupNo: 0, groupType: 'IMPLEMENTATION_EXPENSE', name: '实施费用', isFixed: true,
      items: [
        fi({ itemNo: 1, itemType: 'COMPONENT', code: 'SV-TRACOS-000000-V1.0', description: '差旅费用', qtyTotal: 1, unit: '人天', sourcingType: 'SELF_MANUFACTURED', unitCost: 26500, designHours: 0, assemblyHours: 0, marginRate: 0.1, hasWarranty: false }),
        fi({ itemNo: 2, itemType: 'COMPONENT', code: 'SV-PMCOST-000000-V1.0', description: '项目管理费', qtyTotal: 1, unit: '项', sourcingType: 'SELF_MANUFACTURED', unitCost: 26500, designHours: 0, assemblyHours: 0, marginRate: 0.1, hasWarranty: false }),
      ]},
    { id: '', groupNo: 0, groupType: 'OTHER', name: '其他', isFixed: true,
      items: [
        fi({ itemNo: 1, itemType: 'COMPONENT', code: 'SV-EQRENT-000000-V1.0', description: '设备租赁', qtyTotal: 1, unit: '项', sourcingType: 'SELF_MANUFACTURED', unitCost: 3000, designHours: 0, assemblyHours: 0, marginRate: 0.1, hasWarranty: false }),
        fi({ itemNo: 2, itemType: 'COMPONENT', code: 'SV-WSRENT-000000-V1.0', description: '场地租赁', qtyTotal: 1, unit: '项', sourcingType: 'SELF_MANUFACTURED', unitCost: 0, designHours: 0, assemblyHours: 0, marginRate: 0.1, hasWarranty: false }),
      ]},
  ];
}
const initProject = (): Project => {
  const salesNo = generateSalesNo();
  const base = {
    id: 'proj-' + uuid().slice(0, 6),
    salesNo: salesNo,
    clientName: '新项目',
    clientCode: '',
    versionNo: 'V1.0',
    projectScope: '24个月', // 质保期默认值，与 ProjectHeader WARRANTY_OPTIONS 对齐（历史误填 '2年质保' 不在选项内）
    projectName: '',
    projectStage: '方案设计',
    expectedAwardDate: '',
    projectLayout: '',
    deliveryPeriod: '合同生效后5个月发货，货到现场后3个月安调完毕，具备试生产条件',
    paymentTerms: '预付30% 发货60% 验收0% 质保10%',
    postfix: 'EC0',
    note: '',
  };
  const blankVersion = {
    id: 'v-' + uuid().slice(0, 6),
    versionNo: 'V1.0',
    eurRate: 7.8, taxRate: TAX_RATE, roundingDigits: 0,
    warrantyRate: 0.01, riskRate: 0.03, commercialCost: 0,
    totalDirectCost: 0, totalAccountingPrice: 0,
    discountedPrice: 0, discountRate: 0,
    gp3ProfitRate: 0, gp3Amount: 0,
    reviewStatus: 'draft' as const,
  };
  return {
    ...base,
    currentVersion: blankVersion,
    groups: [
      { id: 'grp-eqp-' + uuid().slice(0, 6), groupNo: 1, groupType: 'EQUIPMENT', name: '设备组 ', isFixed: false, items: [] },
      ...getFixedGroups().map((g, i) => ({ ...g, id: g.id + '-' + uuid().slice(0, 6), groupNo: i + 2 })),
    ],
  };
};

/** 默认版本（无数据时 fallback） */
const FALLBACK_VERSION: ProjectVersion = {
  id: '', versionNo: 'V1.0', eurRate: 8.15, taxRate: TAX_RATE, roundingDigits: 0,
  warrantyRate: 0.01, riskRate: 0.03, commercialCost: 0,
  totalDirectCost: 0, totalAccountingPrice: 0, discountedPrice: 0, discountRate: 0,
  gp3ProfitRate: 0, gp3Amount: 0, reviewStatus: 'draft',
};

const QuotationPage: React.FC = () => {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  /** 加载失败原因（区分「数据不存在」与「版本不匹配/网络/权限」，避免统一误报） */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quotationLocked, setQuotationLocked] = useState(false);
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<{ groupId: string; itemId: string } | null>(null);
  const [componentDB, setComponentDB] = useState<Component[]>([]);
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [messageApi, contextHolder] = message.useMessage();
  const { id: quoteId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const viewOnly = searchParams.get('view') === '1';
  const invalidQuote = quoteId && !loading && !project;
  const isLocked = quotationLocked || viewOnly;
  const { user } = useAuth();
  const submitterName = user?.displayName || '方案经理';
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false); // 同步防重入锁（比 useState 更可靠）
  const oppIdRef = useRef<string | null>(null);
  /** 物料编码→组件索引：用 Map 替代 componentDB.find/some 全表扫描（填充 effect/编码校验/添加条目） */
  const componentMap = useMemo(
    () => new Map(componentDB.map((c: Component) => [c.code, c])),
    [componentDB]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        if (quoteId && quoteId !== 'new') {
          const quotation = await quotationService.get(quoteId);
          const pid = quotation.projectId;
          if (!pid) throw new Error('no project_id');
          oppIdRef.current = quotation.opportunityId || null;
          const data = await projectService.getFull(pid);
          if (!cancelled) {
            // 取与报价版本号匹配的版本。不再静默回退最新版——
            // 版本号不一致时回退会让页面按错误版本加载，保存时又会把财务数据写到另一条版本上
            const quoteVerNo = quotation.versionNo || '';
            const matchedVersion = quoteVerNo
              ? data.versions?.find(v => v.versionNo === quoteVerNo)
              : data.versions?.[0];
            if (quoteVerNo && !matchedVersion) {
              throw new Error(`报价版本 ${quoteVerNo} 在项目版本中不存在，请先修复版本数据`);
            }
            const lv = matchedVersion;
            // 锁定规则：先根据 DB 字段和版本状态判断，最后检查机会签单状态（全覆盖）
            let shouldLock = quotation.locked === true;
            // 版本状态规则：待审批锁定，审批通过/驳回后解锁
            // 待审批但不存在真实审批请求 = 提交中断残留（后端允许覆写重提），不得锁死页面
            if (lv?.reviewStatus === 'pending' && quotation.hasPendingApproval !== false) shouldLock = true;
            if (lv?.reviewStatus === 'approved') shouldLock = false;
            if (lv?.reviewStatus === 'rejected') shouldLock = false;
            // 报价表自身状态兜底（兼容历史数据中版本状态未同步的情况）
            if (quotation.status === 'approved') shouldLock = false;
            if (quotation.status === 'rejected') shouldLock = false;
            // 已签单（中标+赢）强制锁定，覆盖版本规则
            if (oppIdRef.current) {
              try {
                const checkOpp = await opportunityService.get(oppIdRef.current);
                if (checkOpp.stage === '中标' && checkOpp.status === '赢') shouldLock = true;
                if (checkOpp.terminated) shouldLock = true;
              } catch {
                // 无法确认签单状态时按锁定处理（fail-closed）：权限/网络错误不得让已签单报价变成可编辑
                if (!cancelled) shouldLock = true;
              }
            }
            setQuotationLocked(shouldLock);
            // 按版本过滤组数据；无匹配时检查是否为无版本隔离的旧数据（此时回退全量组），
            // 否则视为新版本尚无组，保持空（避免加载全量组后保存导致版本内组重复）
            let versionGroups = data.groups?.filter((g: Group) => g.versionId === lv?.id) || [];
            if (versionGroups.length === 0) {
              const hasVersionedGroups = data.groups?.some((g: Group) => g.versionId);
              if (!hasVersionedGroups) {
                versionGroups = data.groups || [];
              }
            }
            setProject({ ...data, currentVersion: lv || { ...FALLBACK_VERSION }, groups: versionGroups });
          }
        } else {
          const search = new URLSearchParams(window.location.search);
          const oppId = search.get('oppId');
          oppIdRef.current = oppId || null;
          let prefill: Record<string, string> = {};
          if (oppId) {
            try {
              const opp = await opportunityService.get(oppId);
              if (opp.stage === '中标' && opp.status === '赢') { setQuotationLocked(true); }
              if (opp.terminated) { setQuotationLocked(true); }
              const cn = opp.clientName || '';
              // 从客户列表查找客户编号
              // 传 limit: LIST_LIMIT，避免后端默认 limit=100 导致客户列表截断、查不到客户编码
              let cc = '';
              try {
                const clients = await clientService.list({ limit: LIST_LIMIT });
                const match = clients.find((c: Client) => c.name === cn);
                if (match) cc = match.code || '';
              } catch { /* 静默忽略，使用回退值 */ }
              prefill = { salesNo: opp.salesNo || '', clientName: cn, clientCode: cc, expectedAwardDate: opp.expectedCloseDate || '', projectName: opp.projectName || '' };
            } catch { /* 静默忽略，使用回退值 */ }
          }
          if (!cancelled) {
            const base = initProject();
            setProject({ ...base, ...prefill, salesNo: (prefill.salesNo || base.salesNo) });
            setHasChanges(true);
          }
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setLoadError((err as Error)?.message || '报价加载失败');
      } finally { if (!cancelled) setLoading(false); }
    }
    load();
    // 传 limit: LIST_LIMIT，避免后端默认 limit=100 导致物料库截断（编码填充/校验依赖全量物料库）
    componentService.list({ limit: LIST_LIMIT })
      .then(d => { if (!cancelled && d) { setComponentDB(d); setCatalogState('ready'); } })
      .catch(() => { if (!cancelled) setCatalogState('error'); });
    return () => { cancelled = true; };
  }, [quoteId]);

  /**
   * 当物料编码匹配数据库时，自动填充成本/工时/质保/采购方式
   * 幂等——数值字段（成本/工时）仅当前值为 0/空时填充，填充后再触发本 effect 不会二次修改（防止无限循环）；
   * 语义澄清：枚举/布尔字段（质保/单位/采购方式）走「与数据库不一致即对齐」的"不等匹配回填"，
   * 与"仅 0/空才填充"不同——选错类型时点击编码即纠正为库内配置，而非保留旧值。两条规则均有防循环保证
   */
  useEffect(() => {
    if (!project || componentMap.size === 0 || isLocked) return;
    let changed = false;
    const designRateFromDB = componentMap.get('SV-DESIGN-000000-V1.0')?.unitCost ?? DEFAULT_DESIGN_HOURLY_RATE;
    const assemblyRateFromDB = componentMap.get('SV-INSASS-000000-V1.0')?.unitCost ?? DEFAULT_ASSEMBLY_HOURLY_RATE;
    const newGroups = project.groups.map(g => ({
      ...g,
      items: g.items.map(item => {
        if (!item.code) return item;
        const comp = componentMap.get(item.code);
        if (!comp) return item;
        // 逐字段填充：仅当当前值为 0/空且数据库有值时才填充
        const updated = { ...item };
        let itemChanged = false;
        if (item.unitCost === 0 && comp.unitCost) { updated.unitCost = comp.unitCost; itemChanged = true; }
        if (item.designHours === 0 && comp.designHours) { updated.designHours = comp.designHours; itemChanged = true; }
        if (item.assemblyHours === 0 && comp.assemblyHours) { updated.assemblyHours = comp.assemblyHours; itemChanged = true; }
        if (comp.hasWarranty !== undefined && comp.hasWarranty !== item.hasWarranty) { updated.hasWarranty = comp.hasWarranty; itemChanged = true; }
        if (comp.unit && comp.unit !== item.unit) { updated.unit = comp.unit; itemChanged = true; }
        if (comp.sourcingType && comp.sourcingType !== item.sourcingType) { updated.sourcingType = comp.sourcingType; itemChanged = true; }
        // 填充工时费率（按物料编码 SV-DESIGN/SV-INSASS 从物料库取值，缺失回退默认值）
        // 仅当费率 > 0 时填充：0 是合法注册值（unitCost=0 时 ?? 不会回退），
        // 若用 falsy 判断把 0 填进 0 会让 itemChanged 恒真 → effect 重跑 → 无限循环
        if (designRateFromDB > 0 && !updated.designHourRate) { updated.designHourRate = designRateFromDB; itemChanged = true; }
        if (assemblyRateFromDB > 0 && !updated.assemblyHourRate) { updated.assemblyHourRate = assemblyRateFromDB; itemChanged = true; }
        // 填充后重算直接成本和预期售价
        // 仅字段实际发生变化时重算：若命中零成本物料（unitCost=0 且无工时），
        // directCost 恒为 0 会触发 setProject → effect 再跑 → 无限循环，故不以 directCost===0 为触发条件
        if (itemChanged) {
          updated.directCost = calcDirectCost(updated);
          const p = calcItemPrices(updated.directCost, updated.marginRate ?? 0.15);
          updated.basicPrice = p.basicPrice;
          updated.accountingPrice = p.accountingPrice;
          changed = true; return updated;
        }
        return item;
      }),
    }));
    if (changed) {
      setProject(prev => prev ? { ...prev, groups: newGroups } : prev);
      // 回填改变了成本/售价却不标脏，Save 按钮保持禁用，用户无法主动落盘；
      // 已通过与未保存的回填数据还会被导出。回填即视为未保存修改
      setHasChanges(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentMap, project?.id, project?.groups, isLocked]);

  const handleGroupChange = useCallback((groupId: string, items: GroupItem[]) => {
    setProject(prev => {
      if (!prev) return prev;
      return { ...prev, groups: prev.groups.map(g => g.id === groupId ? { ...g, items } : g) };
    });
    setHasChanges(true);
  }, []);

  const handleAddItem = useCallback((groupId: string) => {
    // 从物料数据库动态获取工费费率
    const designRate = componentMap.get('SV-DESIGN-000000-V1.0')?.unitCost ?? DEFAULT_DESIGN_HOURLY_RATE;
    const assemblyRate = componentMap.get('SV-INSASS-000000-V1.0')?.unitCost ?? DEFAULT_ASSEMBLY_HOURLY_RATE;
    setProject(prev => {
      if (!prev) return prev;
      const newGroups = prev.groups.map(g => {
        if (g.id !== groupId) return g;
        const maxNo = g.items.reduce((max, item) => Math.max(max, item.itemNo), 0);
        const newItem: GroupItem = {
          id: uuid(),
          itemNo: maxNo + 1,
          itemType: 'COMPLETE_SET',
          componentId: '',
          code: '',
          description: '',
          qtyTotal: 1,
          unit: '套',
          sourcingType: 'SELF_MANUFACTURED',
          unitCost: 0,
          designHours: 0,
          assemblyHours: 0,
          designHourRate: designRate,
          assemblyHourRate: assemblyRate,
          directCost: 0,
          marginRate: 0.35,
          basicPrice: 0,
          accountingPrice: 0,
          hasWarranty: true,
          note: '',
        };
        return { ...g, items: [...g.items, newItem] };
      });
      return { ...prev, groups: newGroups };
    });
    setHasChanges(true);
  }, [componentMap]);

  const handleDeleteItem = useCallback((groupId: string, itemId: string) => {
    setDeleteItemId({ groupId, itemId });
  }, []);

  const confirmDeleteItem = useCallback(() => {
    if (!deleteItemId) return;
    setProject(prev => {
      if (!prev) return prev;
      return { ...prev, groups: prev.groups.map(g => {
        if (g.id !== deleteItemId.groupId) return g;
        const items = g.items.filter(i => i.id !== deleteItemId.itemId);
        return { ...g, items: items.map((i, idx) => ({ ...i, itemNo: idx + 1 })) };
      })};
    });
    setDeleteItemId(null);
    setHasChanges(true);
    messageApi.success('物料条目已删除');
  }, [deleteItemId, messageApi]);

  const handleDeleteGroup = useCallback((groupId: string) => {
    setDeleteGroupId(groupId);
  }, []);

  const confirmDeleteGroup = useCallback(() => {
    if (!deleteGroupId) return;
    setProject(prev => {
      if (!prev) return prev;
      const groups = renumberGroups(prev.groups.filter(g => g.id !== deleteGroupId));
      return { ...prev, groups };
    });
    // 仅改本地状态；保存时整版本重建，删除随批量事务落库
    setDeleteGroupId(null);
    setHasChanges(true);
    messageApi.success('设备组已删除并重新编号');
  }, [deleteGroupId, messageApi]);

  const handleAddGroup = useCallback(() => {
    setProject(prev => {
      if (!prev) return prev;
      const equipGroups = prev.groups.filter(g => g.groupType === 'EQUIPMENT');
      const newNo = equipGroups.length + 1;
      const newId = uuid();
      const newGroup: Group = {
        id: newId,
        groupNo: newNo,
        groupType: 'EQUIPMENT',
        name: `设备组 #${newNo}`,
        isFixed: false,
        items: [],
      };
      const idx = prev.groups.findIndex(g => g.groupType === 'INTEGRATION');
      const groups = [...prev.groups];
      groups.splice(idx >= 0 ? idx : groups.length, 0, newGroup);
      return { ...prev, groups: renumberGroups(groups) };
    });
    setHasChanges(true);
    messageApi.success('已添加新设备组');
  }, [messageApi]);

  const handleDiscountChange = useCallback((value: number) => {
    setProject(prev => {
      if (!prev) return prev;
      return { ...prev, currentVersion: { ...prev.currentVersion, discountedPrice: value } };
    });
    setHasChanges(true);
  }, []);

  // 未保存修改的离开保护：关闭/刷新标签页触发浏览器确认；站内返回按钮单独确认
  useEffect(() => {
    if (!hasChanges || isLocked) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasChanges, isLocked]);

  const handleBack = useCallback(() => {
    if (hasChanges && !isLocked && !window.confirm('有未保存的修改，确定离开吗？')) return;
    navigate('/quotations');
  }, [hasChanges, isLocked, navigate]);

  const handleProjectUpdate = useCallback((field: string, value: string | number) => {
    setProject(prev => {
      if (!prev) return prev;
      if (VERSION_FIELDS.includes(field)) {
        return { ...prev, currentVersion: { ...prev.currentVersion, [field]: value } };
      }
      return { ...prev, [field]: value };
    });
    setHasChanges(true);
  }, []);

  const handleGroupNameChange = useCallback((groupId: string, name: string) => {
    setProject(prev => {
      if (!prev) return prev;
      return { ...prev, groups: prev.groups.map(g => g.id === groupId ? { ...g, name } : g) };
    });
    setHasChanges(true);
  }, []);

  const validateCodes = useCallback((): string[] => {
    if (!project) return [];
    const badCodes: string[] = [];
    for (const g of project.groups) {
      for (const item of g.items) {
        if (item.code && componentMap.size > 0 && !componentMap.has(item.code)) {
          badCodes.push(item.code);
        }
      }
    }
    return badCodes;
  }, [project, componentMap]);


  // 报价同步金额取 calcProjectSummary 汇总值，discountedPrice 需传未税（从含税存储值转换）
  const syncQuotation = useCallback(async (versionNo: string, status: string, overrideProjectId?: string) => {
    if (!project) return undefined;
    const p = project.currentVersion;
    const pid = overrideProjectId || project.id;
    const syncUntaxed = toUntaxedDiscounted(p);
    const summary = calcProjectSummary(project.groups || [], p, syncUntaxed);
    const result = await quotationService.sync({
      projectId: pid,
      versionNo,
      salesNo: project.salesNo,
      clientName: project.clientName,
      // projectName 不可回退到 projectScope（scope 历史数据可能被误填为「2年质保」）
      projectName: project.projectName || project.clientName,
      status,
      amount: summary.discountedPrice || 0,
      totalCost: summary.totalCost || 0,
      profitRate: rateToPercent(summary.gp3 || 0),
      opportunityId: oppIdRef.current,
    });
    return result;
  }, [project]);

  /** 整版本原子保存组与明细，返回 oldId→newId 映射（后端事务内删除旧组后重建） */
  const saveGroups = useCallback(async (pid: string, vid: string, groups: Group[]) => {
    const saved = await projectService.saveGroupBatch(pid, vid, groups);
    const idMap = new Map<string, string>();
    groups.forEach((g, i) => {
      if (saved[i]?.id) idMap.set(g.id, saved[i].id);
    });
    return idMap;
  }, []);

  const handleSave = useCallback(async () => {
    if (savingRef.current) return; // 同步防重入锁
    if (!project) return;
    if (isLocked) { messageApi.warning('此报价已锁定，无法修改'); return; }
    if (!project.clientName.trim()) { messageApi.warning('请输入客户名称'); return; }
    if (!project.projectName.trim()) { messageApi.warning('请输入项目名称'); return; }
    if (!project.projectScope.trim()) { messageApi.warning('请输入项目范围'); return; }
    const totalItems = project.groups.reduce((s, g) => s + g.items.length, 0);
    if (totalItems === 0) { messageApi.warning('请至少添加一个物料条目'); return; }
    if (catalogState !== 'ready') {
      messageApi.warning(catalogState === 'error'
        ? '物料库加载失败，无法校验编码，请刷新后重试'
        : '物料库加载中，请稍候再保存');
      return;
    }
    const badCodes = validateCodes();
    if (badCodes.length > 0) {
      messageApi.warning('以下编码不在组件数据库中，请先注册再保存：' + badCodes.join(', '));
      return;
    }
    const curVer = project.currentVersion;
    // 始终使用当前版本号保存（不迭代版本，版本编辑由用户手动输入）
    const versionForSave = curVer.versionNo;
    // 已通过/已驳回的报价被再次编辑保存时状态重置为草稿——否则内容已修改却仍保持 approved/rejected，
    // 绕过审批状态机（改过数据不经重审即显示"已通过"）。pending 保持不动（单据仍在审批中），draft 亦不动
    const statusForSave = reviewStatusForSave(curVer.reviewStatus);
    // 降级发生即提示，不再静默——用户可预期"保存后状态降级、需重新审批"
    if (statusForSave !== curVer.reviewStatus) {
      messageApi.warning(curVer.reviewStatus === 'approved'
        ? '该报价当前为「已通过」，保存后将重置为草稿并需重新审批'
        : '该报价当前为「已驳回」，保存后将重置为草稿');
    }
    try {
      savingRef.current = true;
      setIsSaving(true); // 防止重复点击
      const isNew = project.id.startsWith('proj-');
      if (isNew) {
        const created = await projectService.create(buildProjectPayload(project));
        const newId = created.id;
        // 项目创建成功立即回写 id——后续 saveVersion/sync 失败时重试不会再次 create，
        // 避免产生重复项目 + 无报价孤儿
        setProject(prev => prev ? { ...prev, id: newId } : prev);
        const newVerUntaxed = toUntaxedDiscounted(curVer);
        const newVerSummary = calcProjectSummary(project.groups || [], curVer, newVerUntaxed);
        const sv = await projectService.saveVersion(newId, buildVersionPayload(curVer, newVerSummary, { versionNo: versionForSave, reviewStatus: statusForSave }));
        const svId = sv.id;
        const idMap = await saveGroups(newId, svId, project.groups);
        // 组 id 立即回写，后续 sync/审批失败重试时 state 已与数据库一致
        setProject(prev => prev ? { ...prev, groups: prev.groups.map(g => ({ ...g, id: idMap.get(g.id) || g.id })) } : prev);
        const syncResult = await syncQuotation(versionForSave, statusForSave, newId);
        const qid = syncResult?.id || '';
        // 必须同步更新计算字段与组 id（saveGroups 后前端临时 id 需换成后端真实 id），否则 handleSubmit 会用旧数据覆盖
        setProject(prev => prev ? {
          ...prev,
          id: newId,
          groups: prev.groups.map(g => ({ ...g, id: idMap.get(g.id) || g.id })),
          currentVersion: { ...prev.currentVersion, ...newVerSummary, id: svId, versionNo: versionForSave, reviewStatus: statusForSave },
        } : prev);
        // 新建报价保存后跳转到报价 URL，刷新不再丢失
        // 回写 opportunity.quotationId，使销售管理页面图标变为编辑
        if (qid && oppIdRef.current) {
          opportunityService.update(oppIdRef.current, { quotationId: qid }).catch(() => {});
        }
        if (qid && quoteId === 'new') navigate('/quotations/' + qid, { replace: true });
      } else {
        await projectService.update(project.id, buildProjectPayload(project));
        const versionUntaxed = toUntaxedDiscounted(curVer);
        const versionSummary = calcProjectSummary(project.groups || [], curVer, versionUntaxed);
        const versionPayload = buildVersionPayload(curVer, versionSummary, { versionNo: versionForSave, reviewStatus: statusForSave });
        const savedVersion = await projectService.saveVersion(project.id, versionPayload);
        const savedVersionId = savedVersion.id;
        const idMap = await saveGroups(project.id, savedVersionId, project.groups);
        setProject(prev => prev ? { ...prev, groups: prev.groups.map(g => ({ ...g, id: idMap.get(g.id) || g.id })) } : prev);
        const syncResult = await syncQuotation(versionForSave, statusForSave);
        const newQid = syncResult?.id || "";
        if (newQid && oppIdRef.current && quoteId) {
          opportunityService.update(oppIdRef.current, { quotationId: newQid }).catch(() => {});
        }
        setProject(prev => prev ? {
          ...prev,
          currentVersion: { ...prev.currentVersion, ...versionSummary, id: savedVersionId, versionNo: versionForSave, reviewStatus: statusForSave },
          groups: prev.groups.map(g => ({ ...g, id: idMap.get(g.id) || g.id })),
        } : prev);
      }
      clearCache('/projects');
      setHasChanges(false);
      messageApi.success('概算表已保存');
    } catch (err: unknown) {
      console.error("[SaveError]", err);
      messageApi.error('保存失败：' + ((err as Error).message || '未知错误'));
    } finally {
      setIsSaving(false);
      savingRef.current = false;
    }
  }, [validateCodes, messageApi, project, isLocked, catalogState, syncQuotation, quoteId, navigate, saveGroups]);

  const handleSubmit = useCallback(async () => {
    if (savingRef.current) return; // 同步防重入锁
    if (isLocked) { messageApi.warning('此报价已锁定，无法提交'); return; }
    if (!project) return;
    if (project.id.startsWith('proj-')) { messageApi.warning('请先保存报价，再提交审批'); return; }
    // 提交复用保存的完整性校验，防空客户/空项目/零明细的历史单据进入审批
    if (!project.clientName.trim()) { messageApi.warning('请输入客户名称'); return; }
    if (!project.projectName.trim()) { messageApi.warning('请输入项目名称'); return; }
    if (!project.projectScope.trim()) { messageApi.warning('请输入项目范围'); return; }
    if (project.groups.reduce((s, g) => s + g.items.length, 0) === 0) {
      messageApi.warning('请至少添加一个物料条目'); return;
    }
    if (catalogState !== 'ready') {
      messageApi.warning(catalogState === 'error'
        ? '物料库加载失败，无法校验编码，请刷新后重试'
        : '物料库加载中，请稍候再提交');
      return;
    }
    const badCodes = validateCodes();
    if (badCodes.length > 0) {
      messageApi.warning('以下编码不在组件数据库中，请先注册再提交：' + badCodes.join(', '));
      return;
    }
    const curVer = project.currentVersion;
    if (!curVer.versionNo) { messageApi.warning('版本号异常'); return; }
    // 已通过/审批中的单据无变更时不得重复提交（会无意义地重置状态并新建审批）
    if (curVer.reviewStatus === 'approved') { messageApi.warning('该报价已审批通过，无需重复提交'); return; }
    if (curVer.reviewStatus === 'pending') { messageApi.warning('该报价正在审批中，请勿重复提交'); return; }
    // 汇总值提前到 try 外计算，供失败回滚复用
    const submitUntaxed = toUntaxedDiscounted(curVer);
    const submitSummary = calcProjectSummary(project.groups || [], curVer, submitUntaxed);
    try {
      savingRef.current = true;
      setIsSaving(true); // 防止重复点击
      await projectService.update(project.id, buildProjectPayload(project));
      const updatedVersion = buildVersionPayload(curVer, submitSummary, { reviewStatus: 'pending' });
      const savedVer = await projectService.saveVersion(project.id, updatedVersion);
      const savedVerId = savedVer.id;
      // 保存组数据（与 handleSave 逻辑一致），确保审批时组数据是最新的
      const idMap = await saveGroups(project.id, savedVerId, project.groups);
      setProject(prev => prev ? { ...prev, groups: prev.groups.map(g => ({ ...g, id: idMap.get(g.id) || g.id })) } : prev);
      const synced = await quotationService.sync({
        projectId: project.id, versionNo: curVer.versionNo,
        salesNo: project.salesNo, clientName: project.clientName,
        projectName: project.projectName || project.clientName, status: 'pending',
        amount: submitSummary.discountedPrice || 0, totalCost: submitSummary.totalCost || 0,
        profitRate: rateToPercent(submitSummary.gp3 || 0),
        opportunityId: oppIdRef.current,
      });
      const quotationId = synced?.id || '';
      await approvalService.create({
        approvalType: 'quotation', quotationId: quotationId,
        salesNo: project.salesNo, versionNo: curVer.versionNo, clientName: project.clientName,
        projectName: project.projectName || project.clientName,
        amount: submitSummary.discountedPrice || 0,
        totalCost: submitSummary.totalCost,
        profitRate: rateToPercent(submitSummary.gp3 || 0),
        gp3: submitSummary.gp3,
        taxRate: curVer?.taxRate || TAX_RATE,
        totalAccountingPrice: submitSummary.totalAccountingPrice,
        discountedPrice: submitSummary.discountedPrice || 0,
        discountRate: submitSummary.discountRate || 0,
        gp3Amount: submitSummary.gp3Amount || 0,
        submitter: submitterName, status: 'pending',
      });
      // 提交不创建新版本，用户手动修改版本号→保存时才创建
      setProject(prev => prev ? {
        ...prev,
        currentVersion: { ...prev.currentVersion, ...submitSummary, id: savedVerId, reviewStatus: 'pending' },
        groups: prev.groups.map(g => ({ ...g, id: idMap.get(g.id) || g.id })),
      } : prev);
      clearCache('/projects');
      setQuotationLocked(true);
      setHasChanges(false);
      messageApi.success('已提交审批');
    } catch (err: unknown) {
      console.error("[SaveError]", err);
      // 提交链路非原子（版本 pending → 报价 pending → 创建审批），最后一步失败会残留
      // pending 且无审批记录，刷新后 shouldLock=pending 页面锁定、无审批可操作 → 报价永久卡死
      // 补偿回滚：把版本与报价状态恢复为 draft，页面解锁可重试；后端 index.ts 对「pending 无审批请求」
      // 的版本允许覆写，重提链路不受阻。 白名单仅接受 draft/pending（pending 即缺陷态），
      // 终态 rejected 不可经此接口写回，但 rejected→draft 不影响解锁且驳回决策已留存审批记录
      const restoreStatus = 'draft';
      try {
        await projectService.saveVersion(project.id, buildVersionPayload(curVer, submitSummary, { reviewStatus: restoreStatus }));
        await quotationService.sync({
          projectId: project.id, versionNo: curVer.versionNo,
          salesNo: project.salesNo, clientName: project.clientName,
          projectName: project.projectName || project.clientName,
          status: restoreStatus,
          // 补偿回滚必须带完整财务快照：后端 sync 现已按显式字段更新，
          // 但显式携带可保证回滚后金额/成本/利润率与版本一致（防历史半态）
          amount: submitSummary.discountedPrice || 0,
          totalCost: submitSummary.totalCost || 0,
          profitRate: rateToPercent(submitSummary.gp3 || 0),
        });
      } catch { /* 回滚失败静默：保留原错误提示，用户可重试提交 */ }
      messageApi.error('提交失败：' + ((err as Error).message || '未知错误'));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [validateCodes, messageApi, project, isLocked, catalogState, submitterName, saveGroups]);

  // 所有 calcProjectSummary 调用必须传入未税 discountedPrice（已含税存储的 ÷(1+taxRate) 转换）
  const summary = useMemo(() => {
    if (!project || !project.currentVersion) return null;
    const memoUntaxed = toUntaxedDiscounted(project.currentVersion);
    return calcProjectSummary(project.groups, project.currentVersion, memoUntaxed);
  }, [project]);

  const handleExport = useCallback(() => {
    if (!project || !project.currentVersion || project.currentVersion.reviewStatus !== 'approved') {
      messageApi.warning('报价需审批通过后方可导出');
      return;
    }
    // 已通过版本可能有未保存修改（审批后解锁编辑）：导出必须与审批快照一致
    if (hasChanges) {
      messageApi.warning('存在未保存的修改，请先保存（保存后将重置为草稿并需重新审批）再导出');
      return;
    }
    if (!summary) return;
    let groupsHtml = '';
    for (let gi = 0; gi < project.groups.length; gi++) {
      const g = project.groups[gi];
      let groupTotal = 0;
      for (let ii = 0; ii < g.items.length; ii++) {
        groupTotal += g.items[ii].accountingPrice;
      }
      groupsHtml += '<tr style="font-weight:700;background:#f5f7fa">' +
        '<td style="text-align:center">' + g.groupNo + '</td>' +
        '<td>' + escapeHtml(g.name) + '</td>' +
        '<td style="text-align:center">1</td>' +
        '<td class="amount"></td>' +
        '<td class="amount">¥' + formatMoney(groupTotal) + '</td></tr>';
      for (let ii = 0; ii < g.items.length; ii++) {
        const item = g.items[ii];
        // 零价/赠品项也要导出：跳过会让组小计（含全部项）与明细行之和无法核对
        groupsHtml += '<tr><td style="text-align:center">' + g.groupNo + '.' + item.itemNo + '</td>' +
          '<td>' + escapeHtml(item.code || item.description || '—') + '</td>' +
          '<td style="text-align:center">' + item.qtyTotal + '</td>' +
          '<td class="amount">¥' + formatMoney(item.accountingPrice / (item.qtyTotal || 1)) + '</td>' +
          '<td class="amount">¥' + formatMoney(item.accountingPrice) + '</td></tr>';
      }
    }

    let html = '<h2 style="text-align:center;margin-bottom:16px">报价表</h2>';
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">';
    html += '<tr><td style="border:none;padding:2px 8px;font-size:12px"><b>客户：</b>' + escapeHtml(project.clientName) + '</td>';
    html += '<td style="border:none;padding:2px 8px;font-size:12px"><b>报价编号：</b>' + escapeHtml(project.salesNo) + '</td></tr>';
    html += '<tr><td style="border:none;padding:2px 8px;font-size:12px"><b>版本：</b>' + escapeHtml(project.currentVersion.versionNo) + '</td>';
    html += '<td style="border:none;padding:2px 8px;font-size:12px"><b>日期：</b>' + todayBeijing() + '</td></tr></table>';
    html += '<table style="width:100%;border-collapse:collapse"><thead><tr><th style="width:44px">序号</th><th>项目</th><th style="width:52px">数量</th><th style="width:120px">单价(未税)</th><th style="width:130px">总价(未税)</th></tr></thead><tbody>' + groupsHtml + '</tbody></table>';
    html += '<table style="width:100%;border-collapse:collapse;margin-top:12px">';
    html += '<tr><td style="border:none;text-align:right;padding:4px 10px;font-size:13px"><b>预期总价（含税）：</b>¥' + formatMoney(summary.totalAccountingPrice) + '</td></tr>';
    html += '<tr><td style="border:none;text-align:right;padding:4px 10px;font-size:13px"><b>折后报价（含税）：</b>¥' + formatMoney(summary.discountedPrice) + '</td></tr></table>';
    html += '<p style="font-size:11px;color:;margin-top:16px">明细项/单价为不含税价格，预期总价/折后报价为含税价格</p>';

    exportHtmlTable('报价表_' + project.clientName + '_' + project.salesNo, html);
  }, [project, summary, messageApi, hasChanges]);

  if (loading) {
    return (
      <ConfigProvider theme={{ token: { colorPrimary: COLORS.primary } }}>
        {contextHolder}
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: COLORS.primary,
        },
      }}
    >
      {contextHolder}
      {invalidQuote && <div style={{ padding: 60, textAlign: 'center', color: COLORS.textLight }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
        <div style={{ fontSize: 14, marginBottom: 20 }}>{loadError || '报价不存在或已被删除'}</div>
        <Button onClick={handleBack}>返回报价列表</Button>
      </div>}
      {!invalidQuote && project && <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ArrowLeftOutlined style={{ fontSize: 18, color: COLORS.primary, cursor: 'pointer' }} onClick={handleBack} />
            <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark }}>报价编制</span>
            <span style={{
              fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 4,
              background: STATUS_CONFIG[project.currentVersion.reviewStatus].bg,
              color: STATUS_CONFIG[project.currentVersion.reviewStatus].color,
            }}>
              {STATUS_CONFIG[project.currentVersion.reviewStatus].label}
            </span>
            {isLocked && (
              <span style={{
                fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 4,
                background: COLORS.borderLight, color: COLORS.textMuted,
              }}>🔒 已锁定</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: COLORS.textLight }}>Pre-Sales Calculation</div>
        </div>

        <ProjectHeader project={project} onUpdate={handleProjectUpdate} readOnly={isLocked || isSaving} />

        <div style={{
          marginBottom: 12, fontSize: 12, fontWeight: 600, color: '#3a4a6a', lineHeight: 1.8
        }}>
          <strong style={{ color: COLORS.primary }}>说明：</strong>
          ① 所有价格默认不含税 &nbsp;② 直接成本=物料成本+人工成本+项目费用（物料=设备组/集成开发物料，人工=设计工时+装配工时+项目交付，项目费用=包装运输+差旅管理+其他）
          &nbsp;③ 毛利率=1−成本÷售价 &nbsp;④ 质保基数=标"✕"项次的直接成本之和，标"✕"表示物料本身不含质保，需项目集成时统筹
          &nbsp;⑤ 风险基数=直接成本=物料成本+人工成本+项目费用
          &nbsp;⑥ 编码不在数据库将显示红色<strong style={{color:'red'}}>!</strong>示警
          &nbsp;⑦ 实际成本与概算对比：超支（正偏差）标红、不超支（≤0）为绿色，<strong style={{color:COLORS.primary}}>目标不是做多也不是做少，而是越来越准</strong>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {project.groups.map(group => (
            <GroupCard
              key={group.id}
              group={group}
              onGroupChange={handleGroupChange}
              onAddItem={handleAddItem}
              onDeleteItem={handleDeleteItem}
              onDeleteGroup={group.groupType === 'EQUIPMENT' ? handleDeleteGroup : undefined}
              onGroupNameChange={group.groupType === 'EQUIPMENT' ? handleGroupNameChange : undefined}
              editable={!isLocked && !isSaving}
            />
          ))}
        </div>

        {!isLocked && !isSaving && <Button type="default" ghost
          onClick={handleAddGroup}
          style={{
            width: '100%', height: 48, marginTop: 16,
            borderRadius: 10, border: `1.5px dashed ${COLORS.borderLight}`,
            color: COLORS.primary, fontSize: 14, fontWeight: 600,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.border = `1.5px dashed ${COLORS.primary}`; e.currentTarget.style.background = COLORS.bgSelected; }}
          onMouseLeave={e => { e.currentTarget.style.border = `1.5px dashed ${COLORS.borderLight}`; e.currentTarget.style.background = 'transparent'; }}
        >
          <PlusOutlined /> 添加设备组
        </Button>}

        <SummarySection
          groups={project.groups}
          version={project.currentVersion}
          onDiscountChange={handleDiscountChange}
          onVersionUpdate={handleProjectUpdate}
          readOnly={isLocked || isSaving}
        />

        {/* 删除设备组/删除物料确认弹窗 */}
        <ConfirmDeleteModal
          title="确认删除此设备组？"
          description="删除后所有物料将丢失，设备组编号将重新排列。"
          open={!!deleteGroupId}
          onCancel={() => setDeleteGroupId(null)}
          onConfirm={confirmDeleteGroup}
        />
        <ConfirmDeleteModal
          title="确认删除此物料？"
          description="删除后不可恢复，物料编号将重新排列。"
          open={!!deleteItemId}
          onCancel={() => setDeleteItemId(null)}
          onConfirm={confirmDeleteItem}
        />

        <div style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
          marginTop: 16, padding: '12px 0', borderTop: `1px solid ${COLORS.border}`
        }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <IconButton icon={<SaveOutlined style={{ fontWeight: 700 }} />}
              onClick={handleSave} color={hasChanges && !isLocked && !isSaving ? COLORS.amber : COLORS.textLight} hoverBg="#fff7e6" title="保存"
              disabled={isSaving || !hasChanges || isLocked} />
            <IconButton icon={<SendOutlined style={{ fontWeight: 700 }} />}
              onClick={handleSubmit} color={!hasChanges && !isLocked && !isSaving && project && !project.id.startsWith('proj-') ? COLORS.primary : COLORS.textLight} hoverBg="#e6f0fa" title="提交"
              disabled={isSaving || hasChanges || isLocked || !project || project.id.startsWith('proj-')} />
            <IconButton icon={<DownloadOutlined style={{ fontWeight: 700 }} />}
              onClick={handleExport} color={COLORS.success} hoverBg="#e8f5e9" title="生成报价" />
          </div>
        </div>
      </div>}
    </ConfigProvider>
  );
};


export default QuotationPage;
