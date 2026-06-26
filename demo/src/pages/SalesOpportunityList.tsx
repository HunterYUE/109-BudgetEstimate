import React, { useState, useMemo, useCallback } from 'react';

import { useNavigate } from 'react-router-dom';

import { Button, Table, Tag, Input, Select, Modal, message, Dropdown } from 'antd';

import { PlusOutlined, FileTextOutlined, EditOutlined, FileAddOutlined, CheckCircleOutlined, CloseCircleOutlined, PauseCircleOutlined, PlayCircleOutlined, DeleteOutlined, ArrowRightOutlined } from '@ant-design/icons';

import { mockOpportunities, mockDeliveryProjects } from '../mockData';
import type { SalesOpportunity, DeliveryProject } from '../types';
import { REASON_TAXONOMY, formatReasons } from '../reasonTaxonomy';



const STAGE_OPTIONS = ['信息', '线索', '机会', '投标', '议价', '中标'];

const stageColors: Record<string, string> = {

  信息: '#999', 线索: '#00509e', 机会: '#5a2d82',

  投标: '#e65100', 议价: '#c76a00', 中标: '#1a6b3c',

};

const statusColors: Record<string, string> = {

  过程中: '#00509e', 赢: '#1a6b3c', 输: '#c62828', 冻结: '#999',

};



// Module-level analysis data store (shared with SalesAnalysis page)



