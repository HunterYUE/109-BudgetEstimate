import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Tag, Card, Button, message, Modal, ConfigProvider, Spin, Switch } from 'antd';
import { ScheduleOutlined, AuditOutlined, SendOutlined, SaveOutlined, ArrowLeftOutlined, DownloadOutlined, UploadOutlined, EyeOutlined, DeleteOutlined, CheckOutlined, CloseOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { formatMoney, computeDeliveryEstGP3 } from '../utils/calculations';
import { approvalService } from '../services/approvalService';
import { deliveryService } from '../services/deliveryService';
import { projectService } from '../services/projectService';
import { componentService } from '../services/componentService';
import { api, clearCache } from '../utils/api';
import DeliveryNodeTimeline from '../components/DeliveryNodeTimeline';
import IconButton from '../components/IconButton';
import ItemCostTable from '../components/ItemCostTable';
import type { DeliveryProject, DeliveryNode, NodeChangeEntry, Group, ProjectVersion, ReviewStatus } from '../types';
import { COLORS } from '../styles/colors';
import { getNodeDelay, getProjectDelay } from '../utils/analysisShared';
import { buildCostLines } from '../utils/costBreakdown';
import { DEFAULT_DESIGN_HOURLY_RATE, DEFAULT_ASSEMBLY_HOURLY_RATE } from '../utils/constants';
import { exportHtmlTable } from '../utils/exportToExcel';
import { deliveryFileService, type DeliveryFile } from '../services/deliveryFileService';
import { todayBeijing } from '../utils/timeFormat';
import { useAuth } from '../utils/authContext';

const STATUS_CYCLE: DeliveryNode['status'][] = ['pending', 'in_progress', 'completed'];
const STATUS_LABELS: Record<ReviewStatus, { label: string; color: string }> = {
  draft: { label: '草稿', color: COLORS.textSecondary },
  pending: { label: '待审批', color: COLORS.warning },
  approved: { label: '已通过', color: COLORS.success },
  rejected: { label: '已驳回', color: COLORS.danger },
};

/** 附件类型配置（short=徽标短名，color=徽标底色） */
const ATTACHMENT_TYPES = [
  { key: 'rfq' as const, label: '客户需求书', short: 'RFQ', color: '#4a6fa5' },
  { key: 'techPlan' as const, label: '技术方案', short: '方案', color: '#5b8c5a' },
  { key: 'techAgreement' as const, label: '技术协议', short: '协议', color: '#7b6f9e' },
  { key: 'contract' as const, label: '商务合同', short: '合同', color: '#9e7b5a' },
];

/** 由一次 pending 日期变更构建审计历史条目（无实际变更返回 null） */
function buildChangeEntry(
  change: { oldStart: string; newStartVal: string; oldEnd: string; newEndVal: string },
  modifier: string,
): NodeChangeEntry | null {
  const startChanged = change.oldStart !== change.newStartVal;
  const endChanged = change.oldEnd !== change.newEndVal;
  if (!startChanged && !endChanged) return null;
  const oldDesc = (startChanged ? '开始: ' + change.oldStart : '') +
    (startChanged && endChanged ? ', ' : '') +
    (endChanged ? '结束: ' + change.oldEnd : '');
  const newDesc = (startChanged ? '开始: ' + change.newStartVal : '') +
    (startChanged && endChanged ? ', ' : '') +
    (endChanged ? '结束: ' + change.newEndVal : '');
  const now = new Date();
  const beijingDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  const beijingTs = new Date(now.getTime() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  return { id: crypto.randomUUID(), field: 'plannedDate', oldValue: oldDesc, newValue: newDesc, changedAt: beijingDate, modifier, changedAtFull: beijingTs };
}

const DeliveryDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [msg, ctx] = message.useMessage();
  const location = useLocation();
  // 从 sessionStorage 恢复 tab（刷新后保留），其次从 location.state（从父页面跳转），最后默认 plan
  const [tab, setTab] = useState<'plan' | 'cost' | 'files'>(() => {
    try {
      const saved = sessionStorage.getItem('delivery_tab');
      if (saved === 'plan' || saved === 'cost' || saved === 'files') return saved;
    } catch { /* sessionStorage 不可用时忽略 */ }
    return (location.state as { tab?: 'plan' | 'cost' | 'files' })?.tab || 'plan';
  });
  // tab 切换时持久化
  const handleTabChange = useCallback((t: 'plan' | 'cost' | 'files') => {
    setTab(t);
    try { sessionStorage.setItem('delivery_tab', t); } catch { /* sessionStorage 不可用时忽略 */ }
  }, []);
  const [project, setProject] = useState<DeliveryProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [actualCosts, setActualCosts] = useState<Record<string, number>>({});
  const [savingPlan, setSavingPlan] = useState(false);
  const [submitCostOpen, setSubmitCostOpen] = useState(false);
  const [costOverride, setCostOverride] = useState(false);
  const [laborRates, setLaborRates] = useState<{ design: number; assembly: number }>({ design: DEFAULT_DESIGN_HOURLY_RATE, assembly: DEFAULT_ASSEMBLY_HOURLY_RATE });
  const initialCostsLoaded = useRef(false);
  const [costDirty, setCostDirty] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [submitPlanOpen, setSubmitPlanOpen] = useState(false);
  const [quotationProject, setQuotationProject] = useState<{ groups: Group[]; versions?: ProjectVersion[]; currentVersion?: ProjectVersion; [k: string]: unknown } | null>(null);

  // 待刷新的计划日期变更（审批通过后，3分钟内的多次编辑合并为一次历史记录）
  const pendingDateChangesRef = useRef<Map<string, {
    oldStart: string; newStartVal: string;
    oldEnd: string; newEndVal: string;
    firstChangedAt: number;
  }>>(new Map());

  const { user } = useAuth();
  const modifierName = user?.displayName || user?.email || 'unknown';

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    deliveryService.getFull(id).then(data => {
      if (cancelled) return;
      setProject(data);
      if (data.actualCosts && !initialCostsLoaded.current) {
        setActualCosts(data.actualCosts);
        initialCostsLoaded.current = true;
      }
      if (data.quotationId) {
        // 通过 api.get 加载报价数据（使用统一转换/缓存/错误处理）
        api.get<Record<string, unknown>>(`/quotations/${data.quotationId}`).then(quote => {
          const pid = quote.projectId;
          const qvn = quote.versionNo || '';
          if (!pid) return;
          projectService.getFull(pid as string).then(proj => {
            const ver = (proj.versions || []).find((v: ProjectVersion) => v.versionNo === qvn) || proj.versions?.[0];
            const vid = ver?.id || '';
            const filtered = (proj.groups || []).filter((g: Group) => (g as unknown as Record<string, unknown>).versionId === vid);
            if (!cancelled) setQuotationProject({ ...proj, groups: filtered.length > 0 ? filtered : proj.groups });
          });
        }).catch(() => {/* empty */});
      }
      // 加载物料费率（设计会签/装配调试）
      Promise.all([
        componentService.list({ search: 'SV-DESIGN-000000-V1.0' }),
        componentService.list({ search: 'SV-INSASS-000000-V1.0' }),
      ]).then(([designComps, assyComps]) => {
        if (cancelled) return;
        const designRate = designComps?.[0]?.unitCost || DEFAULT_DESIGN_HOURLY_RATE;
        const assyRate = assyComps?.[0]?.unitCost || DEFAULT_ASSEMBLY_HOURLY_RATE;
        setLaborRates({ design: Number(designRate), assembly: Number(assyRate) });
      }).catch(err => console.warn('[DeliveryDetail] 工时费率查询失败，使用默认费率', (err as Error).message));
    }).catch(() => {/* empty */}).finally(() => setLoading(false));
    return () => { cancelled = true; };
  }, [id]);

  const [deliveryFiles, setDeliveryFiles] = useState<DeliveryFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeFileKey, setActiveFileKey] = useState<string>('');

  const loadFiles = useCallback(async () => {
    if (!id) return;
    try {
      const data = await deliveryFileService.list(id);
      setDeliveryFiles(data);
    } catch { /* 文件加载失败时保持空列表 */ }
  }, [id]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const handleUploadClick = (key: string) => {
    if (uploading) return; // ⚠️ 上传中禁止再次打开文件选择，避免并发上传
    setActiveFileKey(key);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id || !activeFileKey) return;
    if (file.type !== 'application/pdf') { msg.warning('仅支持 PDF 文件'); e.target.value = ''; return; }
    if (file.size > 3 * 1024 * 1024) { msg.warning('文件大小不能超过 3MB'); e.target.value = ''; return; }
    setUploading(true);
    try {
      await deliveryFileService.upload(id, activeFileKey, file);
      clearCache('/deliveries'); // ⚠️ upload 走原生 fetch（非 api.*），不会自动清缓存；只需清交付前缀
      const fresh = await deliveryFileService.list(id);
      setDeliveryFiles(fresh);
      msg.success('上传成功');
    } catch {
      msg.error('上传失败');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveFile = (fileId: string) => {
    if (!id) return;
    // ⚠️ 附件删除不可恢复，需确认（合同/协议等关键文件误删即永久丢失）
    Modal.confirm({
      title: '确认删除该附件？',
      content: '删除后不可恢复。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { style: { background: COLORS.danger, borderColor: COLORS.danger } },
      onOk: async () => {
        try {
          await deliveryFileService.delete(id, fileId);
          msg.success('文件已删除');
          loadFiles();
        } catch {
          msg.error('删除失败');
        }
      },
    });
  };

  const handleViewFile = (fileId: string) => {
    if (!id) return;
    window.open(deliveryFileService.getDownloadUrl(id, fileId), '_blank');
  };

  const quotationGroups: Group[] = useMemo(() => {
    if (!quotationProject) return [];
    return (quotationProject.groups || []) as Group[];
  }, [quotationProject]);

  const quotationVersion = useMemo(() => {
    if (!quotationProject) return undefined;
    const v = quotationProject.currentVersion || quotationProject.versions?.[0];
    if (!v) return undefined;
    return { warrantyRate: v.warrantyRate ?? 0, riskRate: v.riskRate ?? 0, taxRate: v.taxRate ?? 0.13, commercialCost: v.commercialCost ?? 0 };
  }, [quotationProject]);

  /** 报价版本完整财务数据（用于审批创建） */
  const quotationVersionFull = useMemo(() => {
    if (!quotationProject) return undefined;
    const v = quotationProject.currentVersion || quotationProject.versions?.[0];
    return v;
  }, [quotationProject]);

  // 实施计划：仅待审批时锁定
  const planLocked = project?.planStatus === 'pending';
  // 成本对比：待审批或已通过时锁定（已通过时总监可解锁覆盖）
  const costLocked = (project?.costStatus === 'pending') || (project?.costStatus === 'approved' && !costOverride);
  const costCanEdit = project?.costStatus !== 'pending' && (project?.costStatus !== 'approved' || costOverride);
  const isDirector = user?.role === 'director';

  // ---- Node handlers ----
  /** 节点状态变更：不记历史，仅更新实际日期字段 */
  const handleNodeStatusClick = useCallback((nodeId: string, newStatus?: string) => {
    if (!project) return;
    // 节点15（项目总结）切到"已完成"需要成本对比已通过
    const targetNode = project.nodes.find(n => n.id === nodeId);
    if (!targetNode) return;
    // 目标节点唯一，nextStatus 只需计算一次（原实现在 map 内重复计算）
    const nextStatus = (newStatus || STATUS_CYCLE[(STATUS_CYCLE.indexOf(targetNode.status) + 1) % STATUS_CYCLE.length]) as DeliveryNode['status'];
    if (nextStatus === 'completed' && targetNode.nodeNo === 15 && project.costStatus !== 'approved') {
      msg.warning('节点15完成后项目将结束，请先完成成本对比审批');
      return;
    }
    const today = todayBeijing();
    setHasChanges(true);
    setProject(prev => {
      if (!prev) return prev;
      const newNodes = prev.nodes.map(n => {
        if (n.id !== nodeId) return n;
        const updated: DeliveryNode = { ...n, status: nextStatus };
        // 状态变更不记录历史（仅当审批通过后的日期变更才记历史）
        if (nextStatus === 'in_progress') {
          updated.actualStartDate = today;
          if (n.status === 'completed') {
            updated.actualDate = undefined;
            updated.actualEndDate = undefined;
          }
        } else if (nextStatus === 'completed') {
          updated.actualDate = today;
          updated.actualEndDate = today;
        } else if (n.status === 'completed') {
          updated.actualDate = undefined;
          updated.actualEndDate = undefined;
        } else if (n.status === 'in_progress') {
          // 从进行中切走不清除 actualStartDate（保留历史记录）
        }
        return updated;
      });
      return { ...prev, nodes: newNodes };
    });
  }, [project, msg]);

  const handlePlannedDateChange = useCallback((nodeId: string, field: 'plannedStartDate' | 'plannedEndDate', date: string) => {
    if (!project) return;
    const node = project.nodes.find(n => n.id === nodeId);
    if (!node || node[field] === date) return;  // 日期未变，不处理
    // 日期范围验证
    if (field === 'plannedEndDate' && date < node.plannedStartDate) {
      msg.warning('计划结束日期不能早于开始日期');
      return;
    }
    if (field === 'plannedStartDate' && date > node.plannedEndDate) {
      msg.warning('计划开始日期不能晚于结束日期');
      return;
    }
    setHasChanges(true);
    // 审批通过后的日期变更，累积到 pendingDateChangesRef 中（不立即记历史）
    if (project.planStatus === 'approved') {
      const now = Date.now();
      const existing = pendingDateChangesRef.current.get(nodeId);
      if (existing && (now - existing.firstChangedAt < 3 * 60 * 1000)) {
        // 3分钟内已有的待刷新增条目，合并
        if (field === 'plannedStartDate') {
          existing.newStartVal = date;
        } else {
          existing.newEndVal = date;
        }
      } else {
        // 新分组（距上次编辑 >3 分钟）：先把本节点上一组的变更写入 history，避免被覆盖而丢失审计
        const prior = pendingDateChangesRef.current.get(nodeId);
        if (prior) {
          const entry = buildChangeEntry(prior, modifierName);
          if (entry) {
            setProject(prev => prev ? {
              ...prev,
              nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, history: [...n.history, entry] } : n),
            } : prev);
          }
        }
        // 新建待刷新增条目（oldStart/oldEnd 取当前已生效的计划值，即本次编辑前的值）
        pendingDateChangesRef.current.set(nodeId, {
          oldStart: node.plannedStartDate,
          newStartVal: field === 'plannedStartDate' ? date : node.plannedStartDate,
          oldEnd: node.plannedEndDate,
          newEndVal: field === 'plannedEndDate' ? date : node.plannedEndDate,
          firstChangedAt: now,
        });
      }
    }
    setProject(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        nodes: prev.nodes.map(n => {
          if (n.id !== nodeId) return n;
          return { ...n, [field]: date };
        }),
      };
    });
  }, [project, msg, modifierName]);

  const handleNodeCommentsChange = useCallback((nodeId: string, comments: string) => {
    if (!project) return;
    const node = project.nodes.find(n => n.id === nodeId);
    if (!node || node.comments === comments) return; // ⚠️ 无实际变更不置脏
    setHasChanges(true);
    setProject(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, comments } : n),
      };
    });
  }, [project]);

  /**
   * 将累积的待刷新日期变更写入各节点的 history（保存前调用）。
   * ⚠️ 不在本函数删除 pending 条目：删除延迟到调用方保存成功后 clear()，
   *    若保存失败则保留条目，重试仍能生成审计历史（避免历史丢失）。
   */
  const flushPendingDateChanges = useCallback((projectData: DeliveryProject): DeliveryProject => {
    if (projectData.planStatus !== 'approved') return projectData;
    const pending = pendingDateChangesRef.current;
    if (pending.size === 0) return projectData;
    const updatedNodes = projectData.nodes.map(n => {
      if (!n.id) return n;
      const change = pending.get(n.id);
      if (!change) return n;
      const entry = buildChangeEntry(change, modifierName);
      if (!entry) return n;
      return { ...n, history: [...n.history, entry] };
    });
    return { ...projectData, nodes: updatedNodes };
  }, [modifierName]);

  // ── 实施计划保存 ──
  const handleSavePlan = useCallback(async () => {
    if (!project || savingPlan) return; // ⚠️ 防止重复点击
    setSavingPlan(true);
    try {
      const flushed = flushPendingDateChanges(project);
      await deliveryService.saveNodes(project.id, flushed.nodes);
      pendingDateChangesRef.current.clear(); // ⚠️ 保存成功后才清空待处理日期变更（失败保留，重试仍生成历史）
      setProject(flushed);
      setHasChanges(false);
      msg.success('实施计划已保存');
    } catch {
      msg.error('保存失败，请重试');
    } finally {
      setSavingPlan(false);
    }
  }, [project, savingPlan, flushPendingDateChanges, msg]);

  // ---- Cost handlers ----
  const handleActualCostChange = useCallback((itemId: string, value: number) => {
    if (costLocked) return;
    setActualCosts(prev => ({ ...prev, [itemId]: value }));
    setCostDirty(true);
  }, [costLocked]);

  // ---- Approval handlers ----
  const handleSubmitPlan = useCallback(() => {
    if (!project) return;
    if (project.planStatus === 'approved') {
      msg.success('实施计划已审批通过');
      return;
    }
    // Check all planned dates are set
    const emptyDates = project.nodes.filter(n => !n.plannedStartDate || !n.plannedEndDate);
    if (emptyDates.length > 0) {
      msg.warning(`请先填写所有节点的计划开始和结束时间（${emptyDates.map(n => n.name).join('、')}）`);
      return;
    }
    setSubmitPlanOpen(true);
  }, [project, msg]);

  const confirmSubmitPlan = useCallback(async () => {
    if (!project) return;
    // 先保存节点数据（防止用户编辑了计划时间后未点保存直接提交，导致变更丢失）
    try {
      const flushed = flushPendingDateChanges(project);
      await deliveryService.saveNodes(project.id, flushed.nodes);
      pendingDateChangesRef.current.clear(); // ⚠️ 保存成功后才清空待处理日期变更（失败保留，重试仍生成历史）
      setProject(flushed);
      setHasChanges(false);
    } catch {
      msg.error('保存节点数据失败，请重试');
      return;
    }
    const ver = quotationVersionFull;
    const totalAccountingPrice = ver?.totalAccountingPrice || 0;
    const discountedPrice = ver?.discountedPrice || 0;
    const gp3ProfitRate = ver?.gp3ProfitRate || 0;
    // ⚠️ ver.totalCost 已包含 commercialCost（calcProjectSummary 公式），无需再加
    const totalCost = ver?.totalCost || 0;
    approvalService.create({
      approvalType: 'plan',
      status: 'pending',
      quotationId: project.quotationId,
      deliveryId: project.id,
      salesNo: project.salesNo,
      clientName: project.clientName,
      projectName: project.projectName,
      amount: discountedPrice || project.contractAmount,
      totalCost: totalCost,
      profitRate: Math.round(gp3ProfitRate * 10000) / 100,
      gp3: gp3ProfitRate,
      versionNo: ver?.versionNo || '',
      taxRate: quotationVersion?.taxRate ?? 0.13,
      totalAccountingPrice: totalAccountingPrice,
      discountedPrice: discountedPrice,
      discountRate: ver?.discountRate || 0,
      gp3Amount: Math.round(gp3ProfitRate * discountedPrice) || 0,
      submitter: modifierName,
    }).then(() => {
      setProject(prev => prev ? { ...prev, planStatus: 'pending' } : prev);
      setHasChanges(false);
      setSubmitPlanOpen(false);
      msg.success('实施计划已提交审批');
    }).catch((err: unknown) => {
      msg.error('提交审批失败：' + ((err instanceof Error ? err.message : '') || '未知错误'));
    });
  }, [project, msg, quotationVersionFull, quotationVersion, modifierName, flushPendingDateChanges, setHasChanges]);

  const handleOpenSubmitCost = useCallback(() => {
    if (!project) return;
    if (Object.keys(actualCosts).length === 0) {
      msg.warning('请至少录入一项实际成本再提交');
      return;
    }
    setSubmitCostOpen(true);
  }, [project, actualCosts, msg]);

  const handleSubmitCost = useCallback(async () => {
    if (!project) return;
    // 先持久化当前实际成本到 delivery_projects，确保 totalActualCost 与审批数据一致
    const totalActual = Object.values(actualCosts).reduce((s, v) => s + v, 0);
    const { exTax, warrantyCost } = computeDeliveryEstGP3(project.contractAmount, quotationGroups, quotationVersion);
    const grandActual = totalActual + warrantyCost;
    try {
      await deliveryService.update(project.id, { totalActualCost: grandActual, actualCosts });
    } catch {
      msg.error('成本数据保存失败，请重试');
      return;
    }
    const ver = quotationVersionFull;
    const taxRate = quotationVersion?.taxRate ?? 0.13;
    const actProfit = exTax - grandActual;                // 未税利润（与概览条一致）
    const actGP3 = exTax > 0 ? actProfit / exTax : 0;    // GP3（未税=含税）
    // gp3Amount 存含税利润，gp3 存费率（未税/含税相同 totalCost 存未税值供对照）
    approvalService.create({
      approvalType: 'cost',
      status: 'pending',
      quotationId: project.quotationId,
      deliveryId: project.id,
      salesNo: project.salesNo,
      clientName: project.clientName,
      projectName: project.projectName,
      amount: project.contractAmount,
      totalCost: grandActual,
      profitRate: Math.round(actGP3 * 10000) / 100,
      gp3: actGP3,
      versionNo: ver?.versionNo || '',
      taxRate: taxRate,
      totalAccountingPrice: ver?.totalAccountingPrice || 0,
      discountedPrice: ver?.discountedPrice || 0,
      discountRate: ver?.discountRate || 0,
      gp3Amount: Math.round(actProfit * (1 + taxRate)) || 0,  // 含税利润
      submitter: modifierName,
    }).then(() => {
      setProject(prev => prev ? { ...prev, costStatus: 'pending' } : prev);
      setCostDirty(false);
      setSubmitCostOpen(false);
      msg.success('成本对比已提交审批，请前往审批管理模块查看');
    }).catch((err: unknown) => {
      msg.error('提交审批失败：' + ((err instanceof Error ? err.message : '') || '未知错误'));
    });
  }, [project, actualCosts, msg, quotationVersionFull, quotationVersion, quotationGroups, modifierName]);

  const handleExportPlan = useCallback(() => {
    if (!project) return;
    const statusMap = { pending: '未开始', in_progress: '进行中', completed: '已完成' };
    let rows = '';
    for (let i = 0; i < project.nodes.length; i++) {
      const n = project.nodes[i];
      // ⚠️ 共享延期判定：基线 = 初始审批实施计划；无基线显示 —
      const { hasBaseline, days } = getNodeDelay(n);
      const delayStr = hasBaseline ? (days > 0 ? '+' + days : String(days)) : '—';
      rows += '<tr>' +
        '<td style="text-align:center">' + n.nodeNo + '</td>' +
        '<td>' + n.name + '</td>' +
        '<td style="text-align:center">' + (statusMap[n.status] || n.status) + '</td>' +
        '<td style="text-align:center">' + n.plannedStartDate + '</td>' +
        '<td style="text-align:center">' + n.plannedEndDate + '</td>' +
        '<td style="text-align:center">' + (n.actualDate || '—') + '</td>' +
        '<td style="text-align:center">' + delayStr + '</td></tr>';
    }
    const html = '<h2 style="text-align:center;margin-bottom:16px">实施计划</h2>' +
      '<table style="width:100%;border-collapse:collapse;margin-bottom:8px">' +
      '<tr><td style="border:none;padding:2px 8px"><b>项目：</b>' + project.projectName + '</td>' +
      '<td style="border:none;padding:2px 8px"><b>客户：</b>' + project.clientName + '</td></tr></table>' +
      '<table style="width:100%;border-collapse:collapse"><thead><tr><th>节点</th><th>名称</th><th>状态</th><th>计划开始</th><th>计划结束</th><th>实际日期</th><th>延期</th></tr></thead><tbody>' + rows + '</tbody></table>';
    exportHtmlTable('实施计划_' + project.clientName, html);
  }, [project]);

  const handleExportCost = useCallback(() => {
    if (!project) return;
    // ⚠️ 成本分解单一来源 buildCostLines（与 ItemCostTable 共享），消除重复聚合逻辑
    const lines = buildCostLines(quotationGroups, actualCosts, quotationVersion, laborRates);
    let totalEst = 0, totalAct = 0;
    let rows = '';
    const addRow = (grp: string, code: string, est: number, act: number) => {
      totalEst += est; totalAct += act;
      const varAmt = act - est;
      rows += '<tr><td>' + grp + '</td><td>' + code + '</td>' +
        '<td class="amount">' + Math.round(est).toLocaleString() + '</td>' +
        '<td class="amount">' + Math.round(act).toLocaleString() + '</td>' +
        '<td class="amount" style="color:' + (varAmt > 0 ? 'red' : 'green') + '">' + (varAmt >= 0 ? '+' : '') + Math.round(varAmt).toLocaleString() + '</td>' +
        '<td class="amount" style="color:' + (varAmt > 0 ? 'red' : 'green') + '">' + (est > 0 ? (varAmt / est * 100).toFixed(1) + '%' : '—') + '</td></tr>';
    };
    for (const line of lines) {
      // 项次：设计/装配保持「编码 名称」格式，其余 code||detail||'—'（保持原导出输出）
      const code = line.code === 'SV-DESIGN-000000-V1.0' || line.code === 'SV-INSASS-000000-V1.0'
        ? line.code + ' ' + line.detail
        : (line.code || line.detail || '—');
      addRow(line.category, code, line.estimated, line.actual);
    }
    const html = '<h2 style="text-align:center;margin-bottom:16px">成本对比表</h2>' +
      '<table style="width:100%;border-collapse:collapse;margin-bottom:8px">' +
      '<tr><td style="border:none;padding:2px 8px"><b>项目：</b>' + project.projectName + '</td>' +
      '<td style="border:none;padding:2px 8px"><b>客户：</b>' + project.clientName + '</td></tr></table>' +
      '<table style="width:100%;border-collapse:collapse"><thead><tr><th>组</th><th>项次</th><th>概算</th><th>实际</th><th>偏差</th><th>偏差率</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<table style="width:100%;border-collapse:collapse;margin-top:8px">' +
      '<tr><td style="border:none;text-align:right;font-size:13px"><b>概算总成本：</b>¥' + Math.round(totalEst).toLocaleString() + '</td></tr>' +
      '<tr><td style="border:none;text-align:right;font-size:13px"><b>实际总成本：</b>¥' + Math.round(totalAct).toLocaleString() + '</td></tr></table>';
    exportHtmlTable('成本对比_' + project.clientName, html);
  }, [project, quotationGroups, actualCosts, quotationVersion, laborRates]);

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: COLORS.textLight }}>
        <Spin />
      </div>
    );
  }

  // 概算财务数据（使用计算变量而非 useMemo 避免 hooks 条件执行问题）
  let contractExTax = 0, grandEstimated = 0, grandActual = 0;
  let estProfit = 0, actProfit = 0, estGP3 = 0, actGP3 = 0;
  if (project) {
    const ta = Object.values(actualCosts).reduce((s, v) => s + v, 0);
    const { exTax, grandEstimated: ge, warrantyCost: wc } = computeDeliveryEstGP3(project.contractAmount, quotationGroups, quotationVersion);
    grandActual = ta + wc;
    contractExTax = exTax; grandEstimated = ge;
    estProfit = exTax - ge; actProfit = exTax - grandActual;
    estGP3 = exTax > 0 ? (exTax - ge) / exTax : 0;
    actGP3 = exTax > 0 ? (exTax - grandActual) / exTax : 0;
  }

  if (!project) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: COLORS.textLight }}>
        项目未找到
        <div style={{ marginTop: 16 }}>
          <Button onClick={() => navigate('/delivery')}>返回交付管理</Button>
        </div>
      </div>
    );
  }

  const renderApprovalBar = (type: 'plan' | 'cost') => {
    const status = type === 'plan' ? project.planStatus : project.costStatus;
    const label = type === 'plan' ? '实施计划' : '成本对比';
    const cfg = STATUS_LABELS[status];

    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
        background: COLORS.bgLight, borderRadius: 4, marginBottom: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: COLORS.textPrimary }}>{label}</span>
        {cfg && <Tag color={cfg.color} style={{ margin: 0, fontSize: 12, lineHeight: '20px', borderRadius: 3, border: 'none' }}>{cfg.label}</Tag>}
        <div style={{ flex: 1 }} />
      </div>
    );
  };

  const completedNodeCount = project.nodes.filter(n => n.status === 'completed').length;

  return (
    <div>
      {ctx}
      {/* 返回按钮 + 标题 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16,
        background: '#fff', borderRadius: 4, border: `1px solid ${COLORS.border}`,
        padding: '14px 20px',
      }}>
        <div onClick={() => navigate('/delivery')}
          style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: COLORS.primary, fontSize: 16, cursor: 'pointer', userSelect: 'none',
            background: '#f0f5ff', border: '1px solid #d4e3f7',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#d4e3f7'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#f0f5ff'; }}
          title="返回交付管理">
          <ArrowLeftOutlined />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark, letterSpacing: 1 }}>{project.clientName}</span>
            <Tag color={project.status === '已完成' ? 'green' : project.status === '未开始' ? 'default' : 'blue'}
              style={{ margin: 0, fontSize: 12, lineHeight: '20px', borderRadius: 3, border: 'none' }}>
              {project.status}
            </Tag>
            {/* 延期中：派生维度（初始审批基线 vs 更新计划/实际/当前） */}
            {project.status !== '已完成' && getProjectDelay(project).delayed && (
              <Tag color="red" style={{ margin: 0, fontSize: 12, lineHeight: '20px', borderRadius: 3, border: 'none' }}>延期中</Tag>
            )}
            {project.status !== '已完成' && project.nodes.every(n => n.status === 'completed') && project.costStatus === 'approved' && (
              <span onClick={() => {
                Modal.confirm({
                  title: '确认完成项目',
                  content: '所有节点已完成且成本对比已审批通过。确认将此项目标记为已完成？',
                  okText: '确认完成',
                  cancelText: '取消',
                  okButtonProps: { style: { background: COLORS.success, borderColor: COLORS.success } },
                  onOk: () => {
                    deliveryService.update(project.id, { status: '已完成' }).then(() => {
                      setProject(prev => {
                        if (!prev) return prev;
                        return { ...prev, status: '已完成' as const };
                      });
                      msg.success('项目已标记为已完成');
                    }).catch((err: unknown) => {
                      msg.error('项目完成操作失败：' + ((err instanceof Error ? err.message : '') || '未知错误'));
                    });
                  },
                });
              }}
                style={{
                  marginLeft: 8, padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  color: '#fff', background: COLORS.success, border: 'none', userSelect: 'none',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >✓ 完成项目</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: COLORS.textLight, marginTop: 4, display: 'flex', gap: 16 }}>
            <span>{project.projectName}</span>
            <span style={{ color: COLORS.borderInput }}>|</span>
            <span>{project.salesNo}</span>
            <span style={{ color: COLORS.borderInput }}>|</span>
            <span>节点进度 <strong style={{ color: COLORS.primary, fontWeight: 700 }}>{completedNodeCount}</strong>/{project.nodes.length}</span>
          </div>
        </div>
      </div>

      {/* 概览条 */}
      <div style={{
        display: 'flex', alignItems: 'center', marginBottom: 16,
        background: '#fff', borderRadius: 4, border: `1px solid ${COLORS.border}`, padding: '14px 0',
      }}>
        <div style={{
          display: 'flex', alignItems: 'stretch', flex: 1,
          background: '#f0f5ff',
        }}>
          {/* 合同金额 */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            padding: '0 20px', borderRight: '1px solid #d4e3f7',
          }}>
            <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 2 }}>合同金额</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.primary }}>&yen;{formatMoney(contractExTax)}</div>
          </div>

          {/* 总成本 */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            borderRight: '1px solid #d4e3f7',
          }}>
            <div style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 4 }}>总成本</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textLight }}>&yen;{formatMoney(grandEstimated)}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: grandActual < grandEstimated ? COLORS.success : COLORS.danger }}>
              &yen;{formatMoney(grandActual)}
            </div>
          </div>

          {/* 利润 */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            borderRight: '1px solid #d4e3f7',
          }}>
            <div style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 4 }}>利润</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textLight }}>&yen;{formatMoney(estProfit)}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: actProfit >= estProfit ? COLORS.success : COLORS.danger }}>
              &yen;{formatMoney(actProfit)}
            </div>
          </div>

          {/* GP3 */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          }}>
            <div style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 4 }}>GP3</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textLight }}>{(estGP3 * 100).toFixed(1)}%</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: actGP3 >= estGP3 ? COLORS.success : COLORS.danger }}>
              {(actGP3 * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* 标签切换 — 多 Tab 风格 */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: `2px solid ${COLORS.border}` }}>
        <div onClick={() => handleTabChange('plan')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: tab === 'plan' ? `2px solid ${COLORS.primary}` : '2px solid transparent',
            color: tab === 'plan' ? COLORS.primary : COLORS.textSecondary, fontWeight: tab === 'plan' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>
          <ScheduleOutlined style={{ color: COLORS.primary, marginRight: 6 }} />实施计划
        </div>
        <div onClick={() => handleTabChange('cost')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: tab === 'cost' ? `2px solid ${COLORS.success}` : '2px solid transparent',
            color: tab === 'cost' ? COLORS.success : COLORS.textSecondary, fontWeight: tab === 'cost' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>
          <AuditOutlined style={{ color: COLORS.success, marginRight: 6 }} />成本对比
        </div>
        <div onClick={() => handleTabChange('files')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: tab === 'files' ? `2px solid ${COLORS.purple}` : '2px solid transparent',
            color: tab === 'files' ? COLORS.purple : COLORS.textSecondary, fontWeight: tab === 'files' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>
          <UploadOutlined style={{ color: COLORS.purple, marginRight: 6 }} />附件管理
        </div>
      </div>

      {tab === 'plan' ? (
        <div>
          {renderApprovalBar('plan')}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 12, fontSize: 12, color: COLORS.textSecondary }}>
            <span>项目延期：
              <strong style={{ color: COLORS.danger }}>
                {(() => {
                  // ⚠️ 共享延期判定：以节点15为准；无基线显示 —
                  const { hasBaseline, days } = getProjectDelay(project);
                  return hasBaseline ? (days > 0 ? '+' + days + '天' : days + '天') : '—';
                })()}
              </strong>
            </span>
          </div>
          <Card size="small" styles={{ body: { padding: 0 } }} style={{ borderRadius: 4, border: 'none', boxShadow: 'none', background: 'transparent' }}>
            {/* ⚠️ 保存期间锁定：避免保存成功 setProject(flushed) 回退保存期间并发编辑的日期 */}
            <DeliveryNodeTimeline
              nodes={project.nodes}
              locked={planLocked || savingPlan}
              hasChanges={hasChanges}
              saving={savingPlan}
              planStatus={project.planStatus}
              onNodeStatusClick={handleNodeStatusClick}
              onPlannedDateChange={handlePlannedDateChange}
              onCommentsChange={handleNodeCommentsChange}
              onSavePlan={handleSavePlan}
              onSubmitPlan={handleSubmitPlan}
              onExportPlan={handleExportPlan}
            />
          </Card>
        </div>
      ) : tab === 'files' ? (
        <div>
          <Card size="small" styles={{ body: { padding: 0 } }} style={{ borderRadius: 8, border: `1px solid ${COLORS.borderLight}`, boxShadow: '0 2px 12px rgba(0,0,0,0.04)', background: '#fff', overflow: 'hidden' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
              background: 'linear-gradient(90deg, #f8faff, #f0f4ff)',
              borderBottom: `1px solid ${COLORS.borderLight}`,
            }}>
              <UploadOutlined style={{ color: COLORS.purple, fontSize: 16 }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.textDark, letterSpacing: 0.5 }}>附件管理</span>
            </div>
            <div style={{ padding: '4px 0' }}>
              {ATTACHMENT_TYPES.map(at => {
                const file = deliveryFiles.find(f => f.fileType === at.key);
                return (
                  <div key={at.key} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 20px', transition: 'background 0.15s',
                    borderBottom: `1px solid ${COLORS.borderLight}`,
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = COLORS.bgSelected}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{
                      width: 32, height: 32, borderRadius: 8, display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      fontSize: 11, fontWeight: 700, color: '#fff',
                      background: at.color, letterSpacing: 0.5,
                    }}>{at.short}</span>
                    <span style={{ flex: 1, fontSize: 13, color: COLORS.textDark, fontWeight: 500, letterSpacing: 0.3 }}>{at.label}</span>
                    {!file ? (
                      <span onClick={() => handleUploadClick(at.key)}
                        style={{
                          width: 28, height: 28, borderRadius: 6, display: 'inline-flex',
                          alignItems: 'center', justifyContent: 'center', cursor: uploading ? 'default' : 'pointer',
                          fontSize: 14, color: uploading ? COLORS.borderInput : COLORS.primary,
                          background: '#e6f0fa', lineHeight: 1, userSelect: 'none', transition: 'all 0.15s',
                        }}
                        title="上传文件">
                        <UploadOutlined />
                      </span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontSize: 12, color: COLORS.primary, fontWeight: 500,
                          maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{file.fileName}</span>
                        <span onClick={() => handleViewFile(file.id)}
                          style={{
                            width: 28, height: 28, borderRadius: 6, display: 'inline-flex',
                            alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                            fontSize: 14, color: COLORS.primary, background: '#e6f0fa',
                            lineHeight: 1, userSelect: 'none', transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#d0e4f7'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#e6f0fa'; }}
                          title="查看文件"><EyeOutlined /></span>
                        <span onClick={() => handleRemoveFile(file.id)}
                          style={{
                            width: 28, height: 28, borderRadius: 6, display: 'inline-flex',
                            alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                            fontSize: 14, color: COLORS.primary, background: '#e6f0fa',
                            lineHeight: 1, userSelect: 'none', transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#fee'; e.currentTarget.style.color = COLORS.danger; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#e6f0fa'; e.currentTarget.style.color = COLORS.primary; }}
                          title="删除文件"><DeleteOutlined /></span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
          <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileChange} accept=".pdf" />
        </div>
      ) : (
        <ConfigProvider theme={{ token: { colorPrimary: COLORS.primary } }}>
        <div>
          {renderApprovalBar('cost')}
          {project.costStatus === 'approved' && isDirector && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8, alignItems: 'center', gap: 8 }}>
              <Switch size="small" checked={costOverride} onChange={setCostOverride}
                checkedChildren={<UnlockOutlined style={{ fontSize: 10 }} />}
                unCheckedChildren={<LockOutlined style={{ fontSize: 10 }} />} />
            </div>
          )}
          <Card size="small" styles={{ body: { padding: 0 } }} style={{ borderRadius: 4, border: 'none', boxShadow: 'none', background: 'transparent' }}>
            <ItemCostTable
              groups={quotationGroups}
              actualCosts={actualCosts}
              onActualCostChange={handleActualCostChange}
              locked={costLocked}
              version={quotationVersion}
              laborRates={laborRates}
            />
          </Card>
          {costCanEdit && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 16 }}>
            <IconButton icon={<SaveOutlined style={{ fontWeight: 700 }} />}
              onClick={async () => { if (!project) return; const ta = Object.values(actualCosts).reduce((s, v) => s + v, 0); const { warrantyCost } = computeDeliveryEstGP3(project.contractAmount, quotationGroups, quotationVersion); try { await deliveryService.update(project.id, { totalActualCost: ta + warrantyCost, actualCosts }); setCostDirty(false); msg.success('成本对比已保存'); } catch { msg.error('保存失败，请重试'); } }}
              color={COLORS.amber} hoverBg="#fff7e6" title="保存"
              disabled={!costDirty} />
            {project.costStatus !== 'approved' && (
            <IconButton icon={<SendOutlined style={{ fontWeight: 700 }} />}
              onClick={handleOpenSubmitCost}
              color={COLORS.primary} hoverBg="#e6f0fa" title="提交审批"
              disabled={!costDirty && Object.keys(actualCosts).length === 0} />
            )}
            <IconButton icon={<DownloadOutlined style={{ fontWeight: 700 }} />}
              onClick={handleExportCost} color={COLORS.success} hoverBg="#e8f5e9" title="导出" />
          </div>
          )}
        </div>
          </ConfigProvider>
      )}

      {/* 提交审批弹窗 */}
      <Modal
        title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.5 }}>确认提交审批</span>}
        open={submitPlanOpen}
        onCancel={() => setSubmitPlanOpen(false)}
        width={460}
        destroyOnHidden
        styles={{ body: { padding: '14px 32px 6px' } }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button icon={<CloseOutlined />} onClick={() => setSubmitPlanOpen(false)}
              style={{ borderRadius: 3, width: 36, height: 36 }} />
            <Button type="primary" ghost icon={<CheckOutlined />} onClick={confirmSubmitPlan}
              style={{ borderColor: COLORS.primary, color: COLORS.primary, borderRadius: 3, width: 36, height: 36 }} />
          </div>
        }
      >
        <div style={{ textAlign: 'center', padding: '4px 0 0' }}>
          <div style={{ fontSize: 14, color: COLORS.textDark, fontWeight: 600, marginBottom: 6 }}>
            确定提交实施计划进行审批吗？
          </div>
          <div style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.6 }}>
            实施计划提交后将锁定，无法编辑修改，等待审批处理。
          </div>
        </div>
      </Modal>

      {/* 提交成本对比审批弹窗 */}
      <Modal
        title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.5 }}>确认提交审批</span>}
        open={submitCostOpen}
        onCancel={() => setSubmitCostOpen(false)}
        width={460}
        destroyOnHidden
        styles={{ body: { padding: '14px 32px 6px' } }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button icon={<CloseOutlined />} onClick={() => setSubmitCostOpen(false)}
              style={{ borderRadius: 3, width: 36, height: 36 }} />
            <Button type="primary" ghost icon={<CheckOutlined />} onClick={handleSubmitCost}
              style={{ borderColor: COLORS.primary, color: COLORS.primary, borderRadius: 3, width: 36, height: 36 }} />
          </div>
        }
      >
        <div style={{ textAlign: 'center', padding: '4px 0 0' }}>
          <div style={{ fontSize: 14, color: COLORS.textDark, fontWeight: 600, marginBottom: 6 }}>
            确定提交成本对比进行审批吗？
          </div>
          <div style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.6 }}>
            成本对比提交后将锁定实际成本数据，等待审批处理。
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DeliveryDetail;
