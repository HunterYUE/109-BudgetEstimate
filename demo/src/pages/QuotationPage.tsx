import React, { useState, useCallback } from 'react';
import { Layout, Button, message, Modal, ConfigProvider, Divider } from 'antd';
import { PlusOutlined, DownloadOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons';
import ProjectHeader from '../components/ProjectHeader';
import GroupCard from '../components/GroupCard';
import SummarySection from '../components/SummarySection';
import { mockProject, mockComponentDB } from '../mockData';
import type { Group, GroupItem } from '../types';
import { calcProjectSummary, formatMoney } from '../utils/calculations';

const { Content } = Layout;

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

const QuotationPage: React.FC = () => {
  const [project, setProject] = useState<Project>(() => ({
    ...mockProject,
    groups: mockProject.groups.map(g => ({ ...g, items: g.items.map(i => ({ ...i })) })),
  }));
  const [messageApi, contextHolder] = message.useMessage();

  const handleGroupChange = useCallback((groupId: string, items: GroupItem[]) => {
    setProject(prev => ({
      ...prev,
      groups: prev.groups.map(g => g.id === groupId ? { ...g, items } : g),
    }));
  }, []);

  const handleAddItem = useCallback((groupId: string) => {
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
          design_hour_rate: 174,
          assembly_hour_rate: 70,
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
    Modal.confirm({
      title: '确认删除此设备组？',
      content: '删除后不可恢复',
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        setProject(prev => {
          const groups = renumberEquipGroups(prev.groups.filter(g => g.id !== groupId));
          return { ...prev, groups };
        });
        messageApi.success('设备组已删除并重新编号');
      },
    });
  }, [messageApi]);

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

  const handleProjectUpdate = useCallback((field: string, value: any) => {
    setProject(prev => {
      if (field === 'eur_rate' || field === 'tax_rate' || field === 'warranty_rate' || field === 'risk_rate') {
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
    const badCodes = validateCodes();
    if (badCodes.length > 0) {
      messageApi.warning('以下编码不在组件数据库中，请先注册再保存：' + badCodes.join(', '));
      return;
    }
    messageApi.success('概算表已保存');
  }, [validateCodes, messageApi]);

  const handleSubmit = useCallback(() => {
    const badCodes = validateCodes();
    if (badCodes.length > 0) {
      messageApi.warning('以下编码不在组件数据库中，请先注册再提交：' + badCodes.join(', '));
      return;
    }
    setProject(prev => {
      const v = prev.current_version.version_no;
      const m = v.match(/^V(\d+)\.(\d+)$/);
      const newVer = m ? `V${m[1]}.${parseInt(m[2]) + 1}` : 'V1.1';
      return {
        ...prev,
        current_version: {
          ...prev.current_version,
          version_no: newVer,
          review_status: 'pending',
        }
      };
    });
    messageApi.success('已提交审核，版本已更新为待审批状态');
  }, [validateCodes, messageApi]);

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
          </div>
          <div style={{ fontSize: 13, color: '#999' }}>Pre-Sales Calculation</div>
        </div>

        <ProjectHeader project={project} onUpdate={handleProjectUpdate} />

        <div style={{
          marginBottom: 12, fontSize: 12, fontWeight: 600, color: '#3a4a6a', lineHeight: 1.8
        }}>
          <strong style={{ color: '#00509e' }}>说明：</strong>
          ① 所有价格默认不含税 &nbsp;② 直接成本=物料成本+人工成本+项目费用（物料=设备组/集成开发物料，人工=设计工时+装配工时+项目交付，项目费用=包装运输+差旅管理+其他）
          &nbsp;③ 毛利率=1−成本÷售价 &nbsp;④ 质保基数=仅勾选"质保"项的成本合计
          &nbsp;⑤ 编码不在数据库将显示红色<strong style={{color:'red'}}>!</strong>示警
          &nbsp;⑥ 实际成本与概算对比：分项 -5%~+10%、总成本 -2.5%~+5% 为正常，超出此范围标红，<strong style={{color:'#00509e'}}>目标不是做多也不是做少，而是越来越准</strong>
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
        />

        <div style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
          marginTop: 16, padding: '12px 0', borderTop: '1px solid #e8e8e8'
        }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <div onClick={handleSave}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#d46b08', fontSize: 22, cursor: 'pointer', userSelect: 'none',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#fff7e6'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              title="保存">
              <SaveOutlined style={{ fontWeight: 700 }} />
            </div>
            <div onClick={handleSubmit}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#00509e', fontSize: 22, cursor: 'pointer', userSelect: 'none',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#e6f0fa'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              title="提交">
              <SendOutlined style={{ fontWeight: 700 }} />
            </div>
            <div onClick={handleExport}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#1a6b3c', fontSize: 22, cursor: 'pointer', userSelect: 'none',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#e8f5e9'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              title="生成报价">
              <DownloadOutlined style={{ fontWeight: 700 }} />
            </div>
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
