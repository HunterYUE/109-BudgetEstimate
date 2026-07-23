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
import type { Group, GroupItem, Project, ProjectVersion, Component } from '../types';
import { calcProjectSummary, calcDirectCost, calcItemPrices } from '../utils/calculations';
import { clearCache } from '../utils/api';
import { projectService } from '../services/projectService';
import IconButton from '../components/IconButton';
import { COLORS } from '../styles/colors';
import { exportHtmlTable } from '../utils/exportToExcel';


/** 生成销售编号：A{年份}-{月份}-{4位流水}-S（销售阶段）
 *  转交付后后缀变为 -E，以前缀关联 */
function generateSalesNo(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 9000) + 1000).padStart(4, '0');
  return `A${year}${month}${day}-${seq}-S`;
}


/** 重新编号：所有设备组按顺序重排 group_no */
function renumberEquipGroups(groups: Group[]): Group[] {
  let no = 0;
  return groups.map(g => {
    if (g.groupType === 'EQUIPMENT') {
      no++;
      return { ...g, groupNo: no };
    }
    return g;
  });
}


/** Return default fixed groups with default items (from A2026-07-002-S) */
function getFixedGroups(): any[] {
  const fi = (o: any) => ({
    id: crypto.randomUUID(), itemNo: 0, itemType: 'SERVICE', componentId: '',
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
    id: 'proj-' + crypto.randomUUID().slice(0, 6),
    salesNo: salesNo,
    clientName: '新项目',
    clientCode: '',
    projectScope: '2年质保',
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
    id: 'v-' + crypto.randomUUID().slice(0, 6),
    versionNo: 'V1.0',
    eurRate: 7.8, taxRate: 0.13, roundingDigits: 0,
    warrantyRate: 0.01, riskRate: 0.03, commercialCost: 0,
    totalDirectCost: 0, totalAccountingPrice: 0,
    discountedPrice: 0, discountRate: 0,
    gp3ProfitRate: 0,
    reviewStatus: 'draft',
  };
  return {
    ...base,
    currentVersion: blankVersion,
    groups: [
      { id: 'grp-eqp-' + crypto.randomUUID().slice(0, 6), groupNo: 1, groupType: 'EQUIPMENT', name: '设备组 #1', isFixed: false, items: [] },
      ...getFixedGroups().map((g, i) => ({ ...g, id: g.id + '-' + crypto.randomUUID().slice(0, 6), groupNo: i + 2 })),
    ],
  };
};

/** 默认版本（无数据时 fallback） */
const FALLBACK_VERSION: ProjectVersion = {
  id: '', versionNo: 'V1.0', eurRate: 8.15, taxRate: 0.13, roundingDigits: 0,
  warrantyRate: 0.01, riskRate: 0.03, commercialCost: 0,
  totalDirectCost: 0, totalAccountingPrice: 0, discountedPrice: 0, discountRate: 0,
  gp3ProfitRate: 0, reviewStatus: 'draft',
};

const QuotationPage: React.FC = () => {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [quotationLocked, setQuotationLocked] = useState(false);
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<{ groupId: string; itemId: string } | null>(null);
  const [componentDB, setComponentDB] = useState<Component[]>([]);
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
  const savingRef = useRef(false); // ⚠️ 同步防重入锁（比 useState 更可靠）
  const oppIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        if (quoteId && quoteId !== 'new') {
          const quotation = await quotationService.get(quoteId);
          const pid = (quotation as any).projectId || quotation.projectId;
          if (!pid) throw new Error('no project_id');
          oppIdRef.current = (quotation as any).opportunityId || null;
          const data = await projectService.getFull(pid);
          if (!cancelled) {
            // 取与报价版本号匹配的版本（若无匹配则用最新版）
            const quoteVerNo = (quotation as any).versionNo || '';
            const lv = data.versions?.find(v => v.versionNo === quoteVerNo) || data.versions?.[0];
            // ⚠️ 锁定规则：先根据 DB 字段和版本状态判断，最后检查机会签单状态（全覆盖）
            let shouldLock = (quotation as any).locked === true;
            // 版本状态规则：待审批锁定，审批通过/驳回后解锁
            if (lv?.reviewStatus === 'pending') shouldLock = true;
            if (lv?.reviewStatus === 'approved') shouldLock = false;
            if (lv?.reviewStatus === 'rejected') shouldLock = false;
            // ⚠️ 报价表自身状态兜底（兼容历史数据中版本状态未同步的情况）
            if ((quotation as any).status === 'approved') shouldLock = false;
            if ((quotation as any).status === 'rejected') shouldLock = false;
            // 已签单（中标+赢）强制锁定，覆盖版本规则
            if (oppIdRef.current) {
              try {
                const checkOpp = await opportunityService.get(oppIdRef.current);
                if (checkOpp.stage === '中标' && checkOpp.status === '赢') shouldLock = true;
                if (checkOpp.terminated) shouldLock = true;
              } catch { console.warn("[Caught]"); }
            }
            setQuotationLocked(shouldLock);
            // ⚠️ 按版本过滤组数据；无匹配时检查是否为无版本隔离的旧数据（此时回退全量组），
            // 否则视为新版本尚无组，保持空（避免加载全量组后保存导致版本内组重复）
            let versionGroups = data.groups?.filter((g: any) => g.versionId === lv?.id) || [];
            if (versionGroups.length === 0) {
              const hasVersionedGroups = data.groups?.some((g: any) => g.versionId);
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
          let prefill = {};
          if (oppId) {
            try {
              const opp = await opportunityService.get(oppId);
              if (opp.stage === '中标' && opp.status === '赢') { setQuotationLocked(true); }
              if (opp.terminated) { setQuotationLocked(true); }
              const cn = opp.clientName || '';
              // 从客户列表查找客户编号
              let cc = '';
              try {
                const clients = await clientService.list();
                const match = clients.find((c: any) => c.name === cn);
                if (match) cc = match.code || match.clientCode || '';
              } catch { console.warn("[Caught]"); }
              prefill = { salesNo: opp.salesNo || '', clientName: cn, clientCode: cc, expectedAwardDate: opp.expectedCloseDate || '', projectName: opp.projectName || '' };
            } catch { console.warn("[Caught]"); }
          }
          if (!cancelled) {
            const base = initProject();
            setProject({ ...base, ...prefill, salesNo: (prefill.salesNo || base.salesNo) });
            setHasChanges(true);
          }
        }
      } catch (err) { console.error(err);
      } finally { if (!cancelled) setLoading(false); }
    }
    load();
    componentService.list().then(d => { if (!cancelled && d) setComponentDB(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [quoteId]);

  /** 当物料编码匹配数据库时，自动填充成本/工时/质保/采购方式 */
// 仅在 componentDB 加载后触发一次物料编码填充
// eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!project || componentDB.length === 0) return;
    let changed = false;
    const designRateFromDB = componentDB.find((c: any) => c.code === 'SV-DESIGN-000000-V1.0')?.unitCost ?? 175;
    const assemblyRateFromDB = componentDB.find((c: any) => c.code === 'SV-INSASS-000000-V1.0')?.unitCost ?? 85;
    const newGroups = project.groups.map(g => ({
      ...g,
      items: g.items.map(item => {
        if (!item.code) return item;
        const comp = componentDB.find(c => c.code === item.code);
        if (!comp) return item;
        // 逐字段填充：仅当当前值为 0/空 且数据库有值时才填充
        const updated = { ...item };
        let itemChanged = false;
        if (item.unitCost === 0 && comp.unitCost) { updated.unitCost = comp.unitCost; itemChanged = true; }
        if (item.designHours === 0 && comp.designHours) { updated.designHours = comp.designHours; itemChanged = true; }
        if (item.assemblyHours === 0 && comp.assemblyHours) { updated.assemblyHours = comp.assemblyHours; itemChanged = true; }
        if (comp.hasWarranty !== undefined && comp.hasWarranty !== item.hasWarranty) { updated.hasWarranty = comp.hasWarranty; itemChanged = true; }
        if (comp.unit && comp.unit !== item.unit) { updated.unit = comp.unit; itemChanged = true; }
        if (comp.sourcingType && comp.sourcingType !== item.sourcingType) { updated.sourcingType = comp.sourcingType; itemChanged = true; }
        // 填充工时费率（从数据库找 t10-1/t10-2 标签项，或使用默认值）
        if (!updated.designHourRate) { updated.designHourRate = designRateFromDB; itemChanged = true; }
        if (!updated.assemblyHourRate) { updated.assemblyHourRate = assemblyRateFromDB; itemChanged = true; }
        // 填充后重算直接成本和预期售价
        if (itemChanged || updated.directCost === 0) {
          updated.directCost = calcDirectCost(updated);
          const p = calcItemPrices(updated.directCost, updated.marginRate || 0.15);
          updated.basicPrice = p.basicPrice;
          updated.accountingPrice = p.accountingPrice;
          changed = true; return updated;
        }
        return item;
      }),
    }));
    if (changed) setProject(prev => prev ? { ...prev, groups: newGroups } : prev);
  }, [componentDB, project?.id]);

  const handleGroupChange = useCallback((groupId: string, items: GroupItem[]) => {
    setProject(prev => ({
      ...prev,
      groups: prev.groups.map(g => g.id === groupId ? { ...g, items } : g),
    }));
    setHasChanges(true);
  }, []);

  const handleAddItem = useCallback((groupId: string) => {
    // 从物料数据库动态获取工费费率
    const designRate = componentDB.find(c => c.code === 'SV-DESIGN-000000-V1.0')?.unitCost ?? 175;
    const assemblyRate = componentDB.find(c => c.code === 'SV-INSASS-000000-V1.0')?.unitCost ?? 85;
    setProject(prev => ({
      ...prev,
      groups: prev.groups.map(g => {
        if (g.id !== groupId) return g;
        const maxNo = g.items.reduce((max, item) => Math.max(max, item.itemNo), 0);
        const newItem: GroupItem = {
          id: crypto.randomUUID(),
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
      }),
    }));
    setHasChanges(true);
  }, [componentDB]);

  const handleDeleteItem = useCallback((groupId: string, itemId: string) => {
    setDeleteItemId({ groupId, itemId });
  }, []);

  const confirmDeleteItem = useCallback(() => {
    if (!deleteItemId) return;
    setProject(prev => ({
      ...prev,
      groups: prev.groups.map(g => {
        if (g.id !== deleteItemId.groupId) return g;
        const items = g.items.filter(i => i.id !== deleteItemId.itemId);
        return { ...g, items: items.map((i, idx) => ({ ...i, itemNo: idx + 1 })) };
      }),
    }));
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
      const groups = renumberEquipGroups(prev.groups.filter(g => g.id !== deleteGroupId));
      return { ...prev, groups };
    });
    // 同步从数据库删除组记录
    if (!deleteGroupId.startsWith('grp-') && !deleteGroupId.startsWith('proj-') && !deleteGroupId.startsWith('-')) {
      projectService.deleteGroup(deleteGroupId).catch(() => {});
    }
    setDeleteGroupId(null);
    setHasChanges(true);
    messageApi.success('设备组已删除并重新编号');
  }, [deleteGroupId, messageApi]);

  const handleAddGroup = useCallback(() => {
    setProject(prev => {
      const equipGroups = prev.groups.filter(g => g.groupType === 'EQUIPMENT');
      const newNo = equipGroups.length + 1;
      const newId = crypto.randomUUID();
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
      return { ...prev, groups: renumberEquipGroups(groups) };
    });
    setHasChanges(true);
    messageApi.success('已添加新设备组');
  }, [messageApi]);

  const handleDiscountChange = useCallback((value: number) => {
    setProject(prev => ({
      ...prev,
      currentVersion: { ...prev.currentVersion, discountedPrice: value },
    }));
    setHasChanges(true);
  }, []);

  const handleProjectUpdate = useCallback((field: string, value: string | number) => {
    setProject(prev => {
      if (field === 'versionNo' || field === 'eurRate' || field === 'taxRate' || field === 'warrantyRate' || field === 'riskRate' || field === 'commercialCost') {
        return { ...prev, currentVersion: { ...prev.currentVersion, [field]: value } };
      }
      return { ...prev, [field]: value };
    });
    setHasChanges(true);
  }, []);

  const handleGroupNameChange = useCallback((groupId: string, name: string) => {
    setProject(prev => ({
      ...prev,
      groups: prev.groups.map(g => g.id === groupId ? { ...g, name } : g),
    }));
    setHasChanges(true);
  }, []);

  const validateCodes = useCallback((): string[] => {
    const badCodes: string[] = [];
    for (const g of project.groups) {
      for (const item of g.items) {
        if (item.code && componentDB.length > 0 && !componentDB.some((c: any) => c.code === item.code)) {
          badCodes.push(item.code);
        }
      }
    }
    return badCodes;
  }, [project, componentDB]);


  // ⚠️ 报价同步金额取 calcProjectSummary 汇总值，discountedPrice 需传未税（从含税存储值转换）
  const syncQuotation = useCallback(async (versionNo, status, overrideProjectId?: string) => {
    if (!project) return undefined;
    const p = project.currentVersion;
    const pid = overrideProjectId || project.id;
    const syncUntaxed = p?.discountedPrice ? Math.round(p.discountedPrice / (1 + (p.taxRate || 0.13))) : undefined;
    const summary = calcProjectSummary(project.groups || [], p, syncUntaxed);
    const result = await quotationService.sync({
      projectId: pid,
      versionNo: versionNo,
      salesNo: project.salesNo,
      clientName: project.clientName,
      // ⚠️ projectName 不可回退到 projectScope（早期数据中 scope 被误填为"2年质保"）
      projectName: project.projectName || project.clientName,
      status: status,
      amount: summary.discountedPrice || 0,
      totalCost: summary.totalCost || 0,
      profitRate: Math.round((summary.gp3 || 0) * 10000) / 100,
      opportunityId: oppIdRef.current,
    });
    return result;
  }, [project]);

  const handleSave = useCallback(async () => {
    if (savingRef.current) return; // ⚠️ 同步防重入锁
    if (!project) return;
    if (isLocked) { messageApi.warning('此报价已锁定，无法修改'); return; }
    if (!project.clientName.trim()) { messageApi.warning('请输入客户名称'); return; }
    if (!project.projectName.trim()) { messageApi.warning('请输入项目名称'); return; }
    if (!project.projectScope.trim()) { messageApi.warning('请输入项目范围'); return; }
    const totalItems = project.groups.reduce((s, g) => s + g.items.length, 0);
    if (totalItems === 0) { messageApi.warning('请至少添加一个物料条目'); return; }
    const badCodes = validateCodes();
    if (badCodes.length > 0) {
      messageApi.warning('以下编码不在组件数据库中，请先注册再保存：' + badCodes.join(', '));
      return;
    }
    const curVer = project.currentVersion;
    // 始终使用当前版本号保存（不迭代版本，版本编辑由用户手动输入）
    const versionForSave = curVer ? curVer.versionNo : 'V1.0';
    const statusForSave = curVer ? curVer.reviewStatus : 'draft';
    try {
      savingRef.current = true;
      setIsSaving(true); // ⚠️ 防止重复点击
      const isNew = project.id.startsWith('proj-');
      if (isNew) {
        const created = await projectService.create({
          salesNo: project.salesNo, versionNo: curVer?.versionNo || 'V1.0', clientName: project.clientName, clientCode: project.clientCode,
          projectScope: project.projectScope, projectName: project.projectName || '', projectStage: project.projectStage,
          expectedAwardDate: project.expectedAwardDate, projectLayout: project.projectLayout,
          deliveryPeriod: project.deliveryPeriod, paymentTerms: project.paymentTerms,
          postfix: project.postfix, note: project.note,
        });
        const newId = created.id;
        setProject(prev => prev ? { ...prev, id: newId } : prev);
        const newVerUntaxed = curVer.discountedPrice ? Math.round(curVer.discountedPrice / (1 + (curVer.taxRate || 0.13))) : undefined;
        const newVerSummary = calcProjectSummary(project.groups || [], curVer, newVerUntaxed);
        const sv = await projectService.saveVersion(newId, {
          ...curVer, id: undefined,
          versionNo: versionForSave, reviewStatus: statusForSave,
          totalDirectCost: newVerSummary.totalDirectCost,
          totalAccountingPrice: newVerSummary.totalAccountingPrice,
          discountedPrice: newVerSummary.discountedPrice,
          discountRate: newVerSummary.discountRate,
          gp3ProfitRate: newVerSummary.gp3,
          gp3Amount: newVerSummary.gp3Amount,
          totalCost: newVerSummary.totalCost,
          warrantyCost: newVerSummary.warrantyCost,
          riskCost: newVerSummary.riskCost,
          materialCost: newVerSummary.materialCost,
          laborCost: newVerSummary.laborCost,
          projectExpense: newVerSummary.projectExpense,
        });
        const svId = sv.id;
        for (const g of project.groups) {
          await projectService.saveGroup(newId, svId, { ...g, id: undefined, items: g.items.map(i => ({ ...i, id: undefined })) });
        }
        const syncResult = await syncQuotation(versionForSave, statusForSave, newId);
        const qid = syncResult?.id || '';
        // ⚠️ 必须同步更新计算字段，否则 handleSubmit 会使用旧版的过期数据覆盖数据库
        setProject(prev => prev ? { ...prev, id: newId, currentVersion: { ...prev.currentVersion, ...newVerSummary, id: svId, versionNo: versionForSave, reviewStatus: statusForSave } } : prev);
        // 新建报价保存后跳转到报价 URL，刷新不再丢失
        // 回写 opportunity.quotationId，使销售管理页面图标变为编辑
        if (qid && oppIdRef.current) {
          opportunityService.update(oppIdRef.current, { quotationId: qid } as any).catch(() => {});
        }
        if (qid && quoteId === 'new') navigate('/quotations/' + qid, { replace: true });
      } else {
        await projectService.update(project.id, {
          clientName: project.clientName, clientCode: project.clientCode,
          projectScope: project.projectScope, projectName: project.projectName || '', projectStage: project.projectStage,
          expectedAwardDate: project.expectedAwardDate, projectLayout: project.projectLayout,
          deliveryPeriod: project.deliveryPeriod, paymentTerms: project.paymentTerms,
          postfix: project.postfix, note: project.note,
        });
        const versionUntaxed = curVer.discountedPrice ? Math.round(curVer.discountedPrice / (1 + (curVer.taxRate || 0.13))) : undefined;
        const versionSummary = calcProjectSummary(project.groups || [], curVer, versionUntaxed);
        const versionPayload = {
          ...curVer,
          versionNo: versionForSave, reviewStatus: statusForSave,
          totalDirectCost: versionSummary.totalDirectCost,
          totalAccountingPrice: versionSummary.totalAccountingPrice,
          discountedPrice: versionSummary.discountedPrice,
          discountRate: versionSummary.discountRate,
          gp3ProfitRate: versionSummary.gp3,
          gp3Amount: versionSummary.gp3Amount,
          totalCost: versionSummary.totalCost,
          warrantyCost: versionSummary.warrantyCost,
          riskCost: versionSummary.riskCost,
          materialCost: versionSummary.materialCost,
          laborCost: versionSummary.laborCost,
          projectExpense: versionSummary.projectExpense,
        };
        const savedVersion = await projectService.saveVersion(project.id, versionPayload);
        const savedVersionId = savedVersion.id;
        for (const g of project.groups) {
          await projectService.saveGroup(project.id, savedVersionId, { ...g, items: g.items });
        }
        const syncResult = await syncQuotation(versionForSave, statusForSave);
        const newQid = syncResult?.id || "";
        if (newQid && oppIdRef.current && quoteId) {
          opportunityService.update(oppIdRef.current, { quotationId: newQid } as any).catch(() => {});
        }
        setProject(prev => prev ? { ...prev, currentVersion: { ...prev.currentVersion, ...versionSummary, id: savedVersionId, versionNo: versionForSave, reviewStatus: statusForSave } } : prev);
      }
      clearCache('/projects');
      setHasChanges(false);
      messageApi.success('概算表已保存');
    } catch (err: unknown) {
      console.error("[SaveError]", err);
      messageApi.error('保存失败：' + (err.message || '未知错误'));
    } finally {
      setIsSaving(false);
      savingRef.current = false;
    }
  }, [validateCodes, messageApi, project, isLocked, syncQuotation, quoteId, navigate]);

  const handleSubmit = useCallback(async () => {
    if (savingRef.current) return; // ⚠️ 同步防重入锁
    if (isLocked) { messageApi.warning('此报价已锁定，无法提交'); return; }
    if (!project) return;
    if (project.id.startsWith('proj-')) { messageApi.warning('请先保存报价，再提交审批'); return; }
    const badCodes = validateCodes();
    if (badCodes.length > 0) {
      messageApi.warning('以下编码不在组件数据库中，请先注册再提交：' + badCodes.join(', '));
      return;
    }
    const curVer = project.currentVersion;
    if (!curVer || !curVer.versionNo) { messageApi.warning('版本号异常'); return; }
    try {
      savingRef.current = true;
      setIsSaving(true); // ⚠️ 防止重复点击
      await projectService.update(project.id, {
        clientName: project.clientName, clientCode: project.clientCode,
        projectScope: project.projectScope, projectStage: project.projectStage,
        expectedAwardDate: project.expectedAwardDate, projectLayout: project.projectLayout,
        deliveryPeriod: project.deliveryPeriod, paymentTerms: project.paymentTerms,
        postfix: project.postfix, note: project.note,
      });
      // ⚠️ 必须先重新计算汇总值再保存版本，否则 curVer 中的 discountRate/gp3ProfitRate 是过期数据
      const submitUntaxed = curVer?.discountedPrice ? Math.round(curVer.discountedPrice / (1 + (curVer.taxRate || 0.13))) : undefined;
      const submitSummary = calcProjectSummary(project.groups || [], curVer, submitUntaxed);
      const updatedVersion = {
        ...curVer, reviewStatus: 'pending',
        totalDirectCost: submitSummary.totalDirectCost,
        totalAccountingPrice: submitSummary.totalAccountingPrice,
        discountedPrice: submitSummary.discountedPrice,
        discountRate: submitSummary.discountRate,
        gp3ProfitRate: submitSummary.gp3,
        gp3Amount: submitSummary.gp3Amount,
        totalCost: submitSummary.totalCost,
        warrantyCost: submitSummary.warrantyCost,
        riskCost: submitSummary.riskCost,
        materialCost: submitSummary.materialCost,
        laborCost: submitSummary.laborCost,
        projectExpense: submitSummary.projectExpense,
      };
      const savedVer = await projectService.saveVersion(project.id, updatedVersion);
      const savedVerId = savedVer.id;
      // 注意：组数据已在 handleSave 中保存，此处不再重复保存，避免翻倍
      const synced = await quotationService.sync({
        projectId: project.id, versionNo: curVer.versionNo,
        salesNo: project.salesNo, clientName: project.clientName,
        projectName: project.projectName || project.clientName, status: 'pending',
        amount: submitSummary.discountedPrice || 0, totalCost: submitSummary.totalCost || 0,
        profitRate: Math.round((submitSummary.gp3 || 0) * 10000) / 100,
        opportunityId: oppIdRef.current,
      });
      const quotationId = (synced as any)?.id || '';
      await approvalService.create({
        approvalType: 'quotation', quotationId: quotationId,
        salesNo: project.salesNo, versionNo: curVer?.versionNo || 'V1.0', clientName: project.clientName,
        projectName: project.projectName || project.clientName,
        amount: submitSummary.discountedPrice || 0,
        totalCost: submitSummary.totalCost,
        profitRate: Math.round((submitSummary.gp3 || 0) * 10000) / 100,
        gp3: submitSummary.gp3,
        taxRate: curVer?.taxRate || 0.13,
        totalAccountingPrice: submitSummary.totalAccountingPrice,
        discountedPrice: submitSummary.discountedPrice || 0,
        discountRate: submitSummary.discountRate || 0,
        gp3Amount: submitSummary.gp3Amount || 0,
        submitter: submitterName, status: 'pending',
      });
      // 提交不创建新版本，用户手动修改版本号→保存时才创建
      setProject(prev => prev ? { ...prev, currentVersion: { ...prev.currentVersion, ...submitSummary, id: savedVerId, reviewStatus: 'pending' } } : prev);
      clearCache('/projects');
      setQuotationLocked(true);
      setHasChanges(false);
      messageApi.success('已提交审批');
    } catch (err: unknown) {
      console.error("[SaveError]", err);
      messageApi.error('提交失败：' + (err.message || '未知错误'));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [validateCodes, messageApi, project, isLocked, submitterName]);

  // ⚠️ 所有 calcProjectSummary 调用必须传入未税 discountedPrice（已含税存储的 ÷(1+taxRate) 转换）
  const summary = useMemo(() => {
    if (!project || !project.currentVersion) return null;
    const memoUntaxed = project.currentVersion.discountedPrice
      ? Math.round(project.currentVersion.discountedPrice / (1 + (project.currentVersion.taxRate || 0.13)))
      : undefined;
    return calcProjectSummary(project.groups, project.currentVersion, memoUntaxed);
  }, [project]);

  const handleExport = useCallback(() => {
    if (!project || !project.currentVersion || project.currentVersion.reviewStatus !== 'approved') {
      messageApi.warning('报价需审批通过后方可导出');
      return;
    }
    let groupsHtml = '';
    for (let gi = 0; gi < project.groups.length; gi++) {
      const g = project.groups[gi];
      let groupTotal = 0;
      for (let ii = 0; ii < g.items.length; ii++) {
        groupTotal += g.items[ii].accountingPrice;
      }
      groupsHtml += '<tr style="font-weight:700;background:#f5f7fa">' +
        '<td style="text-align:center">' + g.groupNo + '</td>' +
        '<td>' + g.name + '</td>' +
        '<td style="text-align:center">1</td>' +
        '<td class="amount"></td>' +
        '<td class="amount">¥' + Math.round(groupTotal).toLocaleString() + '</td></tr>';
      for (let ii = 0; ii < g.items.length; ii++) {
        const item = g.items[ii];
        if (item.accountingPrice <= 0) continue;
        groupsHtml += '<tr><td style="text-align:center">' + g.groupNo + '.' + item.itemNo + '</td>' +
          '<td>' + (item.code || item.description || '—') + '</td>' +
          '<td style="text-align:center">' + item.qtyTotal + '</td>' +
          '<td class="amount">¥' + Math.round(item.accountingPrice / (item.qtyTotal || 1)).toLocaleString() + '</td>' +
          '<td class="amount">¥' + Math.round(item.accountingPrice).toLocaleString() + '</td></tr>';
      }
    }

    let html = '<h2 style="text-align:center;margin-bottom:16px">报价表</h2>';
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">';
    html += '<tr><td style="border:none;padding:2px 8px;font-size:12px"><b>客户：</b>' + project.clientName + '</td>';
    html += '<td style="border:none;padding:2px 8px;font-size:12px"><b>报价编号：</b>' + project.salesNo + '</td></tr>';
    html += '<tr><td style="border:none;padding:2px 8px;font-size:12px"><b>版本：</b>' + project.currentVersion.versionNo + '</td>';
    html += '<td style="border:none;padding:2px 8px;font-size:12px"><b>日期：</b>' + new Date().toISOString().slice(0, 10) + '</td></tr></table>';
    html += '<table style="width:100%;border-collapse:collapse"><thead><tr><th style="width:44px">序号</th><th>项目</th><th style="width:52px">数量</th><th style="width:120px">单价(未税)</th><th style="width:130px">总价(未税)</th></tr></thead><tbody>' + groupsHtml + '</tbody></table>';
    html += '<table style="width:100%;border-collapse:collapse;margin-top:12px">';
    html += '<tr><td style="border:none;text-align:right;padding:4px 10px;font-size:13px"><b>预期总价（含税）：</b>¥' + Math.round(summary.totalAccountingPrice).toLocaleString() + '</td></tr>';
    html += '<tr><td style="border:none;text-align:right;padding:4px 10px;font-size:13px"><b>折后报价（含税）：</b>¥' + Math.round(summary.discountedPrice).toLocaleString() + '</td></tr></table>';
    html += '<p style="font-size:11px;color:#999;margin-top:16px">明细项/单价为不含税价格，预期总价/折后报价为含税价格</p>';

    exportHtmlTable('报价表_' + project.clientName + '_' + project.salesNo, html);
  }, [project, summary, messageApi]);

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
        <div style={{ fontSize: 14, marginBottom: 20 }}>报价不存在或已被删除</div>
        <Button onClick={() => navigate('/quotations')}>返回报价列表</Button>
      </div>}
      {!invalidQuote && <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ArrowLeftOutlined style={{ fontSize: 18, color: COLORS.primary, cursor: 'pointer' }} onClick={() => navigate('/quotations')} />
            <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark }}>报价编制</span>
            <span style={{
              fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 4,
              background: project.currentVersion.reviewStatus === 'approved' ? '#e8f5e9' :
                          project.currentVersion.reviewStatus === 'pending' ? '#fff3e0' :
                          project.currentVersion.reviewStatus === 'rejected' ? '#ffebee' : COLORS.bgTag,
              color: project.currentVersion.reviewStatus === 'approved' ? COLORS.success :
                     project.currentVersion.reviewStatus === 'pending' ? COLORS.warning :
                     project.currentVersion.reviewStatus === 'rejected' ? COLORS.danger : COLORS.textSecondary,
            }}>
              {{
                draft: '草稿',
                pending: '待审批',
                approved: '已通过',
                rejected: '已驳回',
              }[project.currentVersion.reviewStatus]}
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

        <ProjectHeader project={project} onUpdate={handleProjectUpdate} readOnly={isLocked} />

        <div style={{
          marginBottom: 12, fontSize: 12, fontWeight: 600, color: '#3a4a6a', lineHeight: 1.8
        }}>
          <strong style={{ color: COLORS.primary }}>说明：</strong>
          ① 所有价格默认不含税 &nbsp;② 直接成本=物料成本+人工成本+项目费用（物料=设备组/集成开发物料，人工=设计工时+装配工时+项目交付，项目费用=包装运输+差旅管理+其他）
          &nbsp;③ 毛利率=1−成本÷售价 &nbsp;④ 质保基数=标"✕"项次的直接成本之和，标"✕"表示物料本身不含质保，需项目集成时统筹
          &nbsp;⑤ 风险基数=直接成本=物料成本+人工成本+项目费用
          &nbsp;⑥ 编码不在数据库将显示红色<strong style={{color:'red'}}>!</strong>示警
          &nbsp;⑦ 实际成本与概算对比：分项 -5%~+10%、总成本 -2.5%~+5% 为正常，超出此范围标红，<strong style={{color:COLORS.primary}}>目标不是做多也不是做少，而是越来越准</strong>
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
              editable={!isLocked}
            />
          ))}
        </div>

        {!isLocked && <Button type="default" ghost
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
          readOnly={isLocked}
        />

        {/* 删除设备组弹窗 */}
        <Modal
          title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.5 }}>确认删除此设备组？</span>}
          open={!!deleteGroupId}
          onCancel={() => setDeleteGroupId(null)}
          width={420}
          destroyOnHidden
          styles={{ body: { padding: '24px 28px 12px' } }}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button icon={<CloseOutlined />} onClick={() => setDeleteGroupId(null)}
                style={{ borderRadius: 3, width: 36, height: 36 }} />
              <Button type="primary" ghost icon={<CheckOutlined />} onClick={confirmDeleteGroup}
                style={{ borderColor: COLORS.danger, color: COLORS.danger, borderRadius: 3, width: 36, height: 36 }} />
            </div>
          }
        >
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontSize: 14, color: COLORS.textSecondary }}>删除后所有物料将丢失，设备组编号将重新排列。</div>
          </div>
        </Modal>

        {/* 删除物料条目弹窗 */}
        <Modal
          title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.5 }}>确认删除此物料？</span>}
          open={!!deleteItemId}
          onCancel={() => setDeleteItemId(null)}
          width={420}
          destroyOnHidden
          styles={{ body: { padding: '24px 28px 12px' } }}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button icon={<CloseOutlined />} onClick={() => setDeleteItemId(null)}
                style={{ borderRadius: 3, width: 36, height: 36 }} />
              <Button type="primary" ghost icon={<CheckOutlined />} onClick={confirmDeleteItem}
                style={{ borderColor: COLORS.danger, color: COLORS.danger, borderRadius: 3, width: 36, height: 36 }} />
            </div>
          }
        >
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontSize: 14, color: COLORS.textSecondary }}>删除后不可恢复，物料编号将重新排列。</div>
          </div>
        </Modal>



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


if (import.meta.hot) {
  import.meta.hot.decline();
}

export default QuotationPage;
