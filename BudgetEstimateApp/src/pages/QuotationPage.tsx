import React, { useState, useCallback, useMemo } from 'react';
import { Button, message, Modal, ConfigProvider } from 'antd';
import { PlusOutlined, DownloadOutlined, SaveOutlined, SendOutlined, CheckOutlined, CloseOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import ProjectHeader from '../components/ProjectHeader';
import GroupCard from '../components/GroupCard';
import SummarySection from '../components/SummarySection';
import { mockProject, mockComponentDB, mockOpportunities, mockQuotationSummaries, mockApprovalRequests, mockDeliveryProjects } from '../mockData';
import type { Group, GroupItem, Project, QuotationSummary } from '../types';
import { calcProjectSummary } from '../utils/calculations';
import { notifyMockUpdate } from '../utils/mockStore';
import IconButton from '../components/IconButton';
import { COLORS } from '../styles/constants';
import { exportHtmlTable } from '../utils/exportToExcel';


/** 生成销售编号：A{年份}-{月份}-{三位流水} */
function generateSalesNo(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const existingNos = mockQuotationSummaries.map(q => q.salesNo);
  let seq = 1;
  for (const no of existingNos) {
    const m = no.match(/^A\d{4}-(\d{2})-(\d{3})$/);
    if (m) seq = Math.max(seq, parseInt(m[2], 10) + 1);
  }
  return `A${year}-${month}-${String(seq).padStart(3, '0')}`;
}


/** 重新编号：所有设备组按顺序重排 group_no */
function renumberEquipGroups(groups: Group[]): Group[] {
  let no = 0;
  return groups.map(g => {
    if (g.group_type === 'EQUIPMENT') {
      no++;
      return { ...g, group_no: no };
    }
    return g;
  });
}

const initProject = (): Project => {
  const params = new URLSearchParams(window.location.search);
  const oppId = params.get('oppId');
  if (oppId) {
    const opp = mockOpportunities.find(o => o.id === oppId);
    if (opp) {
      const salesNo = generateSalesNo();
      return {
        id: 'proj-' + crypto.randomUUID().slice(0, 6),
        sales_no: salesNo,
        client_name: opp.clientName,
        client_code: '',
        project_scope: '2年质保',
        project_stage: opp.stage,
        expected_award_date: opp.expectedCloseDate,
        project_layout: '',
        delivery_period: '合同生效后5个月发货，货到现场后3个月安调完毕，具备试生产条件',
        payment_terms: '预付30% 发货60% 验收0% 质保10%',
        postfix: 'EC0',
        note: '',
        current_version: {
          id: 'v-' + crypto.randomUUID().slice(0, 6),
          version_no: 'V0.1',
          eur_rate: 8.15, tax_rate: 0.13, rounding_digits: 0,
          warranty_rate: 0.01, risk_rate: 0.03, commercial_cost: 0,
          total_direct_cost: 0, total_accounting_price: 0,
          discounted_price: 0, discount_rate: 0,
          rp1_profit_rate: 0, gp3_profit_rate: 0,
          review_status: 'draft',
        },
        groups: [
          { id: 'grp-eqp-' + crypto.randomUUID().slice(0, 6), group_no: 1, group_type: 'EQUIPMENT' as const, name: '设备组 #1', is_fixed: false, items: [] },
          ...mockProject.groups
            .filter(g => g.is_fixed)
            .map((g, i) => ({ ...g, id: g.id + '-' + crypto.randomUUID().slice(0, 6), items: g.items.map(i => ({ ...i })), group_no: i + 2 })),
        ],
      };
    }
  }
  return {
    ...mockProject,
    groups: mockProject.groups.map(g => ({ ...g, items: g.items.map(i => ({ ...i })) })),
  };
};

const QuotationPage: React.FC = () => {
  const [project, setProject] = useState<Project>(initProject);
  const [versionBump, setVersionBump] = useState<'minor' | 'major'>('minor');
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<{ groupId: string; itemId: string } | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const { id: quoteId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const invalidQuote = quoteId && !mockQuotationSummaries.some(q => q.id === quoteId);
  const isLocked = useMemo(() => {
    // 明确锁定
    if (mockQuotationSummaries.some(q => q.id === quoteId && q.locked)) return true;
    // 已转交付的报价（含所有版本）不可编辑
    return mockDeliveryProjects.some(p => p.quotationId && quoteId?.startsWith(p.quotationId));
  }, [quoteId]);

  const handleGroupChange = useCallback((groupId: string, items: GroupItem[]) => {
    setProject(prev => ({
      ...prev,
      groups: prev.groups.map(g => g.id === groupId ? { ...g, items } : g),
    }));
  }, []);

  const handleAddItem = useCallback((groupId: string) => {
    // 从物料数据库动态获取工费费率
    const designRate = mockComponentDB.find(c => c.tags?.includes('t10-1'))?.unit_cost ?? 174;
    const assemblyRate = mockComponentDB.find(c => c.tags?.includes('t10-2'))?.unit_cost ?? 70;
    setProject(prev => ({
      ...prev,
      groups: prev.groups.map(g => {
        if (g.id !== groupId) return g;
        const maxNo = g.items.reduce((max, item) => Math.max(max, item.item_no), 0);
        const newItem: GroupItem = {
          id: crypto.randomUUID(),
          item_no: maxNo + 1,
          item_type: 'COMPLETE_SET',
          component_id: '',
          code: '',
          description: '',
          qty_total: 1,
          unit: '套',
          sourcing_type: 'SELF_MANUFACTURED',
          unit_cost: 0,
          design_hours: 0,
          assembly_hours: 0,
          design_hour_rate: designRate,
          assembly_hour_rate: assemblyRate,
          direct_cost: 0,
          margin_rate: 0.35,
          basic_price: 0,
          accounting_price: 0,
          has_warranty: true,
          note: '',
        };
        return { ...g, items: [...g.items, newItem] };
      }),
    }));
  }, []);

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
        return { ...g, items: items.map((i, idx) => ({ ...i, item_no: idx + 1 })) };
      }),
    }));
    setDeleteItemId(null);
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
    setDeleteGroupId(null);
    messageApi.success('设备组已删除并重新编号');
  }, [deleteGroupId, messageApi]);

  const handleAddGroup = useCallback(() => {
    setProject(prev => {
      const equipGroups = prev.groups.filter(g => g.group_type === 'EQUIPMENT');
      const newNo = equipGroups.length + 1;
      const newId = crypto.randomUUID();
      const newGroup: Group = {
        id: newId,
        group_no: newNo,
        group_type: 'EQUIPMENT',
        name: `设备组 #${newNo}`,
        is_fixed: false,
        items: [],
      };
      const idx = prev.groups.findIndex(g => g.group_type === 'INTEGRATION');
      const groups = [...prev.groups];
      groups.splice(idx >= 0 ? idx : groups.length, 0, newGroup);
      return { ...prev, groups: renumberEquipGroups(groups) };
    });
    messageApi.success('已添加新设备组');
  }, [messageApi]);

  const handleDiscountChange = useCallback((value: number) => {
    setProject(prev => ({
      ...prev,
      current_version: { ...prev.current_version, discounted_price: value },
    }));
  }, []);

  const handleProjectUpdate = useCallback((field: string, value: string | number) => {
    setProject(prev => {
      if (field === 'eur_rate' || field === 'tax_rate' || field === 'warranty_rate' || field === 'risk_rate' || field === 'commercial_cost') {
        return { ...prev, current_version: { ...prev.current_version, [field]: value } };
      }
      return { ...prev, [field]: value };
    });
  }, []);

  const handleGroupNameChange = useCallback((groupId: string, name: string) => {
    setProject(prev => ({
      ...prev,
      groups: prev.groups.map(g => g.id === groupId ? { ...g, name } : g),
    }));
  }, []);

  const validateCodes = useCallback((): string[] => {
    const badCodes: string[] = [];
    for (const g of project.groups) {
      for (const item of g.items) {
        if (item.code && !mockComponentDB.some(c => c.code === item.code)) {
          badCodes.push(item.code);
        }
      }
    }
    return badCodes;
  }, [project]);

  const handleSave = useCallback(() => {
    if (isLocked) { messageApi.warning('此报价已锁定，无法修改'); return; }
    if (!project.client_name.trim()) { messageApi.warning('请输入客户名称'); return; }
    if (!project.project_scope.trim()) { messageApi.warning('请输入项目范围'); return; }
    const totalItems = project.groups.reduce((s, g) => s + g.items.length, 0);
    if (totalItems === 0) { messageApi.warning('请至少添加一个物料条目'); return; }
    const badCodes = validateCodes();
    if (badCodes.length > 0) {
      messageApi.warning('以下编码不在组件数据库中，请先注册再保存：' + badCodes.join(', '));
      return;
    }
    // 如果是新建报价，写入 mock 数据
    const params = new URLSearchParams(window.location.search);
    const oppId = params.get('oppId');
    if (oppId && project.groups.length > 0) {
      const existing = mockQuotationSummaries.find(q => q.id === project.id);
      if (!existing) {
        const calcSummary = calcProjectSummary(project.groups, project.current_version, project.current_version.discounted_price);
        const summary: QuotationSummary = {
          id: project.id,
          salesNo: project.sales_no,
          clientName: project.client_name,
          projectName: project.project_scope,
          versionNo: project.current_version.version_no,
          status: 'draft',
          amount: calcSummary.discounted_price || calcSummary.total_accounting_price,
          totalCost: calcSummary.total_cost,
          profitRate: Math.round(calcSummary.gp3 * 10000) / 100,
          updatedAt: new Date().toISOString().slice(0, 10),
        };
        mockQuotationSummaries.push(summary);
        // 更新机会的 quotationId
        const opp = mockOpportunities.find(o => o.id === oppId);
        if (opp) opp.quotationId = project.id;
      }
      notifyMockUpdate();
      messageApi.success('概算表已保存');
    } else {
      messageApi.warning('当前报价为临时编辑，请绑定销售机会后保存');
    }
  }, [validateCodes, messageApi, project, isLocked]);

  const handleSubmit = useCallback(() => {
    if (isLocked) { messageApi.warning('此报价已锁定，无法提交'); return; }
    const badCodes = validateCodes();
    if (badCodes.length > 0) {
      messageApi.warning('以下编码不在组件数据库中，请先注册再提交：' + badCodes.join(', '));
      return;
    }
    // 保存当前版本快照（所有历史版本在列表中独立显示）
    const historyEntry: QuotationSummary = {
      id: project.id + '-v' + project.current_version.version_no.replace('.', '-'),
      salesNo: project.sales_no,
      clientName: project.client_name,
      projectName: project.project_scope,
      versionNo: project.current_version.version_no,
      status: project.current_version.review_status === 'pending' ? 'pending' : 'draft',
      amount: project.current_version.total_accounting_price,
      totalCost: 0,
      profitRate: 0,
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    // 避免重复添加（如再次提交同一版本）
    const exists = mockQuotationSummaries.find(q => q.id === historyEntry.id);
    if (!exists) mockQuotationSummaries.push(historyEntry);

    setProject(prev => {
      const v = prev.current_version.version_no;
      const m = v.match(/^V(\d+)\.(\d+)$/);
      const newVer = m
        ? (versionBump === 'major'
          ? `V${parseInt(m[1], 10) + 1}.0`
          : `V${m[1]}.${parseInt(m[2], 10) + 1}`)
        : 'V1.1';

      // 创建/更新审批请求
      const existingReq = mockApprovalRequests.find(r => r.quotationId === prev.id);
      if (existingReq) {
        // 重新提交：重置为 pending，追加记录
        existingReq.status = 'pending';
        existingReq.records.push({
          id: 'rec-' + crypto.randomUUID().slice(0, 6),
          reviewer: '系统',
          action: 'resubmitted',
          comment: '已修改并重新提交（版本 ' + newVer + '）',
          createdAt: new Date().toISOString().slice(0, 10),
        });
      } else {
        mockApprovalRequests.push({
          id: 'apr-' + crypto.randomUUID().slice(0, 6),
          quotationId: prev.id,
          salesNo: prev.sales_no,
          clientName: prev.client_name,
          projectName: prev.project_scope,
          amount: prev.current_version.total_accounting_price,
          totalCost: 0,
          profitRate: 0,
          gp3: 0,
          submitter: '方案经理',
          submitTime: new Date().toISOString().slice(0, 10),
          status: 'pending',
          records: [],
        });
      }

      // 同时更新报价列表中该条目的状态
      mockQuotationSummaries.forEach(s => {
        if (s.id === prev.id || s.id.startsWith(prev.id + '-v')) { s.status = 'pending'; s.updatedAt = new Date().toISOString().slice(0, 10); }
      });

      return {
        ...prev,
        current_version: {
          ...prev.current_version,
          version_no: newVer,
          review_status: 'pending',
        }
      };
    });
    setVersionBump('minor');
    notifyMockUpdate();
    messageApi.success('已提交审核，版本已更新为待审批状态');
  }, [validateCodes, messageApi, versionBump, project, isLocked]);

  const summary = useMemo(() =>
    calcProjectSummary(project.groups, project.current_version, project.current_version.discounted_price),
    [project]
  );

  const handleExport = useCallback(() => {
    if (project.current_version.review_status !== 'approved') {
      messageApi.warning('报价需审批通过后方可导出');
      return;
    }
    let groupsHtml = '';
    for (let gi = 0; gi < project.groups.length; gi++) {
      const g = project.groups[gi];
      let groupTotal = 0;
      for (let ii = 0; ii < g.items.length; ii++) {
        groupTotal += g.items[ii].accounting_price;
      }
      groupsHtml += '<tr style="font-weight:700;background:#f5f7fa">' +
        '<td style="text-align:center">' + g.group_no + '</td>' +
        '<td>' + g.name + '</td>' +
        '<td style="text-align:center">1</td>' +
        '<td class="amount"></td>' +
        '<td class="amount">¥' + Math.round(groupTotal).toLocaleString() + '</td></tr>';
      for (let ii = 0; ii < g.items.length; ii++) {
        const item = g.items[ii];
        if (item.accounting_price <= 0) continue;
        groupsHtml += '<tr><td style="text-align:center">' + g.group_no + '.' + item.item_no + '</td>' +
          '<td>' + (item.code || item.description || '—') + '</td>' +
          '<td style="text-align:center">' + item.qty_total + '</td>' +
          '<td class="amount">¥' + Math.round(item.accounting_price / (item.qty_total || 1)).toLocaleString() + '</td>' +
          '<td class="amount">¥' + Math.round(item.accounting_price).toLocaleString() + '</td></tr>';
      }
    }

    let html = '<h2 style="text-align:center;margin-bottom:16px">报价表</h2>';
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">';
    html += '<tr><td style="border:none;padding:2px 8px;font-size:12px"><b>客户：</b>' + project.client_name + '</td>';
    html += '<td style="border:none;padding:2px 8px;font-size:12px"><b>报价编号：</b>' + project.sales_no + '</td></tr>';
    html += '<tr><td style="border:none;padding:2px 8px;font-size:12px"><b>版本：</b>' + project.current_version.version_no + '</td>';
    html += '<td style="border:none;padding:2px 8px;font-size:12px"><b>日期：</b>' + new Date().toISOString().slice(0, 10) + '</td></tr></table>';
    html += '<table style="width:100%;border-collapse:collapse"><thead><tr><th style="width:44px">序号</th><th>项目</th><th style="width:52px">数量</th><th style="width:120px">单价(未税)</th><th style="width:130px">总价(未税)</th></tr></thead><tbody>' + groupsHtml + '</tbody></table>';
    html += '<table style="width:100%;border-collapse:collapse;margin-top:12px">';
    html += '<tr><td style="border:none;text-align:right;padding:4px 10px;font-size:13px"><b>预期总价（未税）：</b>¥' + Math.round(summary.total_accounting_price).toLocaleString() + '</td></tr>';
    html += '<tr><td style="border:none;text-align:right;padding:4px 10px;font-size:13px"><b>折后报价（未税）：</b>¥' + Math.round(summary.discounted_price).toLocaleString() + '</td></tr></table>';
    html += '<p style="font-size:11px;color:#999;margin-top:16px">所有价格为不含税价格</p>';

    exportHtmlTable('报价表_' + project.client_name + '_' + project.sales_no, html);
  }, [project, summary]);

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
              background: project.current_version.review_status === 'approved' ? '#e8f5e9' :
                          project.current_version.review_status === 'pending' ? '#fff3e0' :
                          project.current_version.review_status === 'rejected' ? '#ffebee' : COLORS.bgTag,
              color: project.current_version.review_status === 'approved' ? COLORS.success :
                     project.current_version.review_status === 'pending' ? COLORS.warning :
                     project.current_version.review_status === 'rejected' ? COLORS.danger : COLORS.textSecondary,
            }}>
              {{
                draft: '草稿',
                pending: '待审批',
                approved: '已通过',
                rejected: '已驳回',
              }[project.current_version.review_status]}
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

        <ProjectHeader project={project} onUpdate={handleProjectUpdate} versionBump={versionBump} onVersionBumpChange={setVersionBump} readOnly={isLocked} />

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
              onDeleteGroup={group.group_type === 'EQUIPMENT' ? handleDeleteGroup : undefined}
              onGroupNameChange={group.group_type === 'EQUIPMENT' ? handleGroupNameChange : undefined}
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
          version={project.current_version}
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
              onClick={handleSave} color={COLORS.amber} hoverBg="#fff7e6" title="保存" />
            <IconButton icon={<SendOutlined style={{ fontWeight: 700 }} />}
              onClick={handleSubmit} color={COLORS.primary} hoverBg="#e6f0fa" title="提交" />
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
