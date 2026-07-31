import React, { useState, useMemo, useCallback, useEffect } from 'react';

import { useNavigate } from 'react-router-dom';

import { Button, Table, Tag, Modal, message, Dropdown, Switch, Tooltip } from 'antd';

import { PlusOutlined, EditOutlined, FileAddOutlined, CheckCircleOutlined, CloseCircleOutlined, PauseCircleOutlined, PlayCircleOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';

import BlueTableModal from '../components/BlueTableModal';
import type { SalesOpportunity, DeliveryNode, BlueTable, Client } from '../types';
import { opportunityService } from '../services/opportunityService';
import { clientService } from '../services/clientService';
import { deliveryService } from '../services/deliveryService';
import { approvalService } from '../services/approvalService';
import { quotationService } from '../services/quotationService';
import { projectService } from '../services/projectService';
import { REASON_TAXONOMY, formatReasons } from '../reasonTaxonomy';
import { parseFY, FYSelector } from '../utils/fiscalYear';
import { COLORS } from '../styles/colors';
import { api, clearCache } from '../utils/api';
import { calcBlueTableWinRate } from '../utils/blueTableCalculation';
import { NODE_NAMES } from '../utils/constants';
import { formatBeijing } from '../utils/timeFormat';
import { useAuth } from '../utils/authContext';



const STAGE_OPTIONS = ['信息', '线索', '机会', '投标', '议价', '中标'];

const stageColors: Record<string, string> = {

  信息: COLORS.textLight, 线索: COLORS.primary, 机会: COLORS.purple,

  投标: COLORS.warning, 议价: COLORS.amber, 中标: COLORS.success,

};

const statusColors: Record<string, string> = {

  过程中: COLORS.primary, 赢: COLORS.success, 输: COLORS.danger, 冻结: COLORS.textLight,

};

const getWinRateColumn = (tab: string, opp: SalesOpportunity | null, setOpp: (o: SalesOpportunity | null) => void, setOpen: (v: boolean) => void) => {
  if (tab === 'info') return [];
  return [{
    title: '赢率', dataIndex: 'winRate', width: 30, align: 'center' as const,
    filters: ['__all__', [0, 25], [26, 50], [51, 75], [76, 100]].map(r => ({
      text: r === '__all__' ? '全部' : `${r[0]}-${r[1]}%`,
      value: r,
    })),
    filterSearch: true,
    filterDropdownProps: { minOverlayWidthMatchTrigger: false },
    onFilter: (value: unknown, record: SalesOpportunity) => {
      if (value === '__all__') return true;
      const range = value as number[];
      return record.winRate >= range[0] && record.winRate <= range[1];
    },
    render: (v: number, rec: SalesOpportunity) => {
      const isReadOnly = rec.terminated || rec.promoteLocked;
      const hasBlueTable = !!rec.blueTable;
      if (isReadOnly) return <span style={{ cursor: 'pointer', color: COLORS.textLight, fontWeight: 600, fontSize: 13 }}
        onClick={() => { setOpp(rec); setOpen(true); }}
        title={hasBlueTable ? `蓝表评估：${v}%（点击查看）` : '点击查看'}>{v}%</span>;
      if (!hasBlueTable) {
        return <span style={{ cursor: 'pointer', color: COLORS.chartGray, fontWeight: 600, fontSize: 13 }}
          onClick={() => { setOpp(rec); setOpen(true); }} title="点击填写销售蓝表">{v}%</span>;
      }
      return <span style={{ cursor: 'pointer', color: COLORS.primary, fontWeight: 600, fontSize: 13 }}
        onClick={() => { setOpp(rec); setOpen(true); }}
        title={`蓝表评估：${v}%（点击编辑）`}>{v}%</span>;
    },
  }];
};

const CELL_INPUT: React.CSSProperties = {
  width: '100%', border: 'none', background: 'transparent', outline: 'none',
  fontSize: 13, color: COLORS.textPrimary, padding: '2px 0',
};

const OPP_STAGES = ['机会', '投标', '议价', '中标'];

const nowISO = () => new Date().toISOString();

/** 构建状态 tooltip：审批锁定中 / 输赢原因 */
const buildStatusTooltip = (rec: SalesOpportunity, status: string, isLocked?: boolean): string | undefined => {
  if (isLocked && rec.promoteLocked) return '审批锁定中';
  if (!rec.reasons && !rec.winner) return undefined;
  const parts: string[] = [];
  if (rec.reasons) parts.push(rec.reasons);
  if (status === '输' && rec.winner) parts.push(rec.winner);
  return parts.join(' | ') || undefined;
};



const SalesOpportunityList: React.FC = () => {

  const navigate = useNavigate();
  const { user } = useAuth();

  const [msg, ctx] = message.useMessage();

  const [opportunities, setOpportunities] = useState<SalesOpportunity[]>([]);
  const [enterpriseClients, setEnterpriseClients] = useState<Array<{ name: string; salesman: string; type?: string }>>([]);

  const loadClients = useCallback(() => {
    clientService.list().then(data => {
      if (data) setEnterpriseClients(data.filter((c: Client) => c.type === 'enterprise'));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadClients();
    // 页面重新获得焦点时刷新客户列表（适配新增客户后返回的场景）
    const onFocus = () => loadClients();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadClients]);

  const loadOpportunities = useCallback(async () => {
    try {
      const data = await opportunityService.list();
      setOpportunities(data || []);
    } catch { setOpportunities([]); }
  }, []);

  useEffect(() => {
    loadOpportunities();
  }, [loadOpportunities]);


  const [tabFilter, setTabFilter] = useState<'info' | 'lead' | 'opp'>(() => {
    const saved = localStorage.getItem('sales_tab_filter');
    if (saved === 'info' || saved === 'lead' || saved === 'opp') return saved;
    return 'opp';
  });
  // 切换 tab 时持久化
  const handleTabChange = useCallback((tab: 'info' | 'lead' | 'opp') => {
    setTabFilter(tab);
    localStorage.setItem('sales_tab_filter', tab);
  }, []);
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const y1 = m >= 6 ? y : y - 1;
  const y2 = m >= 6 ? y + 1 : y;
  const defaultFy = `FY${String(y1 % 100).padStart(2,'0')}${String(y2 % 100).padStart(2,'0')}`;
  const [fySelect, setFySelect] = useState(defaultFy);
  const [showTerminated, setShowTerminated] = useState(false);



  // Edit modal state

  const [modalOpen, setModalOpen] = useState(false);

  const [editing, setEditing] = useState<SalesOpportunity | null>(null);

  const [formData, setFormData] = useState<Partial<SalesOpportunity>>({});


  // ── 确认弹窗 ──
  const [deliveryOpp, setDeliveryOpp] = useState<SalesOpportunity | null>(null);
  const [terminateOpp, setTerminateOpp] = useState<SalesOpportunity | null>(null);
  const [promoteOpp, setPromoteOpp] = useState<{ opp: SalesOpportunity; targetStage: string } | null>(null);

  // ── 阶段晋升弹窗 ──
  // ── 蓝表弹窗 ──
  const [blueTableOpp, setBlueTableOpp] = useState<SalesOpportunity | null>(null);
  const [blueTableOpen, setBlueTableOpen] = useState(false);

  // ── 原因选择弹窗 ──
  const [reasonModal, setReasonModal] = useState<{
    open: boolean; opp: SalesOpportunity | null;
    action: 'win' | 'loss' | 'freeze' | null;
    selectedGroup: string; selections: Record<string, string[]>;
    comment: string; winner: string; dropdownOpen: boolean;
    /** 伴随状态变更需要同步更新的阶段（如"中标"→赢） */
    pendingStage?: string;
  }>({
    open: false, opp: null, action: null,
    selectedGroup: '', selections: {}, comment: '', winner: '', dropdownOpen: false,
  });


  const touch = useCallback((id: string, updates: Partial<SalesOpportunity>) => {
    const opp = opportunities.find(o => o.id === id);
    if (opp?.promoteLocked || opp?.terminated) return;
    setOpportunities(prev => prev.map(o => o.id === id ? { ...o, ...updates, updatedAt: nowISO() } : o));
    opportunityService.update(id, { ...updates, updatedAt: nowISO() }).catch(e => {
      console.warn('[Touch] 保存失败', e);
      msg.warning('部分修改保存失败，请刷新后检查');
    });
  }, [msg, opportunities]);



  const filtered = useMemo(() => {
    const fyRange = parseFY(fySelect);
    // 未来财年不显示任何数据
    if (fyRange.start > new Date()) return [];

    return opportunities.filter(o => {

      if (tabFilter === 'info' && o.stage !== '信息') return false;

      if (tabFilter === 'lead' && o.stage !== '线索') return false;

      if (tabFilter === 'opp' && (o.stage === '信息' || o.stage === '线索')) return false;

      if (!showTerminated && o.terminated) return false;

      // 财年过滤：项目中/冻结视为持续到现在，其余以 updatedAt 为终止时间
      const created = new Date(o.createdAt);
      const effectiveEnd = (o.status === '过程中' || o.status === '冻结')
        ? new Date()
        : new Date(o.updatedAt);
      if (created > fyRange.end || effectiveEnd < fyRange.start) return false;

      return true;

    });

  }, [opportunities, tabFilter, fySelect, showTerminated]);





  const openReasonModal = (opp: SalesOpportunity, action: 'win' | 'loss' | 'freeze', pendingStage?: string) => {
    const cfg = REASON_TAXONOMY[action];
    const defaultGroup = cfg.groups[0]?.groupLabel || '';
    const competitors = (opp.competitor || '').split(/[、，]/).map(s => s.trim()).filter(Boolean);
    const winner = opp.winner || competitors[0] || '';
    setReasonModal({ open: true, opp, action, selectedGroup: defaultGroup, selections: {}, comment: opp.notes || '', winner, dropdownOpen: false, pendingStage });
  };

  const handleReasonOk = () => {
    const { opp, action, selectedGroup, selections } = reasonModal;
    if (!opp || !action) return;
    const selList = Object.entries(selections).map(([subLabel, detailItems]) => ({ subLabel, detailItems }));
    const reasonsStr = formatReasons(selectedGroup, selList);
    const updates: Record<string, unknown> = {
      status: action === 'win' ? '赢' : action === 'loss' ? '输' : '冻结',
      reasons: reasonsStr,
      notes: reasonModal.comment || '',
      updatedAt: nowISO(),
    };
    // wonAt 在转交付时采集，此处不设置
    if (action === 'loss' && reasonModal.winner) {
      updates.winner = reasonModal.winner;
    }
    // 如果原因弹窗附加了阶段变更（如"中标"→赢），同步更新 stage
    if (reasonModal.pendingStage) {
      updates.stage = reasonModal.pendingStage;
    }
    setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, ...updates } : o));
    opportunityService.update(opp.id, updates as Partial<SalesOpportunity>).catch(e => console.warn('[ReasonOk] 保存失败', e));
    setReasonModal(p => ({ ...p, open: false }));
    msg.success('状态已更新');
  };

  const toggleSub = (subLabel: string, detailItems?: string[]) => {
    setReasonModal(prev => {
      const s = { ...prev.selections };
      if (s[subLabel]) { delete s[subLabel]; } else { s[subLabel] = detailItems || []; }
      return { ...prev, selections: s };
    });
  };

  const toggleDetail = (subLabel: string, item: string) => {
    setReasonModal(prev => {
      const s = { ...prev.selections };
      const arr = [...(s[subLabel] || [])];
      const idx = arr.indexOf(item);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(item);
      s[subLabel] = arr;
      return { ...prev, selections: s };
    });
  };

  const handleStatusAction = useCallback((opp: SalesOpportunity, action: 'win' | 'loss' | 'freeze' | 'resume') => {
    if (action === 'resume') {
      // 恢复到过程中：清除原因，无需弹窗
      setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, status: '过程中', reasons: '', updatedAt: nowISO() } : o));
      opportunityService.update(opp.id, { status: '过程中', reasons: '', updatedAt: nowISO() }).catch(e => console.warn('[Resume] 保存失败', e));
      msg.success('已恢复为过程中');
      return;
    }
    // 赢/输/冻结：清除旧原因，打开原因弹窗
    openReasonModal(opp, action);
  }, [msg]);



  // ── 蓝表保存 ──
  const handleBlueTableSave = useCallback(async (blueTable: BlueTable) => {
    if (!blueTableOpp) return;
    const calc = calcBlueTableWinRate(blueTable);
    const winRate = calc.finalRate;
    try {
      await opportunityService.saveBlueTable(blueTableOpp.id, blueTable);
      await opportunityService.update(blueTableOpp.id, { winRate });
      const updates: Partial<SalesOpportunity> = {
        blueTable,
        winRate,
        updatedAt: nowISO(),
      };
      setOpportunities(prev => prev.map(o => o.id === blueTableOpp.id ? { ...o, ...updates } : o));
      clearCache('/opportunities');
      setBlueTableOpen(false);
      setBlueTableOpp(null);
      msg.success(`蓝表已保存，赢率 ${winRate}%`);
    } catch (e) {
      console.warn('[BlueTable] save error', e);
      msg.error('蓝表保存失败，请重试');
    }
  }, [blueTableOpp, msg]);

  const handleWinDeliver = useCallback((opp: SalesOpportunity) => {
    // 防重复转交付：已转交付（terminated）的机会不再打开转交付弹窗
    if (opp.terminated) { msg.warning('该项目已转交付'); return; }
    setDeliveryOpp(opp);
  }, [msg]);

  const confirmDeliver = useCallback(async () => {
    const opp = deliveryOpp;
    if (!opp) return;
    if (opp.terminated) { msg.warning('该项目已转交付'); setDeliveryOpp(null); return; }
    const d = new Date();

    // 取机会关联的报价ID
    const bestQuoteId = opp.quotationId || '';

    // 生成默认交付节点（15个标准节点，从共享常量导入）
    const startDate = new Date(d);
    const nodes: DeliveryNode[] = NODE_NAMES.map((name, i) => {
      const ps = new Date(startDate);
      ps.setDate(ps.getDate() + i * 14);
      const pe = new Date(ps);
      pe.setDate(pe.getDate() + (name === '制造采购' ? 28 : 10));
      return {
        name,
        nodeNo: i + 1,
        status: 'pending' as const,
        plannedStartDate: ps.toISOString().slice(0, 10),
        plannedEndDate: pe.toISOString().slice(0, 10),
        comments: '', history: [],
      };
    });

    try {
      // 1. 创建交付项目
      const newDel = await deliveryService.create({
        opportunityId: opp.id,
        salesNo: opp.salesNo.replace(/-S$/, "-E"),
        clientName: opp.clientName,
        projectName: opp.projectName,
        contractAmount: opp.amount,
        quotationId: bestQuoteId,
        status: '进行中',
        planStatus: 'draft',
        costStatus: 'draft',
      });
      // 2. 保存交付节点
      await deliveryService.saveNodes(newDel.id, nodes);
      // 3. 更新机会：标记为已转交付
      await opportunityService.update(opp.id, { terminated: true, updatedAt: nowISO() });
      clearCache('/opportunities');
      setOpportunities(prev => prev.filter(o => o.id !== opp.id));
      setDeliveryOpp(null);
      msg.success('已转交付，信息已移交分析模块');
      navigate('/delivery');
    } catch (e) {
      console.warn('[Deliver] 转交付失败', e);
      msg.error('转交付失败，请重试');
    }
  }, [deliveryOpp, msg, navigate]);

  const handlePromote = useCallback((opp: SalesOpportunity, targetStage: string) => {
    // 线索→机会必须填写蓝表
    if (targetStage === '机会' && (!opp.blueTable || opp.blueTable.roles.length === 0)) {
      Modal.warning({
        title: '需要先填写销售蓝表',
        content: '从线索晋升到机会前，请先完成销售蓝表评估（包含至少一个采购角色）。',
        okText: '知道了',
      });
      return;
    }
    setPromoteOpp({ opp, targetStage });
  }, []);

  const confirmPromote = useCallback(async () => {
    if (!promoteOpp) return;
    if (promoteOpp.targetStage === '机会') {
      try {
        const opp = promoteOpp.opp;
        // 从关联报价获取完整财务数据
        let versionNo = 'V1.0';
        let totalAccountingPrice = 0;
        let discountedPrice = 0;
        let discountRate = 0;
        let gp3 = 0;
        let gp3Amount = 0;
        let totalCost = 0;
        let profitRate = 0;
        let taxRate = 0.13;
        let amount = opp.amount || 0;
        let foundApproved = false;

        if (opp.quotationId) {
          try {
            const quotation = await quotationService.get(opp.quotationId);
            const qt = quotation as any;
            versionNo = qt.versionNo || 'V1.0';
            // 通过项目ID获取版本财务数据
            if (qt.projectId) {
              const projectData = await projectService.getFull(qt.projectId);
              // ⚠️ 只采用已审批版本数据，无已审批版本时阻止提交
              const ver = projectData.versions?.find(v => v.versionNo === qt.versionNo && v.reviewStatus === 'approved')
                || projectData.versions?.find(v => v.reviewStatus === 'approved');
              if (ver) {
                foundApproved = true;
                versionNo = ver.versionNo;
                // ⚠️ 所有财务数据一律从数据库已存储的值直接读取，不重新计算
                totalAccountingPrice = ver.totalAccountingPrice || 0;
                discountedPrice = ver.discountedPrice || 0;
                discountRate = ver.discountRate || 0;
                totalCost = ver.totalCost || 0;
                taxRate = ver.taxRate || 0.13;
                amount = ver.discountedPrice || amount;
                gp3 = ver.gp3ProfitRate || 0;
                // ⚠️ 优先读存储的 gp3Amount，为 0 时从汇总值回退计算（兼容旧数据）
                gp3Amount = ver.gp3Amount || Math.round((ver.discountedPrice || 0) - Math.round((ver.totalCost || 0) * (1 + (ver.taxRate || 0.13))));
                profitRate = Math.round((ver.gp3ProfitRate || 0) * 10000) / 100;
              } else {
                discountedPrice = qt.amount || 0;
                amount = qt.amount || amount;
              }
            }
          } catch (e) {
            console.warn('[Promote] 获取报价数据失败', e);
          }
        }

        // 无已审批版本时阻止提交
        if (!foundApproved) { msg.error('请先完成报价编制审批，再提交转机会审批'); setPromoteOpp(null); return; }

        // 先提交审批请求
        await approvalService.create({
          approvalType: 'promote',
          quotationId: opp.quotationId || '',
          opportunityId: opp.id,
          versionNo,
          salesNo: opp.salesNo,
          clientName: opp.clientName,
          projectName: opp.projectName,
          amount,
          totalCost,
          profitRate,
          gp3,
          taxRate,
          totalAccountingPrice,
          discountedPrice,
          discountRate,
          gp3Amount,
          submitter: user?.displayName || opp.salesman || '销售员',
          submitTime: nowISO(),
          status: 'pending',
        });

        // 审批提交成功后锁定机会
        await opportunityService.update(opp.id, { promoteLocked: true, updatedAt: nowISO() });
        // 更新本地状态（立即生效，无需刷新页面）
        setOpportunities(prev => prev.map(o =>
          o.id === opp.id ? { ...o, promoteLocked: true } : o
        ));

        clearCache('/approvals');
        setPromoteOpp(null);
        msg.success('已提交审批，待总监审批');
      } catch (e) {
        console.warn('[Promote] 提交审批失败', e);
        msg.error('提交审批失败，请重试');
      }
    } else {
      touch(promoteOpp.opp.id, { stage: '线索' });
      setPromoteOpp(null);
      msg.success('已转线索');
    }
  }, [promoteOpp, msg, touch, user]);

  const handleConfirmTerminate = useCallback((opp: SalesOpportunity) => {
    setTerminateOpp(opp);
  }, []);

  const confirmTerminate = useCallback(() => {
    const opp = terminateOpp;
    if (!opp) return;
    setOpportunities(prev => prev.map(o =>
      o.id === opp.id ? { ...o, terminated: true, updatedAt: nowISO() } : o
    ));
    opportunityService.update(opp.id, { terminated: true, updatedAt: nowISO() }).catch(e => console.warn('[Terminate] 保存失败', e));
    setTerminateOpp(null);
    msg.success('项目已终止');
  }, [terminateOpp, msg]);



  const openCreateModal = useCallback((initialStage: string = '信息') => {

    setEditing(null);

    setFormData({

      clientName: '', projectName: '', amount: 0, stage: initialStage,

      winRate: initialStage === '信息' ? 5 : initialStage === '线索' ? 10 : 20, status: '过程中', salesman: '', competitor: '', expectedCloseDate: '', notes: '',

    });

    setModalOpen(true);

  }, []);



  const handleModalOk = useCallback(async () => {

    if (!formData.clientName || !formData.projectName) {

      msg.warning('客户名称和项目名称为必填项');

      return;

    }

    if (!enterpriseClients.some(c => c.name === formData.clientName)) {
      msg.warning('所选客户不在客户列表中，请先在客户管理页面创建');
      return;
    }

    if (editing) {

      opportunityService.update(editing.id, formData).then(() => {
        loadOpportunities();
        msg.success('机会已更新');
      }).catch(() => {
        msg.error('更新失败，请重试');
      });

    } else {

      // 从后端API获取下一个销售编号（避免本地计数不准确导致重复）
      let salesNo;
      try {
        const resp = await api.get<{ salesNo: string }>('/opportunities/next-sales-no');
        salesNo = resp.salesNo;
      } catch {
        // fallback: 本地计数
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const count = opportunities.filter(o => o.salesNo.startsWith('A' + y + '-' + m)).length;
        salesNo = 'A' + y + '-' + m + '-' + String(count + 1).padStart(3, '0') + '-S';
      }

      const createdStage = formData.stage || '信息';
      const nowISO = new Date().toISOString();
      const hasStage = (arr: string[]) => arr.includes(createdStage);
      opportunityService.create({
        salesNo,
        clientName: formData.clientName,
        projectName: formData.projectName,
        amount: formData.amount || 0,
        stage: createdStage,
        winRate: formData.winRate || 0,
        status: formData.status || '过程中',
        salesman: formData.salesman || '',
        competitor: formData.competitor || '',
        expectedCloseDate: formData.expectedCloseDate || '',
        notes: formData.notes || '',
        reasons: formData.reasons || '',
        // 创建时按创建阶段记录进入各阶段时间（信息=创建时间、中标=won_at）
        leadAt: hasStage(['线索', '机会', '投标', '议价', '中标']) ? nowISO : undefined,
        opportunityAt: hasStage(['机会', '投标', '议价', '中标']) ? nowISO : undefined,
        bidAt: hasStage(['投标', '议价', '中标']) ? nowISO : undefined,
        negotiationAt: hasStage(['议价', '中标']) ? nowISO : undefined,
      }).then(() => {
        loadOpportunities();
        msg.success('机会已创建');
      }).catch(() => {
        msg.error('创建失败，请重试');
      });

    }

    setModalOpen(false);

  }, [editing, formData, opportunities, msg, enterpriseClients, loadOpportunities]);







  const columns = useMemo(() => [
    { title: '序号', key: 'index', width: 26, align: 'center' as const,
      render: (_: unknown, rec: SalesOpportunity, i: number) =>
        <span style={{ color: rec.terminated ? COLORS.textLight : COLORS.textSecondary }}>{i + 1}</span> },
    { title: '客户名称', dataIndex: 'clientName', width: 154,
      render: (v: string, rec: SalesOpportunity) =>
        <span style={{ fontSize: 13, color: rec.terminated ? COLORS.textLight : COLORS.textDark }}>{v || '—'}</span> },
    { title: '销售编号', dataIndex: 'salesNo', width: 80,
      render: (v: string, rec: SalesOpportunity) => rec.terminated
        ? <span style={{ color: COLORS.textLight }}>{v}</span>
        : <span style={{ fontWeight: 600 }}>{v}</span> },
    { title: '项目名称', dataIndex: 'projectName', width: 200,
      render: (v: string, rec: SalesOpportunity) =>
        <span style={{ fontSize: 13, color: rec.terminated ? COLORS.textLight : COLORS.textDark }}>{v || '—'}</span> },
    { title: '说明', dataIndex: 'notes', width: 295,
      render: (v: string, rec: SalesOpportunity) => (rec.terminated || rec.promoteLocked)
        ? <span style={{ fontSize: 13, color: COLORS.textLight }}>{v || '—'}</span>
        : (
        <input type="text" defaultValue={v || ''}
          onBlur={e => touch(rec.id, { notes: e.target.value })}
          placeholder="—"
          style={{ ...CELL_INPUT, color: COLORS.chartGray }}
        />
      )},
    { title: '金额', dataIndex: 'amount', width: 110, align: 'right' as const,
      render: (v: number, rec: SalesOpportunity) => {
        const hasQuote = !!rec.quotationId;
        const isReadOnly = hasQuote || rec.terminated || rec.promoteLocked;
        const displayVal = hasQuote ? (rec.quotationAmount ?? v) : v;
        if (isReadOnly) {
          return <span style={{ color: COLORS.textLight, fontWeight: 600, fontSize: 13 }}>¥{Math.round(displayVal).toLocaleString()}</span>;
        }
        return (
          <input type="text" defaultValue={'¥' + Math.round(v).toLocaleString()}
            onBlur={e => {
              const val = parseInt(e.target.value.replace(/[^0-9-]/g, ''), 10) || 0;
              touch(rec.id, { amount: val });
              e.target.value = '¥' + val.toLocaleString();
            }}
            style={{ ...CELL_INPUT, color: COLORS.primary, fontWeight: 600, textAlign: 'right' }}
          />
        );
      }},
    { title: '阶段', dataIndex: 'stage', width: 40, align: 'center' as const,
      filters: [
        { text: '全部', value: '__all__' },
        { text: '投标', value: '投标' },
        { text: '议价', value: '议价' },
        { text: '中标', value: '中标' },
      ],
      filterSearch: true,
      filterDropdownProps: { minOverlayWidthMatchTrigger: false },
      onFilter: (value: string, record: SalesOpportunity) => value === '__all__' || record.stage === value,
      render: (v: string, rec: SalesOpportunity) => {
        if (rec.terminated || rec.promoteLocked) return <Tag color={COLORS.textLight} style={{ cursor: 'default', margin: 0 }}>{v}</Tag>;
        // 信息/线索 tab 只读显示，通过操作列按钮晋级
        if (tabFilter === 'info' || tabFilter === 'lead') {
          return <Tag color={stageColors[v] || COLORS.textLight} style={{ margin: 0 }}>{v}</Tag>;
        }
        // 机会 tab 可选：机会、投标、议价、中标
        return (
          <Dropdown menu={{
            items: OPP_STAGES.map(s => ({
              key: s,
              label: <span style={{ fontSize: 13, color: s === v ? COLORS.primary : COLORS.textDark }}>{s}</span>,
              onClick: s !== v ? () => {
                const updates = { stage: s, updatedAt: nowISO() };
                touch(rec.id, updates);
              } : undefined,
            })),
          }} trigger={['click']}>
            <Tag color={stageColors[v] || COLORS.textLight}
              style={{ cursor: 'pointer', margin: 0 }}>
              {v} <span style={{ fontSize: 10, marginLeft: 2 }}>▼</span>
            </Tag>
          </Dropdown>
        );
      }},

    ...getWinRateColumn(tabFilter, blueTableOpp, setBlueTableOpp, setBlueTableOpen),
    { title: '竞争对手', dataIndex: 'competitor', width: 145,
      render: (v: string, rec: SalesOpportunity) => {
        if (rec.terminated || rec.promoteLocked) return <span style={{ fontSize: 13, color: COLORS.textLight }}>{v || '—'}</span>;
        const hasInvalidSep = v && /[^一-龥a-zA-Z0-9、， ]/.test(v);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <input type="text" defaultValue={v || ''}
              onBlur={e => touch(rec.id, { competitor: e.target.value })}
              placeholder="—"
              style={CELL_INPUT}
            />
            {hasInvalidSep && <span style={{ color: COLORS.danger, fontWeight: 700, fontSize: 14, flexShrink: 0 }}>!</span>}
          </div>
        );
      }},
    { title: '状态', dataIndex: 'status', width: 32, align: 'center' as const,
      filters: [
        { text: '全部', value: '__all__' },
        { text: '过程中', value: '过程中' },
        { text: '赢', value: '赢' },
        { text: '输', value: '输' },
        { text: '冻结', value: '冻结' },
      ],
      filterSearch: true,
      filterDropdownProps: { minOverlayWidthMatchTrigger: false },
      onFilter: (value: string, record: SalesOpportunity) => value === '__all__' || record.status === value,
      render: (v: string, rec: SalesOpportunity) => {
        if (rec.terminated || rec.promoteLocked) return (
          <Tooltip title={buildStatusTooltip(rec, v, true)}>
            <Tag color={COLORS.textLight} style={{ margin: 0, fontSize: 12 }}>{v}</Tag>
          </Tooltip>
        );
        // ⚠️ 所有状态显示全部可用操作，排除当前状态自身
        const ALL_STATUS_ACTIONS: { icon: React.ReactNode; action: string; label: string; target: string; colorKey: string }[] = [
          { icon: <CheckCircleOutlined />, action: 'win', label: '赢单', target: '赢', colorKey: '赢' },
          { icon: <CloseCircleOutlined />, action: 'loss', label: '输单', target: '输', colorKey: '输' },
          { icon: <PauseCircleOutlined />, action: 'freeze', label: '冻结', target: '冻结', colorKey: '冻结' },
          { icon: <PlayCircleOutlined />, action: 'resume', label: '恢复进行', target: '过程中', colorKey: '过程中' },
        ];
        const actions = ALL_STATUS_ACTIONS.filter(a => a.target !== v);
        return (
          <Dropdown menu={{
            items: actions.map(a => ({
              key: a.action,
              label: <div style={{ fontSize: 18, color: statusColors[a.colorKey] || COLORS.textLight, textAlign: 'center', padding: '2px 4px' }}>{a.icon}</div>,
              onClick: () => handleStatusAction(rec, a.action as 'win' | 'loss' | 'freeze' | 'resume'),
            })),
          }} trigger={['click']}>
            <Tooltip title={buildStatusTooltip(rec, v)}>
              <Tag color={statusColors[v] || COLORS.textLight}
                style={{ cursor: 'pointer', margin: 0, fontSize: 12 }}>
                {v} <span style={{ fontSize: 10, marginLeft: 2 }}>▼</span>
              </Tag>
            </Tooltip>
          </Dropdown>
        );
        }
      },
    { title: '区域销售', dataIndex: 'salesman', width: 32,
      filters: [{ text: '全部', value: '__all__' }, ...Array.from(new Set(opportunities.map(o => o.salesman).filter(Boolean))).map(s => ({ text: s, value: s }))],
      filterSearch: true,
      filterDropdownProps: { minOverlayWidthMatchTrigger: false },
      onFilter: (value: string, record: SalesOpportunity) => value === '__all__' || record.salesman === value,
      render: (v: string, rec: SalesOpportunity) =>
        <span style={{ fontSize: 13, color: rec.terminated ? COLORS.textLight : COLORS.textDark }}>{v || '—'}</span> },
    { title: '预计定标', dataIndex: 'expectedCloseDate', width: 67,
      filters: Array.from(new Set(opportunities.map(o => o.expectedCloseDate).filter(Boolean))).sort().map(s => ({ text: s, value: s })),
      onFilter: (value: string, record: SalesOpportunity) => record.expectedCloseDate === value,
      render: (v: string, rec: SalesOpportunity) => (rec.terminated || rec.promoteLocked)
        ? <span style={{ fontSize: 13, color: COLORS.textLight }}>{v || '—'}</span>
        : (
        <input type="text" defaultValue={v || ''}
          onBlur={e => touch(rec.id, { expectedCloseDate: e.target.value })}
          placeholder="yyyy-mm-dd"
          style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: COLORS.textPrimary }}
        />
      )},
    { title: '报价', dataIndex: 'quotationId', width: 50, align: 'center' as const,
      render: (v: string | undefined, rec: SalesOpportunity) => {
        const isReadOnly = rec.terminated || rec.promoteLocked;
        if (!v && !isReadOnly) return (
          <Button type="text" size="small" icon={<FileAddOutlined style={{ fontSize: 18 }} />}
            onClick={() => navigate('/quotations/new?oppId=' + rec.id)}
            style={{ color: COLORS.primary }} />
        );
        if (!v) return <span style={{ color: COLORS.textLight, fontSize: 13 }}>—</span>;
        return (
          <Tooltip title={isReadOnly ? '查看报价（只读）' : '编辑报价'}>
            <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 18 }} />}
              onClick={() => navigate('/quotations/' + v + (isReadOnly ? '?view=1' : ''))}
              style={{ color: isReadOnly ? COLORS.textLight : COLORS.primary }} />
          </Tooltip>
        );
      }},
    { title: '操作', key: 'action', width: 75, align: 'center' as const,
      render: (_: unknown, rec: SalesOpportunity) => {
        if (tabFilter === 'info') {
          if (rec.terminated) return <span style={{ fontSize: 12, color: COLORS.textLight }}>已终止</span>;
          if (rec.status === '输') return (
            <Button type="text" size="small" icon={<CloseOutlined style={{ fontSize: 18 }} />}
              onClick={() => handleConfirmTerminate(rec)}
              style={{ color: COLORS.purple }} title="确认终止" />
          );
          return (
            <Button type="text" size="small" icon={<CheckOutlined style={{ fontSize: 18 }} />}
              onClick={() => handlePromote(rec, '线索')}
              style={{ color: COLORS.purple }} title="转线索" />
          );
        }
        if (tabFilter === 'lead') {
          if (rec.terminated) return <span style={{ fontSize: 12, color: COLORS.textLight }}>已终止</span>;
          if (rec.status === '输') return (
            <Button type="text" size="small" icon={<CloseOutlined style={{ fontSize: 18 }} />}
              onClick={() => handleConfirmTerminate(rec)}
              style={{ color: COLORS.purple }} title="确认终止" />
          );
          return (
            <Button type="text" size="small" icon={<CheckOutlined style={{ fontSize: 18 }} />}
              onClick={() => handlePromote(rec, '机会')}
              style={{ color: COLORS.purple }} title="转机会" />
          );
        }
        if (rec.terminated) return <span style={{ fontSize: 12, color: COLORS.textLight }}>已终止</span>;
        if (rec.promoteLocked) return <span style={{ fontSize: 12, color: COLORS.warning }}>审批中</span>;
        return (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
            {rec.status === '赢' && !rec.terminated && (
              <Button type="text" size="small" icon={<CheckOutlined style={{ fontSize: 18 }} />}
                onClick={() => handleWinDeliver(rec)}
                style={{ color: COLORS.purple }} title="转交付" />
            )}
            {rec.status === '输' && (
              <Button type="text" size="small" icon={<CloseOutlined style={{ fontSize: 18 }} />}
                onClick={() => handleConfirmTerminate(rec)}
                style={{ color: COLORS.purple }} title="确认终止" />
            )}
          </div>
        );
      },
    },
    { title: '操作日期', dataIndex: 'updatedAt', width: 100,
      render: (v: string) => <span style={{ fontSize: 13, color: COLORS.textLight }}>{formatBeijing(v)}</span> },
  ], [tabFilter, touch, handlePromote, handleConfirmTerminate, handleWinDeliver, opportunities, handleStatusAction, navigate, blueTableOpp]);



  return (
    <>
      <div>

      {ctx}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark }}>销售管理</span>
        <span style={{ marginLeft: -35 }}><FYSelector value={fySelect} onChange={setFySelect} /></span>
        <Switch size="small" checked={showTerminated} onChange={setShowTerminated} />
      </div>



      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: `1.5px solid ${COLORS.borderLight}` }}>

        <div onClick={() => handleTabChange('info')}

          style={{

            padding: '8px 20px', cursor: 'pointer', fontSize: 14,

            borderBottom: tabFilter === 'info' ? `2px solid ${COLORS.primary}` : '2px solid transparent',

            color: tabFilter === 'info' ? COLORS.primary : COLORS.textSecondary, fontWeight: tabFilter === 'info' ? 600 : 400,

            marginBottom: -2, transition: 'all 0.15s',

          }}>销售信息

        </div>

        <div onClick={() => handleTabChange('lead')}

          style={{

            padding: '8px 20px', cursor: 'pointer', fontSize: 14,

            borderBottom: tabFilter === 'lead' ? `2px solid ${COLORS.purple}` : '2px solid transparent',

            color: tabFilter === 'lead' ? COLORS.purple : COLORS.textSecondary, fontWeight: tabFilter === 'lead' ? 600 : 400,

            marginBottom: -2, transition: 'all 0.15s',

          }}>销售线索

        </div>

        <div onClick={() => handleTabChange('opp')}

          style={{

            padding: '8px 20px', cursor: 'pointer', fontSize: 14,

            borderBottom: tabFilter === 'opp' ? `2px solid ${COLORS.success}` : '2px solid transparent',

            color: tabFilter === 'opp' ? COLORS.success : COLORS.textSecondary, fontWeight: tabFilter === 'opp' ? 600 : 400,

            marginBottom: -2, transition: 'all 0.15s',

          }}>销售机会

        </div>

      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Button type="default" ghost
          onClick={() => openCreateModal(tabFilter === 'info' ? '信息' : tabFilter === 'lead' ? '线索' : '机会')}
          style={{
            width: '100%', height: 48, borderRadius: 10,
            border: `1.5px dashed ${COLORS.borderLight}`,
            color: COLORS.primary, fontSize: 14, fontWeight: 600,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.border = `1.5px dashed ${COLORS.primary}`; e.currentTarget.style.background = COLORS.bgSelected; }}
          onMouseLeave={e => { e.currentTarget.style.border = `1.5px dashed ${COLORS.borderLight}`; e.currentTarget.style.background = 'transparent'; }}
        >
          <PlusOutlined /> 新增{tabFilter === 'info' ? '信息' : tabFilter === 'lead' ? '线索' : '机会'}
        </Button>
      </div>



      <div style={{
        borderRadius: 10, border: `1px solid ${COLORS.borderLight}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
      }}>
      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        pagination={false}
        size="small"
        bordered
        locale={{ emptyText: '暂无匹配的销售机会' }}
        style={{ background: '#fff', borderRadius: 8 }}
        onRow={rec => ({
          style: {
            background: rec.terminated ? COLORS.bgTag : 'transparent',
            color: rec.terminated ? COLORS.textLight : 'inherit',
          },
        })}
      />
      </div>

      <div style={{
        display: 'flex', gap: 24, marginTop: 12, padding: '10px 16px',
        background: COLORS.bgLight, borderRadius: 4, border: `1px solid ${COLORS.border}`,
        fontSize: 13,
      }}>

        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: COLORS.textDisabled }}>
          {filtered.length} 个项目
        </div>
      </div>

      {/* 新建/编辑 Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 3, height: 18, background: COLORS.primary, borderRadius: 1 }} />
            <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.5 }}>
              {editing ? '编辑销售机会' : `新建${tabFilter === 'info' ? '信息' : tabFilter === 'lead' ? '线索' : '机会'}`}
            </span>
          </div>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        width={760}
        destroyOnHidden
        styles={{ body: { padding: '24px 8px 8px' } }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button icon={<CloseOutlined />} onClick={() => setModalOpen(false)}
              style={{ borderRadius: 3, width: 36, height: 36 }} />
            <Button type="primary" ghost icon={<CheckOutlined />} onClick={handleModalOk}
              style={{ borderColor: COLORS.primary, color: COLORS.primary, borderRadius: 3, width: 36, height: 36 }} />
          </div>
        }
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col width="100" /><col width="1.3*" /><col width="100" /><col width="1.3*" />
          </colgroup>
          <tbody>
            <tr>
              <td style={labelStyle2}>客户名称 *</td>
              <td style={cellStyle2}>
                <Dropdown menu={{
                  items: enterpriseClients.filter(c => c.type === 'enterprise').map(c => ({
                    key: c.name,
                    label: <span style={{ fontSize: 13, color: formData.clientName === c.name ? COLORS.primary : COLORS.textDark }}>{c.name}</span>,
                    onClick: () => {
                      const ec = enterpriseClients.find(x => x.name === c.name);
                      setFormData(p => ({ ...p, clientName: c.name, salesman: ec?.salesman || p.salesman }));
                    },
                  })),
                }} trigger={['click']}>
                  <span style={{ cursor: 'pointer', color: formData.clientName ? COLORS.primary : COLORS.textLight, fontWeight: 600, fontSize: 13 }}>
                    {formData.clientName || '搜索选择客户…'} <span style={{ fontSize: 10 }}>▾</span>
                  </span>
                </Dropdown>
              </td>
              <td style={labelStyle2}>项目名称 *</td>
              <td style={cellStyle2}>
                <input value={formData.projectName || ''} onChange={e => setFormData(p => ({ ...p, projectName: e.target.value }))}
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box' }} />
              </td>
            </tr>
            <tr>
              <td style={labelStyle2}>项目阶段</td>
              <td style={cellStyle2}>
                {tabFilter === 'info' || tabFilter === 'lead' ? (
                  <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark }}>{formData.stage || (tabFilter === 'info' ? '信息' : '线索')}</span>
                ) : (
                  <Dropdown menu={{
                    items: STAGE_OPTIONS.filter(s => s !== '信息' && s !== '线索').map(s => ({
                      key: s,
                      label: <span style={{ fontSize: 13, color: s === formData.stage ? COLORS.primary : COLORS.textDark }}>{s}</span>,
                      onClick: () => setFormData(p => ({ ...p, stage: s })),
                    })),
                  }} trigger={['click']}>
                    <span style={{ cursor: 'pointer', color: COLORS.primary, fontWeight: 600, fontSize: 13 }}>
                      {formData.stage || '机会'} <span style={{ fontSize: 10 }}>▾</span>
                    </span>
                  </Dropdown>
                )}
              </td>
              <td style={labelStyle2}>金额</td>
              <td style={cellStyle2}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 13, color: COLORS.textSecondary, fontWeight: 600 }}>¥</span>
                  <input type="text" value={formData.amount ? Math.round(formData.amount).toLocaleString() : ''}
                    onChange={e => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setFormData(p => ({ ...p, amount: parseInt(raw, 10) || 0 }));
                    }}
                    placeholder="0"
                    style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', fontWeight: 600 }} />
                </div>
              </td>
            </tr>
            <tr>
              <td style={labelStyle2}>赢率 (%)</td>
              <td style={cellStyle2}>
                <input type="number" min={0} max={100} value={formData.winRate ?? ''} onChange={e => setFormData(p => ({ ...p, winRate: e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0 }))}
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box' }} />
              </td>
              <td style={labelStyle2}>竞争对手</td>
              <td style={cellStyle2}>
                <input value={formData.competitor || ''} onChange={e => setFormData(p => ({ ...p, competitor: e.target.value }))}
                  placeholder="用 ，/ / 、 分隔"
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box' }} />
              </td>
            </tr>
            <tr>
              <td style={labelStyle2}>区域销售</td>
              <td style={cellStyle2}>
                {/* 销售员从所属客户信息带出（客户管理中维护），创建时自动填入、不可手动修改 */}
                <input value={formData.salesman || ''} readOnly
                  title="销售员取自客户信息（客户管理维护），创建后不可修改"
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', color: COLORS.textLight, cursor: 'not-allowed' }} />
              </td>
              <td style={labelStyle2}>定标日期</td>
              <td style={cellStyle2}>
                <input value={formData.expectedCloseDate || ''} onChange={e => setFormData(p => ({ ...p, expectedCloseDate: e.target.value }))}
                  placeholder="yyyy/mm/dd"
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box' }} />
              </td>
            </tr>
            <tr>
              <td style={labelStyle2}>备注</td>
              <td colSpan={3} style={cellStyle2}>
                <textarea value={formData.notes || ''} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', resize: 'none' }} />
              </td>
            </tr>
          </tbody>
        </table>
      </Modal>

      {/* 转交付弹窗 */}
      <Modal
        title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.5 }}>转交付</span>}
        open={!!deliveryOpp}
        onCancel={() => setDeliveryOpp(null)}
        width={460}
        destroyOnHidden
        styles={{ body: { padding: '14px 32px 6px' } }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button icon={<CloseOutlined />} onClick={() => setDeliveryOpp(null)}
              style={{ borderRadius: 3, width: 36, height: 36 }} />
            <Button type="primary" ghost icon={<CheckOutlined />} onClick={confirmDeliver}
              style={{ borderColor: COLORS.primary, color: COLORS.primary, borderRadius: 3, width: 36, height: 36 }} />
          </div>
        }
      >
        {deliveryOpp && (
          <div style={{ textAlign: 'center', padding: '4px 0 0' }}>
            <div style={{ fontSize: 14, color: COLORS.textDark, fontWeight: 600, marginBottom: 6 }}>
              将"{deliveryOpp.projectName}"转为交付项目？
            </div>
            <div style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.6 }}>
              该项目将从机会清单删除，信息转入交付管理和销售分析。
            </div>
          </div>
        )}
      </Modal>

      {/* 确认终止弹窗 */}
      <Modal
        title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.5 }}>确认终止</span>}
        open={!!terminateOpp}
        onCancel={() => setTerminateOpp(null)}
        width={460}
        destroyOnHidden
        styles={{ body: { padding: "14px 32px 6px" } }}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button icon={<CloseOutlined />} onClick={() => setTerminateOpp(null)}
              style={{ borderRadius: 3, width: 36, height: 36 }} />
            <Button type="primary" ghost icon={<CheckOutlined />} onClick={confirmTerminate}
              style={{ borderColor: COLORS.danger, color: COLORS.danger, borderRadius: 3, width: 36, height: 36 }} />
          </div>
        }
      >
        {terminateOpp && (
          <div style={{ textAlign: 'center', padding: '4px 0 0' }}>
            <div style={{ fontSize: 14, color: COLORS.textDark, fontWeight: 600, marginBottom: 6 }}>
              项目"{terminateOpp.projectName}"终止后将不可再修改。
            </div>
            <div style={{ fontSize: 13, color: COLORS.textMuted }}>确认终止？</div>
          </div>
        )}
      </Modal>





      {/* 阶段晋升弹窗（转线索/转机会） */}
      <Modal
        title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.5 }}>{promoteOpp ? (promoteOpp.targetStage === "线索" ? "转线索" : "转机会") : ""}</span>}
        open={!!promoteOpp}
        onCancel={() => setPromoteOpp(null)}
        width={460}
        destroyOnHidden
        styles={{ body: { padding: "14px 32px 6px" } }}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button icon={<CloseOutlined />} onClick={() => setPromoteOpp(null)}
              style={{ borderRadius: 3, width: 36, height: 36 }} />
            <Button type="primary" ghost icon={<CheckOutlined />} onClick={confirmPromote}
              style={{ borderColor: COLORS.primary, color: COLORS.primary, borderRadius: 3, width: 36, height: 36 }} />
          </div>
        }
      >
        {promoteOpp && (
          <div style={{ textAlign: 'center', padding: '4px 0 0' }}>
            <div style={{ fontSize: 14, color: COLORS.textDark, fontWeight: 600, marginBottom: 6 }}>
              {promoteOpp.targetStage === "线索"
                ? '将"' + promoteOpp.opp.projectName + '"转线索？'
                : '将"' + promoteOpp.opp.projectName + '"转机会，提交审批确认？'}
            </div>
            <div style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.6 }}>
              {promoteOpp.targetStage === "机会"
                ? '提交后将进入审批流程，待总监审批通过后晋升为机会。'
                : '确认后直接转为线索阶段。'}
            </div>
          </div>
        )}
      </Modal>

      {/* 原因选择弹窗 */}

      <Modal
        title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.5 }}>{reasonModal.action === 'loss' ? '输单原因' : reasonModal.action === 'win' ? '赢单原因' : '冻结原因'}</span>}
        open={reasonModal.open}
        onCancel={() => setReasonModal(p => ({ ...p, open: false }))}
        width={420}
        destroyOnHidden
        styles={{ body: { padding: '24px 8px 8px' } }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button icon={<CloseOutlined />} onClick={() => setReasonModal(p => ({ ...p, open: false }))}
              style={{ borderRadius: 3, width: 36, height: 36 }} />
            <Button type="primary" ghost icon={<CheckOutlined />} onClick={handleReasonOk}
              style={{ borderColor: COLORS.primary, color: COLORS.primary, borderRadius: 3, width: 36, height: 36 }} />
          </div>
        }
      >
        {reasonModal.action && reasonModal.opp && (() => {
          const cfg = REASON_TAXONOMY[reasonModal.action];
          const groups = cfg.groups;
          return (
            <div>
              {/* 大类切换标签（下划线样式） */}
              {groups.length > 1 && (
                <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderBottom: `1.5px solid ${COLORS.borderLight}` }}>
                  {groups.map(g => (
                    <span key={g.groupLabel}
                      onClick={() => setReasonModal(p => ({ ...p, selectedGroup: g.groupLabel, selections: {} }))}
                      style={{
                        padding: '6px 18px', fontSize: 13, cursor: 'pointer',
                        borderBottom: reasonModal.selectedGroup === g.groupLabel ? `2px solid ${COLORS.primary}` : '2px solid transparent',
                        color: reasonModal.selectedGroup === g.groupLabel ? COLORS.primary : COLORS.textSecondary,
                        fontWeight: 600,
                        marginBottom: -2, transition: 'all 0.15s',
                      }}
                    >{g.groupLabel}</span>
                  ))}
                </div>
              )}
              {/* 输单时选择赢家（自定义下拉） */}
              {reasonModal.action === 'loss' && reasonModal.opp && reasonModal.opp.competitor && (() => {
                const competitors = reasonModal.opp.competitor.split(/[、，]/).map(s => s.trim()).filter(Boolean);
                if (competitors.length === 0) return null;
                const current = reasonModal.winner || competitors[0];
                return (
                  <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: COLORS.textDark, fontWeight: 600 }}>赢家</span>
                    <div style={{ position: 'relative' }}>
                      <div onClick={() => setReasonModal(p => ({ ...p, dropdownOpen: !p.dropdownOpen }))}
                        style={{
                          fontSize: 13, padding: '4px 8px', borderRadius: 4,
                          background: COLORS.bgLight, color: COLORS.primary, cursor: 'pointer',
                          minWidth: 100, userSelect: 'none', position: 'relative',
                        }}
                      >
                        {current}
                        <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: COLORS.primary }}>▼</span>
                      </div>
                      {reasonModal.dropdownOpen && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                          background: COLORS.bgLight, marginTop: 2, borderRadius: 4,
                          overflow: 'hidden',
                        }}>
                          {competitors.map(c => (
                            <div key={c}
                              onClick={() => { setReasonModal(p => ({ ...p, winner: c, dropdownOpen: false })); }}
                              style={{
                                padding: '4px 8px', fontSize: 13, color: current === c ? COLORS.primary : COLORS.textSecondary,
                                background: current === c ? COLORS.bgSelected : 'transparent',
                                cursor: 'pointer', fontWeight: current === c ? 600 : 400,
                              }}
                            >
                              {c}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              {/* 选中大类下的原因列表（平铺） */}
              {(() => {
                const activeGroup = groups.find(g => g.groupLabel === reasonModal.selectedGroup);
                if (!activeGroup) return null;
                const items = activeGroup.items;
                return (
                  <div style={{ height: 280, overflowY: 'auto' }}>
                    {items.map(item => {
                      const hasSub = item.items && item.items.length > 0;
                      if (!hasSub) {
                        const checked = reasonModal.selections[item.label] !== undefined;
                        return (
                          <div key={item.label} onClick={() => toggleSub(item.label)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 10px', borderRadius: 5, marginBottom: 2, background: checked ? COLORS.bgSelected : COLORS.bgLight, border: '1px solid ' + (checked ? COLORS.primary : COLORS.border) }}
                          >
                            <span style={{ width: 15, height: 15, borderRadius: 3, border: '1.5px solid ' + (checked ? COLORS.primary : COLORS.textDisabled), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: checked ? '#fff' : 'transparent', background: checked ? COLORS.primary : 'transparent', fontWeight: 700, flexShrink: 0 }}>
                              {checked ? '✓' : ''}
                            </span>
                            <span style={{ fontSize: 13, color: checked ? COLORS.primary : COLORS.textDark }}>{item.label}</span>
                          </div>
                        );
                      }
                      return (
                        <div key={item.label} style={{ marginBottom: 4 }}>
                          <div style={{ fontSize: 13, fontWeight: 400, color: COLORS.textDark, marginBottom: 3, padding: '2px 0' }}>{item.label}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginLeft: 4 }}>
                            {item.items!.map(subItem => {
                              const dc = (reasonModal.selections[item.label] || []).includes(subItem.label);
                              return (
                                <div key={subItem.label} onClick={() => toggleDetail(item.label, subItem.label)}
                                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 10px', borderRadius: 5, background: dc ? COLORS.bgSelected : COLORS.bgLight, border: '1px solid ' + (dc ? COLORS.primary : COLORS.border) }}
                                >
                                  <span style={{ width: 15, height: 15, borderRadius: 3, border: '1.5px solid ' + (dc ? COLORS.primary : COLORS.textDisabled), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: dc ? '#fff' : 'transparent', background: dc ? COLORS.primary : 'transparent', fontWeight: 700, flexShrink: 0 }}>
                                    {dc ? '✓' : ''}
                                  </span>
                                  <span style={{ fontSize: 13, color: dc ? COLORS.primary : COLORS.textDark }}>{subItem.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {/* Comment */}
              <div style={{ marginTop: 12, borderTop: `1px solid ${COLORS.borderLight}`, paddingTop: 10 }}>
                <textarea
                  value={reasonModal.comment || ''}
                  onChange={e => setReasonModal(p => ({ ...p, comment: e.target.value }))}
                  placeholder="备注说明（选填）"
                  rows={2}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    fontSize: 13, color: COLORS.textDark,
                    border: `1px solid ${COLORS.borderLight}`, borderRadius: 6,
                    padding: '6px 10px', resize: 'none', outline: 'none',
                  }}
                />
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* 蓝表弹窗 */}
      <BlueTableModal
        open={blueTableOpen}
        opportunity={blueTableOpp}
        onSave={blueTableOpp?.terminated || blueTableOpp?.promoteLocked ? undefined : handleBlueTableSave}
        onClose={() => { setBlueTableOpen(false); setBlueTableOpp(null); }}
      />

    </div>
    </>
  );
};



const labelStyle2: React.CSSProperties = { padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle', fontWeight: 600, background: COLORS.bgLight, whiteSpace: 'nowrap', color: COLORS.labelDark };

const cellStyle2: React.CSSProperties = { padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' };



// ── 项目名称下拉搜索器 ──

// ── 客户名称下拉搜索器 ──
export default SalesOpportunityList;