const SalesOpportunityList: React.FC = () => {

  const navigate = useNavigate();

  const [msg, ctx] = message.useMessage();

  const [opportunities, setOpportunities] = useState<SalesOpportunity[]>(() =>

    mockOpportunities.map(o => ({ ...o }))

  );

  const [tabFilter, setTabFilter] = useState<'info' | 'lead' | 'opp'>('opp');



  // Edit modal state

  const [modalOpen, setModalOpen] = useState(false);

  const [editing, setEditing] = useState<SalesOpportunity | null>(null);

  const [formData, setFormData] = useState<Partial<SalesOpportunity>>({});


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

  // Analysis data (Phase 7)



  const now = () => new Date().toISOString().slice(0, 10);

  const touch = (id: string, updates: Partial<SalesOpportunity>) => {

    setOpportunities(prev => prev.map(o => o.id === id ? { ...o, ...updates, updatedAt: now() } : o));

  };



  const filtered = useMemo(() => {

    return opportunities.filter(o => {

      if (tabFilter === 'info' && o.stage !== '信息') return false;

      if (tabFilter === 'lead' && o.stage !== '线索') return false;

      if (tabFilter === 'opp' && (o.stage === '信息' || o.stage === '线索' || o.stage === '机会')) return false;

      return true;

    });

  }, [opportunities, tabFilter]);



  const handleStageClick = useCallback((opp: SalesOpportunity) => {

    const idx = STAGE_OPTIONS.indexOf(opp.stage);

    const nextStage = STAGE_OPTIONS[(idx + 1) % STAGE_OPTIONS.length];

    const updates: Partial<SalesOpportunity> = { stage: nextStage };

    if (nextStage === '中标') {

      updates.status = '赢';

      updates.winRate = 100;

    }

    setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, ...updates, updatedAt: now() } : o));

  }, []);



  const openReasonModal = (opp: SalesOpportunity, action: 'win' | 'loss' | 'freeze') => {
    const cfg = REASON_TAXONOMY[action];
    const defaultGroup = cfg.groups[0]?.groupLabel || '';
    const competitors = (opp.competitor || '').split(/[、，]/).map(s => s.trim()).filter(Boolean);
    const winner = competitors.length === 1 ? competitors[0] : '';
    setReasonModal({ open: true, opp, action, selectedGroup: defaultGroup, selections: {}, winner });
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
      updatedAt: new Date().toISOString().slice(0, 10),
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

  const handleStatusAction = (opp: SalesOpportunity, action: 'win' | 'loss' | 'freeze') => {
    if (action === 'freeze' && opp.status === '冻结') {
      setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, status: '过程中', reasons: '', updatedAt: new Date().toISOString().slice(0, 10) } : o));
      msg.success('已恢复为过程中');
      return;
    }
    openReasonModal(opp, action);
  };



  const handleWinDeliver = useCallback((opp: SalesOpportunity) => {

    Modal.confirm({

      title: '转交付',

      content: `将"${opp.projectName}"转为交付项目？该项目从清单删除，信息转入交付管理和销售分析。`,

      okText: '确认转交付',

      cancelText: '取消',

      onOk: () => {

        const d = now();

        const delId = 'del-' + crypto.randomUUID().slice(0, 6);

        const newDel: DeliveryProject = {

          id: delId, opportunityId: opp.id,

          salesNo: opp.salesNo, clientName: opp.clientName, projectName: opp.projectName,

          contractAmount: opp.amount, quotationId: opp.quotationId || '',

          status: '进行中', nodes: [],

          planStatus: 'draft', costStatus: 'draft',

          createdAt: d, updatedAt: d,

        };

        mockDeliveryProjects.push(newDel);


        setOpportunities(prev => prev.filter(o => o.id !== opp.id));

        msg.success('已转交付，信息已移交分析模块');

        navigate('/delivery');

      },

    });

  }, [msg, navigate]);



  const handleLossDelete = useCallback((opp: SalesOpportunity) => {

    Modal.confirm({

      title: '删除机会',

      content: `将"${opp.projectName}"从清单删除，信息转入销售分析模块。`,

      okText: '确认删除',

      okType: 'danger',

      cancelText: '取消',

      onOk: () => {


        setOpportunities(prev => prev.filter(o => o.id !== opp.id));

        msg.success('已删除，信息已移交分析模块');

      },

    });

  }, [msg]);



  const handleFreezeAnalyze = useCallback((opp: SalesOpportunity) => {


    msg.success('项目信息已移交分析模块');

  }, [msg]);



  const handlePromote = useCallback((opp: SalesOpportunity, targetStage: string) => {

    let reason = '';

    const label = targetStage === '线索' ? '转线索' : '转机会';

    Modal.confirm({

      title: label,

      content: (

        <div>

          <div style={{ marginBottom: 8, fontSize: 13, color: '#333' }}>请填写原因（如竞争分析结果）：</div>

          <textarea rows={3} placeholder={'输入' + label + '原因…'}

            onChange={e => { reason = e.target.value; }}

            style={{ width: '100%', border: '1px solid #d9d9d9', borderRadius: 4, padding: 6, fontSize: 13 }}

          />

        </div>

      ),

      okText: '提交总监审批',

      cancelText: '取消',

      onOk: () => {

        if (!reason.trim()) { msg.warning('请填写原因'); return Promise.reject(); }

        touch(opp.id, { stage: targetStage });

        msg.success('已提交审批，通过后自动转入' + targetStage);

      },

    });

  }, [msg]);



  const handleAbandon = useCallback((opp: SalesOpportunity) => {

    let reason = '';

    Modal.confirm({

      title: '放弃项目',

      content: (

        <div>

          <div style={{ marginBottom: 8, fontSize: 13, color: '#333' }}>请填写放弃原因：</div>

          <textarea rows={3} placeholder="输入放弃原因…"

            onChange={e => { reason = e.target.value; }}

            style={{ width: '100%', border: '1px solid #d9d9d9', borderRadius: 4, padding: 6, fontSize: 13 }}

          />

        </div>

      ),

      okText: '确认放弃',

      okType: 'danger',

      cancelText: '取消',

      onOk: () => {

        if (!reason.trim()) { msg.warning('请填写放弃原因'); return Promise.reject(); }


        setOpportunities(prev => prev.filter(o => o.id !== opp.id));

        msg.success('已放弃，信息已移交分析模块');

      },

    });

  }, [msg]);



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

    if (editing) {

      setOpportunities(prev => prev.map(o => o.id === editing.id ? { ...o, ...formData, updatedAt: new Date().toISOString().slice(0, 10) } as SalesOpportunity : o));

      msg.success('机会已更新');

    } else {

      const newOpp: SalesOpportunity = {

        id: 'opp-' + crypto.randomUUID().slice(0, 6),

        salesNo: (() => {

          const now = new Date();

          const y = now.getFullYear();

          const m = String(now.getMonth() + 1).padStart(2, '0');

          const count = opportunities.filter(o => o.salesNo.startsWith('A' + y + '-' + m)).length;

          return 'A' + y + '-' + m + '-' + String(count + 1).padStart(3, '0');

        })(),

        ...formData as any,

        createdAt: new Date().toISOString().slice(0, 10),

        updatedAt: new Date().toISOString().slice(0, 10),

      };

      setOpportunities(prev => [...prev, newOpp]);

      msg.success('机会已创建');

    }

    setModalOpen(false);

  }, [editing, formData, opportunities, msg]);







  const columns = [
    { title: '序号', key: 'index', width: 20, align: 'center' as const,
      render: (_: any, __: any, i: number) => <span style={{ color: '#999' }}>{i + 1}</span> },
    { title: '客户名称', dataIndex: 'clientName', width: 100,
      render: (v: string, rec: SalesOpportunity) => (
        <input type="text" value={v || ''}
          onChange={e => { const v = e.target.value.slice(0, 12); touch(rec.id, { clientName: v }) }}
          style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#333' }}
        />
      )},
    { title: '销售编号', dataIndex: 'salesNo', width: 80 },
    { title: '项目名称', dataIndex: 'projectName', width: 200,
      render: (v: string, rec: SalesOpportunity) => (
        <input type="text" value={v || ''}
          onChange={e => touch(rec.id, { projectName: e.target.value })}
          style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#333' }}
        />
      )},
    { title: '说明', dataIndex: 'notes', width: 315,
      render: (v: string, rec: SalesOpportunity) => (
        <input type="text" value={v || ''}
          onChange={e => touch(rec.id, { notes: e.target.value })}
          placeholder="—"
          style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#888' }}
        />
      )},
    { title: '金额', dataIndex: 'amount', width: 90, align: 'right' as const,
      render: (v: number, rec: SalesOpportunity) => (
        <span style={{ cursor: 'pointer', color: '#00509e', fontWeight: 600, fontSize: 13 }}
          onClick={() => {
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
          { text: '投标', value: '投标' },
          { text: '议价', value: '议价' },
          { text: '中标', value: '中标' },
        ],
        onFilter: (value: any, record: SalesOpportunity) => record.stage === value,
        render: (v: string, rec: SalesOpportunity) => (
          <Tag color={stageColors[v] || '#999'} style={{ cursor: 'pointer', margin: 0 }}
            onClick={() => handleStageClick(rec)}>{v}</Tag>
        )}]
      : []),
    { title: '赢率', dataIndex: 'winRate', width: 30, align: 'center' as const,
      render: (v: number, rec: SalesOpportunity) => (
        <span style={{ cursor: 'pointer', color: '#00509e', fontWeight: 600 }}
          onClick={() => { const next = v >= 100 ? 0 : Math.min(v + 10, 100); touch(rec.id, { winRate: next }); }}>{v}%</span>
      )},
    { title: '竞争对手', dataIndex: 'competitor', width: 145,
      render: (v: string, rec: SalesOpportunity) => {
        const hasInvalidSep = v && /[^一-龥a-zA-Z0-9、， ]/.test(v);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <input type="text" value={v || ''}
              onChange={e => touch(rec.id, { competitor: e.target.value })}
              placeholder="—"
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#333' }}
            />
            {hasInvalidSep && <span style={{ color: '#c62828', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>!</span>}
          </div>
        );
      }},
    { title: '状态', dataIndex: 'status', width: 40, align: 'center' as const,
      filters: [
        { text: '过程中', value: '过程中' },
        { text: '赢', value: '赢' },
        { text: '输', value: '输' },
        { text: '冻结', value: '冻结' },
      ],
      onFilter: (value: any, record: SalesOpportunity) => record.status === value,
      render: (v: string, rec: SalesOpportunity) => {
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
        let actions = STATUS_ACTIONS[v] || [];
        const isEarlyStage = (rec.stage === '信息' || rec.stage === '线索') && v === '过程中';
        if (actions.length === 0) {
          return <Tag color={statusColors[v] || '#999'} style={{ margin: 0, fontSize: 12 }}>{v}</Tag>;
        }
        return (
          <Dropdown menu={{
            items: actions.map(a => ({
              key: a.action,
              disabled: a.action === 'win' && isEarlyStage,
              label: <div style={{ fontSize: 16, color: a.action === 'win' && isEarlyStage ? '#ccc' : statusColors[a.action === 'freeze' && v === '冻结' ? '过程中' : a.action === 'win' ? '赢' : a.action === 'loss' ? '输' : '过程中'] || '#999', textAlign: 'center', padding: '2px 4px' }}>{a.icon}</div>,
              onClick: a.action === 'win' && isEarlyStage ? undefined
                : () => a.action === 'win' ? handleStatusAction(rec, 'win')
                : a.action === 'loss' ? handleStatusAction(rec, 'loss')
                : handleStatusAction(rec, 'freeze'),
            })),
                    }} trigger={['click']}>
            <Tag color={statusColors[v] || '#999'}
              style={{ cursor: 'pointer', margin: 0, fontSize: 12 }}>
              {v} <span style={{ fontSize: 10, marginLeft: 2 }}>▼</span>
            </Tag>
          </Dropdown>
        );
        }
      },
    { title: '区域销售', dataIndex: 'salesman', width: 40,
      filters: Array.from(new Set(opportunities.map(o => o.salesman).filter(Boolean))).map(s => ({ text: s, value: s })),
      onFilter: (value: any, record: SalesOpportunity) => record.salesman === value,
      render: (v: string, rec: SalesOpportunity) => (
        <input type="text" value={v || ''}
          onChange={e => touch(rec.id, { salesman: e.target.value })}
          style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#333' }}
        />
      )},
    { title: '预计定标', dataIndex: 'expectedCloseDate', width: 75,
      filters: Array.from(new Set(opportunities.map(o => o.expectedCloseDate).filter(Boolean))).sort().map(s => ({ text: s, value: s })),
      onFilter: (value: any, record: SalesOpportunity) => record.expectedCloseDate === value,
      render: (v: string, rec: SalesOpportunity) => (
        <input type="text" value={v || ''}
          onChange={e => touch(rec.id, { expectedCloseDate: e.target.value })}
          placeholder="yyyy-mm-dd"
          style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#333' }}
        />
      )},
    { title: '报价', dataIndex: 'quotationId', width: 50, align: 'center' as const,
      render: (v: string | undefined, rec: SalesOpportunity) => (
        <Button type="link" size="small"
          icon={v ? <EditOutlined /> : <FileAddOutlined />}
          onClick={() => navigate('/quotations/' + (v || 'new'))}
          style={{ fontSize: 14 }}
        />
      )},
    { title: '操作', key: 'action', width: 75, align: 'center' as const,
      render: (_: any, rec: SalesOpportunity) => {
        if (tabFilter === 'info') return (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button type="text" size="small" icon={<ArrowRightOutlined />}
              onClick={() => handlePromote(rec, '线索')}
              style={{ color: '#00509e', fontSize: 16 }} title="转线索" />
            <Button type="text" size="small" icon={<DeleteOutlined />}
              onClick={() => handleAbandon(rec)}
              style={{ color: '#c62828', fontSize: 16 }} title="放弃" />
          </div>
        );
        if (tabFilter === 'lead') return (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button type="text" size="small" icon={<ArrowRightOutlined />}
              onClick={() => handlePromote(rec, '机会')}
              style={{ color: '#5a2d82', fontSize: 16 }} title="转机会" />
            <Button type="text" size="small" icon={<DeleteOutlined />}
              onClick={() => handleAbandon(rec)}
              style={{ color: '#c62828', fontSize: 16 }} title="放弃" />
          </div>
        );
        return (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
            {rec.status === '赢' && (
              <Button type="text" size="small" icon={<ArrowRightOutlined />}
                onClick={() => handleWinDeliver(rec)}
                style={{ color: '#1a6b3c', fontSize: 16 }} title="转交付" />
            )}
            {rec.status === '输' && (
              <Button type="text" size="small" icon={<DeleteOutlined />}
                onClick={() => handleLossDelete(rec)}
                style={{ color: '#c62828', fontSize: 16 }} title="删除" />
            )}
            {rec.status === '冻结' && (
              <Button type="text" size="small" icon={<ArrowRightOutlined />}
                onClick={() => handleFreezeAnalyze(rec)}
                style={{ color: '#fa8c16', fontSize: 16 }} title="分析" />
            )}
          </div>
        );
      },
    },
    { title: '操作日期', dataIndex: 'updatedAt', width: 100,
      render: (v: string) => <span style={{ fontSize: 13, color: '#999' }}>{v || '—'}</span> },
  ];



  return (
    <>
      <div>

      {ctx}

      <div style={{ fontSize: 17, fontWeight: 700, color: '#0d1b2a', marginBottom: 4 }}>销售管理</div>



      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1.5px solid #eee' }}>

        <div onClick={() => setTabFilter('info')}

          style={{

            padding: '8px 20px', cursor: 'pointer', fontSize: 14,

            borderBottom: tabFilter === 'info' ? '2px solid #00509e' : '2px solid transparent',

            color: tabFilter === 'info' ? '#00509e' : '#666', fontWeight: tabFilter === 'info' ? 600 : 400,

            marginBottom: -2, transition: 'all 0.15s',

          }}>销售信息

        </div>

        <div onClick={() => setTabFilter('lead')}

          style={{

            padding: '8px 20px', cursor: 'pointer', fontSize: 14,

            borderBottom: tabFilter === 'lead' ? '2px solid #5a2d82' : '2px solid transparent',

            color: tabFilter === 'lead' ? '#5a2d82' : '#666', fontWeight: tabFilter === 'lead' ? 600 : 400,

            marginBottom: -2, transition: 'all 0.15s',

          }}>销售线索

        </div>

        <div onClick={() => setTabFilter('opp')}

          style={{

            padding: '8px 20px', cursor: 'pointer', fontSize: 14,

            borderBottom: tabFilter === 'opp' ? '2px solid #1a6b3c' : '2px solid transparent',

            color: tabFilter === 'opp' ? '#1a6b3c' : '#666', fontWeight: tabFilter === 'opp' ? 600 : 400,

            marginBottom: -2, transition: 'all 0.15s',

          }}>销售机会

        </div>

      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Button type="default" icon={<PlusOutlined />}
          onClick={() => openCreateModal(tabFilter === 'info' ? '信息' : tabFilter === 'lead' ? '线索' : '投标')}
          style={{ color: '#00509e', borderColor: '#00509e' }} />
      </div>



      <Table

        dataSource={filtered}

        columns={columns}

        rowKey="id"

        pagination={false}

        size="small"

        bordered

        style={{ background: '#fff', borderRadius: 6 }}

      />

      <div style={{
        display: 'flex', gap: 24, marginTop: 12, padding: '10px 16px',
        background: '#fafafa', borderRadius: 4, border: '1px solid #e8e8e8',
        fontSize: 13,
      }}>

        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: '#ccc' }}>
          {filtered.length} 个项目
        </div>
      </div>

      {/* 新建/编辑 Modal */}

      <Modal

        title={editing ? '编辑销售机会' : '新建销售机会'}

        open={modalOpen}

        onOk={handleModalOk}

        onCancel={() => setModalOpen(false)}

        okText={editing ? '保存' : '创建'}

        cancelText="取消"

        width={520}

      >

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          <div style={{ display: 'flex', gap: 12 }}>

            <div style={{ flex: 1 }}>

              <div style={labelStyle}>客户名称 *</div>

              <Input value={formData.clientName} onChange={e => setFormData(p => ({ ...p, clientName: e.target.value }))} />

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

      {/* 原因选择弹窗 */}
      <Modal
        title={<span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e' }}>{reasonModal.action === 'loss' ? '输单原因' : reasonModal.action === 'win' ? '赢单原因' : '冻结原因'}</span>}
        open={reasonModal.open}
        onOk={handleReasonOk}
        onCancel={() => setReasonModal(p => ({ ...p, open: false }))}
        okText={<span style={{ fontSize: 13 }}>确认</span>}
        cancelText={<span style={{ fontSize: 13 }}>取消</span>}
        width={420}
        okButtonProps={{ style: { background: '#00509e', borderColor: '#00509e', height: 32, borderRadius: 6 } }}
        cancelButtonProps={{ style: { height: 32, borderRadius: 6 } }}
      >
        {reasonModal.action && reasonModal.opp && (() => {
          const cfg = REASON_TAXONOMY[reasonModal.action];
          const groups = cfg.groups;
          return (
            <div>
              {/* 大类切换标签（下划线样式） */}
              {groups.length > 1 && (
                <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderBottom: '1.5px solid #eee' }}>
                  {groups.map(g => (
                    <span key={g.groupLabel}
                      onClick={() => setReasonModal(p => ({ ...p, selectedGroup: g.groupLabel, selections: {} }))}
                      style={{
                        padding: '6px 18px', fontSize: 13, cursor: 'pointer',
                        borderBottom: reasonModal.selectedGroup === g.groupLabel ? '2px solid #00509e' : '2px solid transparent',
                        color: reasonModal.selectedGroup === g.groupLabel ? '#00509e' : '#666',
                        fontWeight: reasonModal.selectedGroup === g.groupLabel ? 600 : 400,
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
                          background: '#fafafa', color: '#00509e', cursor: 'pointer',
                          minWidth: 100, userSelect: 'none', position: 'relative',
                        }}
                      >
                        {current}
                        <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#00509e' }}>▼</span>
                      </div>
                      {reasonModal.dropdownOpen && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                          background: '#fafafa', marginTop: 2, borderRadius: 4,
                          overflow: 'hidden',
                        }}>
                          {competitors.map(c => (
                            <div key={c}
                              onClick={() => { setReasonModal(p => ({ ...p, winner: c, dropdownOpen: false })); }}
                              style={{
                                padding: '4px 8px', fontSize: 13, color: current === c ? '#00509e' : '#555',
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
                            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 10px', borderRadius: 5, marginBottom: 2, background: checked ? '#eef4ff' : '#f8f8f8', border: '1px solid ' + (checked ? '#00509e' : '#e8e8e8') }}
                          >
                            <span style={{ width: 15, height: 15, borderRadius: 3, border: '1.5px solid ' + (checked ? '#00509e' : '#ccc'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: checked ? '#fff' : 'transparent', background: checked ? '#00509e' : 'transparent', fontWeight: 700, flexShrink: 0 }}>
                              {checked ? '✓' : ''}
                            </span>
                            <span style={{ fontSize: 13, color: checked ? '#00509e' : '#444' }}>{item.label}</span>
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
                                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 10px', borderRadius: 5, background: dc ? '#eef4ff' : '#f8f8f8', border: '1px solid ' + (dc ? '#00509e' : '#e8e8e8') }}
                                >
                                  <span style={{ width: 15, height: 15, borderRadius: 3, border: '1.5px solid ' + (dc ? '#00509e' : '#ccc'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: dc ? '#fff' : 'transparent', background: dc ? '#00509e' : 'transparent', fontWeight: 700, flexShrink: 0 }}>
                                    {dc ? '✓' : ''}
                                  </span>
                                  <span style={{ fontSize: 13, color: dc ? '#00509e' : '#444' }}>{subItem.label}</span>
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

  fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 4,

};



export default SalesOpportunityList;

