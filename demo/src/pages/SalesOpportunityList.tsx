import React, { useState, useMemo, useCallback } from 'react';

import { useNavigate } from 'react-router-dom';

import { Button, Table, Tag, Input, Select, Modal, message, Dropdown } from 'antd';

import { PlusOutlined, EditOutlined, FileAddOutlined, CheckCircleOutlined, CloseCircleOutlined, PauseCircleOutlined, PlayCircleOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';

import { mockOpportunities, mockDeliveryProjects, mockClients, mockQuotationSummaries } from '../mockData';
import ClientNameCell from '../components/ClientNameCell';
import type { SalesOpportunity, DeliveryProject, DeliveryNode } from '../types';
import { REASON_TAXONOMY, formatReasons } from '../reasonTaxonomy';
import { parseFY, FYSelector } from '../utils/fiscalYear';
import { notifyMockUpdate } from '../utils/mockStore';
import { COLORS } from '../styles/constants';



const STAGE_OPTIONS = ['信息', '线索', '机会', '投标', '议价', '中标'];

const stageColors: Record<string, string> = {

  信息: COLORS.textLight, 线索: COLORS.primary, 机会: COLORS.purple,

  投标: COLORS.warning, 议价: COLORS.amber, 中标: COLORS.success,

};

const statusColors: Record<string, string> = {

  过程中: COLORS.primary, 赢: COLORS.success, 输: COLORS.danger, 冻结: COLORS.textLight,

};

const CELL_INPUT: React.CSSProperties = {
  width: '100%', border: 'none', background: 'transparent', outline: 'none',
  fontSize: 13, color: COLORS.textPrimary, padding: '2px 0',
};


// SalesOpportunity state is local; SalesAnalysis reads from mockOpportunities directly



const SalesOpportunityList: React.FC = () => {

  const navigate = useNavigate();

  const [msg, ctx] = message.useMessage();

  const [opportunities, setOpportunities] = useState<SalesOpportunity[]>(() =>

    mockOpportunities.map(o => ({ ...o }))

  );


  const [tabFilter, setTabFilter] = useState<'info' | 'lead' | 'opp'>('opp');
  const [fySelect, setFySelect] = useState('FY2526');



  // Edit modal state

  const [modalOpen, setModalOpen] = useState(false);

  const [editing, setEditing] = useState<SalesOpportunity | null>(null);

  const [formData, setFormData] = useState<Partial<SalesOpportunity>>({});


  // ── 确认弹窗 ──
  const [deliveryOpp, setDeliveryOpp] = useState<SalesOpportunity | null>(null);
  const [terminateOpp, setTerminateOpp] = useState<SalesOpportunity | null>(null);
  const [promoteOpp, setPromoteOpp] = useState<{ opp: SalesOpportunity; targetStage: string } | null>(null);
  const [promoteReason, setPromoteReason] = useState('');

  // ── 原因选择弹窗 ──
  const [reasonModal, setReasonModal] = useState<{
    open: boolean; opp: SalesOpportunity | null;
    action: 'win' | 'loss' | 'freeze' | null;
    selectedGroup: string; selections: Record<string, string[]>;
    comment: string; winner: string; dropdownOpen: boolean;
  }>({
    open: false, opp: null, action: null,
    selectedGroup: '', selections: {}, comment: '', winner: '', dropdownOpen: false,
  });


  const now = () => new Date().toISOString().slice(0, 10);

  const touch = useCallback((id: string, updates: Partial<SalesOpportunity>) => {

    setOpportunities(prev => prev.map(o => o.id === id && !o.terminated ? { ...o, ...updates, updatedAt: now() } : o));

  }, []);



  const filtered = useMemo(() => {
    const fyRange = parseFY(fySelect);
    // 未来财年不显示任何数据
    if (fyRange.start > new Date()) return [];

    return opportunities.filter(o => {

      if (tabFilter === 'info' && o.stage !== '信息') return false;

      if (tabFilter === 'lead' && o.stage !== '线索') return false;

      if (tabFilter === 'opp' && (o.stage === '信息' || o.stage === '线索')) return false;

      // 财年过滤：项目中/冻结视为持续到现在，其余以 updatedAt 为终止时间
      const created = new Date(o.createdAt);
      const effectiveEnd = (o.status === '过程中' || o.status === '冻结')
        ? new Date()
        : new Date(o.updatedAt);
      if (created > fyRange.end || effectiveEnd < fyRange.start) return false;

      return true;

    });

  }, [opportunities, tabFilter, fySelect]);



  const handleStageClick = useCallback((opp: SalesOpportunity) => {

    const idx = STAGE_OPTIONS.indexOf(opp.stage);

    if (idx >= STAGE_OPTIONS.length - 1) return; // 已到最后阶段，不再循环

    const nextStage = STAGE_OPTIONS[idx + 1];

    const updates: Partial<SalesOpportunity> = { stage: nextStage };

    if (nextStage === '中标') {

      updates.status = '赢';

      updates.winRate = 100;

    }

    setOpportunities(prev => prev.map(o => o.id === opp.id && !o.terminated ? { ...o, ...updates, updatedAt: now() } : o));

  }, []);



  const openReasonModal = (opp: SalesOpportunity, action: 'win' | 'loss' | 'freeze') => {
    const cfg = REASON_TAXONOMY[action];
    const defaultGroup = cfg.groups[0]?.groupLabel || '';
    const competitors = (opp.competitor || '').split(/[、，]/).map(s => s.trim()).filter(Boolean);
    const winner = competitors.length === 1 ? competitors[0] : '';
    setReasonModal({ open: true, opp, action, selectedGroup: defaultGroup, selections: {}, comment: '', winner, dropdownOpen: false });
  };

  const handleReasonOk = () => {
    const { opp, action, selectedGroup, selections } = reasonModal;
    if (!opp || !action) return;
    const selList = Object.entries(selections).map(([subLabel, detailItems]) => ({ subLabel, detailItems }));
    const reasonsStr = formatReasons(selectedGroup, selList);
    const updates = {
      status: action === 'win' ? '赢' : action === 'loss' ? '输' : '冻结',
      reasons: reasonsStr,
      notes: reasonModal.comment || '',
      updatedAt: now(),
    } as Partial<SalesOpportunity>;
    if (action === 'loss' && reasonModal.winner) {
      updates.competitor = reasonModal.winner;
    }
    if (action === 'win') { updates.stage = '中标'; updates.winRate = 100; }
    setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, ...updates } : o));
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

  const handleStatusAction = useCallback((opp: SalesOpportunity, action: 'win' | 'loss' | 'freeze') => {
    if (action === 'freeze' && opp.status === '冻结') {
      setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, status: '过程中', reasons: '', updatedAt: now() } : o));
      msg.success('已恢复为过程中');
      return;
    }
    openReasonModal(opp, action);
  }, [msg]);



  const handleWinDeliver = useCallback((opp: SalesOpportunity) => {
    setDeliveryOpp(opp);
  }, []);

  const confirmDeliver = useCallback(() => {
    const opp = deliveryOpp;
    if (!opp) return;
    const d = now();
    const delId = 'del-' + crypto.randomUUID().slice(0, 6);

    // 查找该机会下所有报价，取最高审批通过版本
    const oppQuotes = mockQuotationSummaries.filter(q => q.opportunityId === opp.id && q.status === 'approved');
    const bestQuote = oppQuotes.length > 0 ? oppQuotes.reduce((best, q) => {
      const vb = parseFloat(best.versionNo.replace('V', ''));
      const vq = parseFloat(q.versionNo.replace('V', ''));
      return vq > vb ? q : best;
    }) : null;

    // 锁定该机会下的所有报价
    mockQuotationSummaries.forEach(q => {
      if (q.opportunityId === opp.id) q.locked = true;
    });

    // 生成默认交付节点（15个标准节点）
    const NODE_NAMES = [
      'Handover', '合同签订', 'Kickoff', '方案细化', '技术会签',
      '详细设计', '设计评审', '制造采购', '组装调试', '出厂验收',
      '包装发货', '现场安调', '验收整改', '终验收', '项目总结',
    ];
    const startDate = new Date(d);
    const nodes: DeliveryNode[] = NODE_NAMES.map((name, i) => {
      const ps = new Date(startDate);
      ps.setDate(ps.getDate() + i * 14);
      const pe = new Date(ps);
      pe.setDate(pe.getDate() + (name === '制造采购' ? 28 : 10));
      return {
        id: 'node-' + delId + '-' + i,
        projectId: delId, name, sortOrder: i + 1,
        status: 'pending' as const,
        plannedStartDate: ps.toISOString().slice(0, 10),
        plannedEndDate: pe.toISOString().slice(0, 10),
        actualDate: undefined, actualCost: 0,
        comments: '', history: [],
      };
    });

    const newDel: DeliveryProject = {
      id: delId, opportunityId: opp.id,
      salesNo: opp.salesNo, clientName: opp.clientName, projectName: opp.projectName,
      contractAmount: opp.amount,
      quotationId: bestQuote ? bestQuote.id : (opp.quotationId || ''),
      status: '进行中', nodes,
      planStatus: 'draft', costStatus: 'draft',
      createdAt: d, updatedAt: d,
    };
    mockDeliveryProjects.push(newDel);
    notifyMockUpdate();
    setOpportunities(prev => prev.filter(o => o.id !== opp.id));
    setDeliveryOpp(null);
    msg.success('已转交付，信息已移交分析模块');
    navigate('/delivery');
  }, [deliveryOpp, msg, navigate]);

  const handlePromote = useCallback((opp: SalesOpportunity, targetStage: string) => {
    setPromoteOpp({ opp, targetStage });
    setPromoteReason('');
  }, []);

  const confirmPromote = useCallback(() => {
    if (!promoteOpp) return;
    if (!promoteReason.trim()) { msg.warning('请填写原因'); return; }
    touch(promoteOpp.opp.id, { stage: promoteOpp.targetStage });
    setPromoteOpp(null);
    msg.success('已提交审批，通过后自动转入' + promoteOpp.targetStage);
  }, [promoteOpp, promoteReason, msg, touch]);

  const handleConfirmTerminate = useCallback((opp: SalesOpportunity) => {
    setTerminateOpp(opp);
  }, []);

  const confirmTerminate = useCallback(() => {
    const opp = terminateOpp;
    if (!opp) return;
    setOpportunities(prev => prev.map(o =>
      o.id === opp.id ? { ...o, terminated: true, updatedAt: now() } : o
    ));
    setTerminateOpp(null);
    msg.success('项目已终止');
  }, [terminateOpp, msg]);



  const openCreateModal = useCallback((initialStage: string = '信息') => {

    setEditing(null);

    setFormData({

      clientName: '', projectName: '', amount: 0, stage: initialStage,

      winRate: 10, status: '过程中', salesman: '', competitor: '', expectedCloseDate: '', notes: '',

    });

    setModalOpen(true);

  }, []);



  const handleModalOk = useCallback(() => {

    if (!formData.clientName || !formData.projectName) {

      msg.warning('客户名称和项目名称为必填项');

      return;

    }

    if (!mockClients.some(c => c.name === formData.clientName)) {
      msg.warning('所选客户不在客户列表中，请先在客户管理页面创建');
      return;
    }

    if (editing) {

      setOpportunities(prev => prev.map(o => o.id === editing.id ? { ...o, ...formData, updatedAt: now() } as SalesOpportunity : o));

      msg.success('机会已更新');

    } else {

      const newOpp: SalesOpportunity = {

        id: 'opp-' + crypto.randomUUID().slice(0, 6),

        salesNo: (() => {

          const d = new Date();

          const y = d.getFullYear();

          const m = String(d.getMonth() + 1).padStart(2, '0');

          const count = opportunities.filter(o => o.salesNo.startsWith('A' + y + '-' + m)).length;

          return 'A' + y + '-' + m + '-' + String(count + 1).padStart(3, '0');

        })(),

        ...formData,

        createdAt: now(),

        updatedAt: now(),

      } as SalesOpportunity;

      setOpportunities(prev => [...prev, newOpp]);

      msg.success('机会已创建');

    }

    setModalOpen(false);

  }, [editing, formData, opportunities, msg]);







  const columns = useMemo(() => [
    { title: '序号', key: 'index', width: 26, align: 'center' as const,
      render: (_: unknown, rec: SalesOpportunity, i: number) =>
        rec.terminated
          ? <div style={{ position: 'relative', textAlign: 'center' }}>
              <span style={{ position: 'absolute', left: 2, color: COLORS.danger, fontSize: 12, fontWeight: 700 }}>X</span>
              <span style={{ color: COLORS.textLight }}>{i + 1}</span>
            </div>
          : <span style={{ color: COLORS.textLight }}>{i + 1}</span> },
    { title: '客户名称', dataIndex: 'clientName', width: 154,
      render: (v: string, rec: SalesOpportunity) => rec.terminated
        ? <span style={{ fontSize: 13, color: COLORS.textLight }}>{v || '—'}</span>
        : <ClientNameCell value={v} onSelect={name => touch(rec.id, { clientName: name })} />},
    { title: '销售编号', dataIndex: 'salesNo', width: 80,
      render: (v: string, rec: SalesOpportunity) => rec.terminated
        ? <span style={{ color: COLORS.textLight }}>{v}</span>
        : <span style={{ fontWeight: 600 }}>{v}</span> },
    { title: '项目名称', dataIndex: 'projectName', width: 200,
      render: (v: string, rec: SalesOpportunity) => rec.terminated
        ? <span style={{ fontSize: 13, color: COLORS.textLight }}>{v || '—'}</span>
        : (
        <input type="text" defaultValue={v || ''}
          onBlur={e => touch(rec.id, { projectName: e.target.value })}
          style={CELL_INPUT}
        />
      )},
    { title: '说明', dataIndex: 'notes', width: 315,
      render: (v: string, rec: SalesOpportunity) => rec.terminated
        ? <span style={{ fontSize: 13, color: COLORS.textLight }}>{v || '—'}</span>
        : (
        <input type="text" defaultValue={v || ''}
          onBlur={e => touch(rec.id, { notes: e.target.value })}
          placeholder="—"
          style={{ ...CELL_INPUT, color: COLORS.chartGray }}
        />
      )},
    { title: '金额', dataIndex: 'amount', width: 90, align: 'right' as const,
      render: (v: number, rec: SalesOpportunity) => (
        <span style={{ cursor: rec.terminated ? 'default' : 'pointer', color: rec.terminated ? COLORS.textLight : COLORS.primary, fontWeight: 600, fontSize: 13 }}
          onClick={rec.terminated ? undefined : () => {
            const input = prompt('输入金额（元）：', String(v));
            if (input !== null) {
              const val = parseInt(input.replace(/[^0-9-]/g, '')) || 0;
              touch(rec.id, { amount: val });
            }
          }}>&yen;{Math.round(v).toLocaleString()}</span>
      )},
    ...(tabFilter !== 'info' && tabFilter !== 'lead'
      ? [{ title: '阶段', dataIndex: 'stage', width: 40, align: 'center' as const,
        filters: [
          { text: '全部', value: '__all__' },
          { text: '投标', value: '投标' },
          { text: '议价', value: '议价' },
          { text: '中标', value: '中标' },
        ],
        filterSearch: true,
        filterDropdownProps: { minOverlayWidthMatchTrigger: false },
        onFilter: (value: string, record: SalesOpportunity) => value === '__all__' || record.stage === value,
        render: (v: string, rec: SalesOpportunity) => rec.terminated
          ? <Tag color={COLORS.textLight} style={{ cursor: 'default', margin: 0 }}>{v}</Tag>
          : <Tag color={stageColors[v] || COLORS.textLight} style={{ cursor: 'pointer', margin: 0 }}
              onClick={() => handleStageClick(rec)}>{v}</Tag>
        }]
      : []),
    { title: '赢率', dataIndex: 'winRate', width: 30, align: 'center' as const,
      render: (v: number, rec: SalesOpportunity) => (
        <span style={{ cursor: rec.terminated ? 'default' : 'pointer', color: rec.terminated ? COLORS.textLight : COLORS.primary, fontWeight: 600 }}
          onClick={rec.terminated ? undefined : () => { const next = v >= 100 ? 0 : Math.min(v + 10, 100); touch(rec.id, { winRate: next }); }}>{v}%</span>
      )},
    { title: '竞争对手', dataIndex: 'competitor', width: 145,
      render: (v: string, rec: SalesOpportunity) => {
        if (rec.terminated) return <span style={{ fontSize: 13, color: COLORS.textPrimary }}>{v || '—'}</span>;
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
        if (rec.terminated) return <Tag color={COLORS.textLight} style={{ margin: 0, fontSize: 12 }}>{v}</Tag>;
        const STATUS_ACTIONS: Record<string, { icon: React.ReactNode; action: string; label: string }[]> = {
          '过程中': [
            { icon: <CheckCircleOutlined />, action: 'win', label: '赢单' },
            { icon: <CloseCircleOutlined />, action: 'loss', label: '输单' },
            { icon: <PauseCircleOutlined />, action: 'freeze', label: '冻结' },
          ],
          '冻结': [
            { icon: <PlayCircleOutlined />, action: 'freeze', label: '恢复' },
          ],
        };
        const actions = STATUS_ACTIONS[v] || [];
        const isEarlyStage = (rec.stage === '信息' || rec.stage === '线索') && v === '过程中';
        if (actions.length === 0) {
          return <Tag color={statusColors[v] || COLORS.textLight} style={{ margin: 0, fontSize: 12 }}>{v}</Tag>;
        }
        return (
          <Dropdown menu={{
            items: actions.map(a => ({
              key: a.action,
              disabled: a.action === 'win' && isEarlyStage,
              label: <div style={{ fontSize: 18, color: a.action === 'win' && isEarlyStage ? COLORS.textDisabled : statusColors[a.action === 'freeze' && v === '冻结' ? '过程中' : a.action === 'win' ? '赢' : a.action === 'loss' ? '输' : '过程中'] || COLORS.textLight, textAlign: 'center', padding: '2px 4px' }}>{a.icon}</div>,
              onClick: a.action === 'win' && isEarlyStage ? undefined
                : () => a.action === 'win' ? handleStatusAction(rec, 'win')
                : a.action === 'loss' ? handleStatusAction(rec, 'loss')
                : handleStatusAction(rec, 'freeze'),
            })),
                    }} trigger={['click']}>
            <Tag color={statusColors[v] || COLORS.textLight}
              style={{ cursor: 'pointer', margin: 0, fontSize: 12 }}>
              {v} <span style={{ fontSize: 10, marginLeft: 2 }}>▼</span>
            </Tag>
          </Dropdown>
        );
        }
      },
    { title: '区域销售', dataIndex: 'salesman', width: 32,
      filters: [{ text: '全部', value: '__all__' }, ...Array.from(new Set(opportunities.map(o => o.salesman).filter(Boolean))).map(s => ({ text: s, value: s }))],
      filterSearch: true,
      filterDropdownProps: { minOverlayWidthMatchTrigger: false },
      onFilter: (value: string, record: SalesOpportunity) => value === '__all__' || record.salesman === value,
      render: (v: string, rec: SalesOpportunity) => rec.terminated
        ? <span style={{ fontSize: 13, color: COLORS.textLight }}>{v || '—'}</span>
        : (
        <input type="text" defaultValue={v || ''}
          onBlur={e => touch(rec.id, { salesman: e.target.value })}
          style={CELL_INPUT}
        />
      )},
    { title: '预计定标', dataIndex: 'expectedCloseDate', width: 67,
      filters: Array.from(new Set(opportunities.map(o => o.expectedCloseDate).filter(Boolean))).sort().map(s => ({ text: s, value: s })),
      onFilter: (value: string, record: SalesOpportunity) => record.expectedCloseDate === value,
      render: (v: string, rec: SalesOpportunity) => rec.terminated
        ? <span style={{ fontSize: 13, color: COLORS.textLight }}>{v || '—'}</span>
        : (
        <input type="text" defaultValue={v || ''}
          onBlur={e => touch(rec.id, { expectedCloseDate: e.target.value })}
          placeholder="yyyy-mm-dd"
          style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: COLORS.textPrimary }}
        />
      )},
    { title: '报价', dataIndex: 'quotationId', width: 50, align: 'center' as const,
      render: (v: string | undefined, rec: SalesOpportunity) => rec.terminated
        ? <span style={{ color: COLORS.textLight, fontSize: 13 }}>—</span>
        : (
        <Button type="text" size="small"
          icon={v ? <EditOutlined style={{ fontSize: 18 }} /> : <FileAddOutlined style={{ fontSize: 18 }} />}
          onClick={() => navigate(v ? '/quotations/' + v : '/quotations/new?oppId=' + rec.id)}
          style={{ color: COLORS.primary }}
        />
      )},
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
        return (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
            {rec.status === '赢' && (
              <Button type="text" size="small" icon={<CheckOutlined style={{ fontSize: 18 }} />}
                onClick={() => handleWinDeliver(rec)}
                style={{ color: COLORS.purple }} title="转交付" />
            )}
            {rec.status === '输' && !rec.terminated && (
              <Button type="text" size="small" icon={<CloseOutlined style={{ fontSize: 18 }} />}
                onClick={() => handleConfirmTerminate(rec)}
                style={{ color: COLORS.purple }} title="确认终止" />
            )}
            {rec.status === '输' && rec.terminated && (
              <span style={{ fontSize: 12, color: COLORS.textLight }}>已终止</span>
            )}
          </div>
        );
      },
    },
    { title: '操作日期', dataIndex: 'updatedAt', width: 100,
      render: (v: string) => <span style={{ fontSize: 13, color: COLORS.textLight }}>{v || '—'}</span> },
  ], [tabFilter, touch, handlePromote, handleConfirmTerminate, handleWinDeliver, handleStageClick, opportunities, handleStatusAction, navigate]);



  return (
    <>
      <div>

      {ctx}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark }}>销售管理</span>
        <FYSelector value={fySelect} onChange={setFySelect} />
      </div>



      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: `1.5px solid ${COLORS.borderLight}` }}>

        <div onClick={() => setTabFilter('info')}

          style={{

            padding: '8px 20px', cursor: 'pointer', fontSize: 14,

            borderBottom: tabFilter === 'info' ? `2px solid ${COLORS.primary}` : '2px solid transparent',

            color: tabFilter === 'info' ? COLORS.primary : COLORS.textSecondary, fontWeight: tabFilter === 'info' ? 600 : 400,

            marginBottom: -2, transition: 'all 0.15s',

          }}>销售信息

        </div>

        <div onClick={() => setTabFilter('lead')}

          style={{

            padding: '8px 20px', cursor: 'pointer', fontSize: 14,

            borderBottom: tabFilter === 'lead' ? `2px solid ${COLORS.purple}` : '2px solid transparent',

            color: tabFilter === 'lead' ? COLORS.purple : COLORS.textSecondary, fontWeight: tabFilter === 'lead' ? 600 : 400,

            marginBottom: -2, transition: 'all 0.15s',

          }}>销售线索

        </div>

        <div onClick={() => setTabFilter('opp')}

          style={{

            padding: '8px 20px', cursor: 'pointer', fontSize: 14,

            borderBottom: tabFilter === 'opp' ? `2px solid ${COLORS.success}` : '2px solid transparent',

            color: tabFilter === 'opp' ? COLORS.success : COLORS.textSecondary, fontWeight: tabFilter === 'opp' ? 600 : 400,

            marginBottom: -2, transition: 'all 0.15s',

          }}>销售机会

        </div>

      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Button type="default" ghost icon={<PlusOutlined />}
          onClick={() => openCreateModal(tabFilter === 'info' ? '信息' : tabFilter === 'lead' ? '线索' : '投标')}
          style={{
            borderRadius: 8, border: `1.5px dashed ${COLORS.borderLight}`,
            color: COLORS.primary, fontSize: 14, fontWeight: 600, height: 36,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.border = `1.5px dashed ${COLORS.primary}`; e.currentTarget.style.background = COLORS.bgSelected; }}
          onMouseLeave={e => { e.currentTarget.style.border = `1.5px dashed ${COLORS.borderLight}`; e.currentTarget.style.background = 'transparent'; }}
        >
          新增{tabFilter === 'info' ? '信息' : tabFilter === 'lead' ? '线索' : '机会'}
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

        title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.5 }}>{editing ? '编辑销售机会' : '新建销售机会'}</span>}

        open={modalOpen}

        onCancel={() => setModalOpen(false)}
        width={520}
        destroyOnHidden
        styles={{ body: { padding: '24px 28px 8px' } }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button icon={<CloseOutlined />} onClick={() => setModalOpen(false)}
              style={{ borderRadius: 3, width: 36, height: 36 }} />
            <Button type="primary" ghost icon={<CheckOutlined />} onClick={handleModalOk}
              style={{ borderColor: COLORS.primary, color: COLORS.primary, borderRadius: 3, width: 36, height: 36 }} />
          </div>
        }

      >

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          <div style={{ display: 'flex', gap: 12 }}>

            <div style={{ flex: 1 }}>

              <div style={labelStyle}>客户名称 *</div>

              <Select showSearch value={formData.clientName || undefined}
                onChange={val => setFormData(p => ({ ...p, clientName: val }))}
                placeholder="搜索选择客户…"
                filterOption={(input, option) =>
                  (option?.label as string || '').toLowerCase().includes(input.toLowerCase())
                }
                notFoundContent={
                  <div style={{ padding: 8, fontSize: 12, color: COLORS.textLight }}>
                    未找到，请先到
                    <a href="/clients" onClick={e => { e.preventDefault(); navigate('/clients'); }}
                      style={{ color: COLORS.primary }}> 客户管理</a>
                    创建
                  </div>
                }
                options={mockClients.filter(c => c.type === 'enterprise').map(c => ({
                  value: c.name, label: c.name,
                }))}
                style={{ width: '100%' }}
              />

            </div>

            <div style={{ flex: 1 }}>

              <div style={labelStyle}>项目名称 *</div>

              <Input value={formData.projectName} onChange={e => setFormData(p => ({ ...p, projectName: e.target.value }))} />

            </div>

          </div>

          <div style={{ display: 'flex', gap: 12 }}>

            <div style={{ flex: 1 }}>

              <div style={labelStyle}>预计金额</div>

              <Input type="number" value={formData.amount} onChange={e => setFormData(p => ({ ...p, amount: parseInt(e.target.value) || 0 }))} />

            </div>

            <div style={{ flex: 1 }}>

              <div style={labelStyle}>项目阶段</div>

              <Select value={formData.stage} onChange={v => setFormData(p => ({ ...p, stage: v }))}

                options={STAGE_OPTIONS.map(s => ({ value: s, label: s }))} style={{ width: '100%' }} />

            </div>

          </div>

          <div style={{ display: 'flex', gap: 12 }}>

            <div style={{ flex: 1 }}>

              <div style={labelStyle}>赢率 (%)</div>

              <Input type="number" min={0} max={100} value={formData.winRate} onChange={e => setFormData(p => ({ ...p, winRate: parseInt(e.target.value) || 0 }))} />

            </div>

            <div style={{ flex: 1 }}>

              <div style={labelStyle}>竞争对手</div>

              <Input value={formData.competitor} onChange={e => setFormData(p => ({ ...p, competitor: e.target.value }))} placeholder="主要竞争对手" />

            </div>

          </div>

          <div style={{ display: 'flex', gap: 12 }}>

            <div style={{ flex: 1 }}>

              <div style={labelStyle}>区域销售</div>

              <Input value={formData.salesman} onChange={e => setFormData(p => ({ ...p, salesman: e.target.value }))} />

            </div>

          </div>

          <div>

            <div style={labelStyle}>预计定标日期</div>

            <Input value={formData.expectedCloseDate} onChange={e => setFormData(p => ({ ...p, expectedCloseDate: e.target.value }))} placeholder="yyyy-mm-dd" />

          </div>

          <div>

            <div style={labelStyle}>备注</div>

            <Input.TextArea rows={2} value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} />

          </div>

        </div>

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
        styles={{ body: { padding: "12px 24px 4px" }, content: { borderRadius: 4 } }}
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
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: "#555" }}>
              请填写原因（如竞争分析结果）：
            </div>
            <div style={{ margin: "0 -24px" }}>
              <textarea rows={2}
                value={promoteReason}
                onChange={e => { setPromoteReason(e.target.value); }}
                placeholder={"输入" + (promoteOpp.targetStage === "线索" ? "转线索" : "转机会") + "原因…"}
                style={{ width: "100%", border: `1px solid ${COLORS.borderInput}`, borderRadius: 3, padding: "6px 24px", fontSize: 13, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", borderLeft: "none", borderRight: "none" }}
            />
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
                    <span style={{ fontSize: 13, color: '#444', fontWeight: 600 }}>赢家</span>
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
                                padding: '4px 8px', fontSize: 13, color: current === c ? COLORS.primary : '#555',
                                background: current === c ? '#c8e6c9' : 'transparent',
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
                            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 10px', borderRadius: 5, marginBottom: 2, background: checked ? '#eef4ff' : '#f8f8f8', border: '1px solid ' + (checked ? COLORS.primary : COLORS.border) }}
                          >
                            <span style={{ width: 15, height: 15, borderRadius: 3, border: '1.5px solid ' + (checked ? COLORS.primary : COLORS.textDisabled), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: checked ? '#fff' : 'transparent', background: checked ? COLORS.primary : 'transparent', fontWeight: 700, flexShrink: 0 }}>
                              {checked ? '✓' : ''}
                            </span>
                            <span style={{ fontSize: 13, color: checked ? COLORS.primary : '#444' }}>{item.label}</span>
                          </div>
                        );
                      }
                      return (
                        <div key={item.label} style={{ marginBottom: 4 }}>
                          <div style={{ fontSize: 13, fontWeight: 400, color: '#444', marginBottom: 3, padding: '2px 0' }}>{item.label}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginLeft: 4 }}>
                            {item.items!.map(subItem => {
                              const dc = (reasonModal.selections[item.label] || []).includes(subItem.label);
                              return (
                                <div key={subItem.label} onClick={() => toggleDetail(item.label, subItem.label)}
                                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 10px', borderRadius: 5, background: dc ? '#eef4ff' : '#f8f8f8', border: '1px solid ' + (dc ? COLORS.primary : COLORS.border) }}
                                >
                                  <span style={{ width: 15, height: 15, borderRadius: 3, border: '1.5px solid ' + (dc ? COLORS.primary : COLORS.textDisabled), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: dc ? '#fff' : 'transparent', background: dc ? COLORS.primary : 'transparent', fontWeight: 700, flexShrink: 0 }}>
                                    {dc ? '✓' : ''}
                                  </span>
                                  <span style={{ fontSize: 13, color: dc ? COLORS.primary : '#444' }}>{subItem.label}</span>
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
              <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 10 }}>
                <textarea
                  value={reasonModal.comment || ''}
                  onChange={e => setReasonModal(p => ({ ...p, comment: e.target.value }))}
                  placeholder="备注说明（选填）"
                  rows={2}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    fontSize: 13, color: '#444',
                    border: '1px solid #ddd', borderRadius: 6,
                    padding: '6px 10px', resize: 'none', outline: 'none',
                  }}
                />
              </div>
            </div>
          );
        })()}
      </Modal>

    </div>
    </>
  );
};



const labelStyle: React.CSSProperties = {

  fontSize: 12, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 4,

};



// ── 项目名称下拉搜索器 ──

// ── 客户名称下拉搜索器 ──
export default SalesOpportunityList;

