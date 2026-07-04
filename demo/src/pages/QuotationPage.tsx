import React, { useState, useCallback, useMemo } from 'react';
import { Button, message, Modal, ConfigProvider, Divider } from 'antd';
import { PlusOutlined, DownloadOutlined, SaveOutlined, SendOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import ProjectHeader from '../components/ProjectHeader';
import GroupCard from '../components/GroupCard';
import SummarySection from '../components/SummarySection';
import { mockProject, mockComponentDB, mockOpportunities, mockQuotationSummaries, mockApprovalRequests } from '../mockData';
import type { Group, GroupItem, Project, QuotationSummary } from '../types';
import { calcProjectSummary, formatMoney } from '../utils/calculations';
import { notifyMockUpdate } from '../utils/mockStore';
import IconButton from '../components/IconButton';

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
  const [messageApi, contextHolder] = message.useMessage();
  const { id: quoteId } = useParams<{ id: string }>();
  const isLocked = useMemo(() => mockQuotationSummaries.some(q => q.id === quoteId && q.locked), [quoteId]);

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
    setProject(prev => ({
      ...prev,
      groups: prev.groups.map(g => {
        if (g.id !== groupId) return g;
        const items = g.items.filter(i => i.id !== itemId);
        return { ...g, items: items.map((i, idx) => ({ ...i, item_no: idx + 1 })) };
      }),
    }));
  }, []);

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
        const summary: QuotationSummary = {
          id: project.id,
          salesNo: project.sales_no,
          clientName: project.client_name,
          projectName: project.project_scope,
          versionNo: project.current_version.version_no,
          status: 'draft',
          amount: project.current_version.total_accounting_price,
          totalCost: 0,
          profitRate: 0,
          updatedAt: new Date().toISOString().slice(0, 10),
        };
        mockQuotationSummaries.push(summary);
        // 更新机会的 quotationId
        const opp = mockOpportunities.find(o => o.id === oppId);
        if (opp) opp.quotationId = project.id;
      }
    }
    notifyMockUpdate();
    messageApi.success('概算表已保存');
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
          ? `V${parseInt(m[1]) + 1}.0`
          : `V${m[1]}.${parseInt(m[2]) + 1}`)
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

  const handleExport = useCallback(() => {
    const summary = calcProjectSummary(project.groups, project.current_version, project.current_version.discounted_price);
    Modal.info({
      title: '报价表预览（不含成本信息）',
      width: 700,
      content: (
        <div>
          <p>客户：{project.client_name}</p>
          <p>报价编号：{project.sales_no} | 版本：{project.current_version.version_no}</p>
          <Divider />
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={thStyle}>序号</th>
                <th style={thStyle}>项目</th>
                <th style={thStyle}>数量</th>
                <th style={thStyle}>单价(未税)</th>
                <th style={thStyle}>总价(未税)</th>
              </tr>
            </thead>
            <tbody>
              {project.groups.map(g => {
                const groupTotal = g.items.reduce((s, i) => s + i.accounting_price, 0);
                return (
                  <React.Fragment key={g.id}>
                    <tr>
                      <td style={tdStyle}><strong>{g.group_no}</strong></td>
                      <td style={tdStyle}><strong>{g.name}</strong></td>
                      <td style={tdStyle}>1</td>
                      <td style={tdStyle}></td>
                      <td style={tdStyle}><strong>¥{formatMoney(groupTotal)}</strong></td>
                    </tr>
                    {g.items.filter(i => i.accounting_price > 0).map(i => (
                      <tr key={i.id}>
                        <td style={tdStyle}>{g.group_no}.{i.item_no}</td>
                        <td style={tdStyle}>{i.code || i.description}</td>
                        <td style={tdStyle}>{i.qty_total}</td>
                        <td style={tdStyle}>¥{formatMoney(i.accounting_price / (i.qty_total || 1))}</td>
                        <td style={tdStyle}>¥{formatMoney(i.accounting_price)}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          <Divider />
          <p>预期总价（未税）：¥{formatMoney(summary.total_accounting_price)}</p>
          <p>折扣后报价：¥{formatMoney(summary.discounted_price)}</p>
        </div>
      ),
      okText: '关闭',
      okButtonProps: { style: { background: '#00509e', borderColor: '#00509e', borderRadius: 4 } },
    });
  }, [project]);

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#00509e',
        },
      }}
    >
      {contextHolder}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#0d1b2a' }}>报价编制</span>
            <span style={{
              fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 4,
              background: project.current_version.review_status === 'approved' ? '#e8f5e9' :
                          project.current_version.review_status === 'pending' ? '#fff3e0' :
                          project.current_version.review_status === 'rejected' ? '#ffebee' : '#f5f5f5',
              color: project.current_version.review_status === 'approved' ? '#2e7d32' :
                     project.current_version.review_status === 'pending' ? '#e65100' :
                     project.current_version.review_status === 'rejected' ? '#c62828' : '#666',
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
                background: '#f0f0f0', color: '#8892a4',
              }}>🔒 已锁定</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: '#999' }}>Pre-Sales Calculation</div>
        </div>

        <ProjectHeader project={project} onUpdate={handleProjectUpdate} versionBump={versionBump} onVersionBumpChange={setVersionBump} readOnly={isLocked} />

        <div style={{
          marginBottom: 12, fontSize: 12, fontWeight: 600, color: '#3a4a6a', lineHeight: 1.8
        }}>
          <strong style={{ color: '#00509e' }}>说明：</strong>
          ① 所有价格默认不含税 &nbsp;② 直接成本=物料成本+人工成本+项目费用（物料=设备组/集成开发物料，人工=设计工时+装配工时+项目交付，项目费用=包装运输+差旅管理+其他）
          &nbsp;③ 毛利率=1−成本÷售价 &nbsp;④ 质保基数=标"✕"项次的预期售价之和×(1−折扣率)，标"✕"表示物料本身不含质保需项目集成时统筹
          &nbsp;⑤ 风险基数=直接成本=物料成本+人工成本+项目费用
          &nbsp;⑥ 编码不在数据库将显示红色<strong style={{color:'red'}}>!</strong>示警
          &nbsp;⑦ 实际成本与概算对比：分项 -5%~+10%、总成本 -2.5%~+5% 为正常，超出此范围标红，<strong style={{color:'#00509e'}}>目标不是做多也不是做少，而是越来越准</strong>
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

        <Button type="text" icon={<PlusOutlined />}
          onClick={handleAddGroup}
          style={{ width: '100%', height: 48, marginTop: 16 }} />

        <SummarySection
          groups={project.groups}
          version={project.current_version}
          onDiscountChange={handleDiscountChange}
          onVersionUpdate={handleProjectUpdate}
          readOnly={isLocked}
        />

        {/* 删除设备组弹窗 */}
        <Modal
          title={<span style={{ fontSize: 17, fontWeight: 600, color: '#0d1b2a', letterSpacing: 0.5 }}>确认删除此设备组？</span>}
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
                style={{ borderColor: '#c62828', color: '#c62828', borderRadius: 3, width: 36, height: 36 }} />
            </div>
          }
        >
          <div style={{ fontSize: 13, color: '#555' }}>删除后不可恢复</div>
        </Modal>

        <div style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
          marginTop: 16, padding: '12px 0', borderTop: '1px solid #e8e8e8'
        }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <IconButton icon={<SaveOutlined style={{ fontWeight: 700 }} />}
              onClick={handleSave} color="#d46b08" hoverBg="#fff7e6" title="保存" />
            <IconButton icon={<SendOutlined style={{ fontWeight: 700 }} />}
              onClick={handleSubmit} color="#00509e" hoverBg="#e6f0fa" title="提交" />
            <IconButton icon={<DownloadOutlined style={{ fontWeight: 700 }} />}
              onClick={handleExport} color="#1a6b3c" hoverBg="#e8f5e9" title="生成报价" />
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
};

const thStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid #e8e8e8', textAlign: 'left', fontWeight: 600,
};
const tdStyle: React.CSSProperties = {
  padding: '6px 12px', border: '1px solid #e8e8e8',
};

if (import.meta.hot) {
  import.meta.hot.decline();
}

export default QuotationPage;
