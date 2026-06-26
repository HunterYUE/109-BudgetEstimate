import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tag, Card, Button, message, Modal, ConfigProvider } from 'antd';
import { ScheduleOutlined, AuditOutlined, CheckCircleOutlined, CloseCircleOutlined, SendOutlined, SaveOutlined, LockOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { mockDeliveryProjects, mockProject } from '../mockData';
import { formatMoney } from '../utils/calculations';
import DeliveryNodeTimeline from '../components/DeliveryNodeTimeline';
import ItemCostTable from '../components/ItemCostTable';
import type { DeliveryProject, DeliveryNode, Group } from '../types';

const STATUS_CYCLE: DeliveryNode['status'][] = ['pending', 'in_progress', 'completed', 'delayed'];
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: '#666' },
  pending: { label: '待审批', color: '#e65100' },
  approved: { label: '已通过', color: '#2e7d32' },
  rejected: { label: '已驳回', color: '#c62828' },
};

const DeliveryDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [msg, ctx] = message.useMessage();
  const [tab, setTab] = useState<'plan' | 'cost'>('plan');

  const [project, setProject] = useState<DeliveryProject | null>(() => {
    const p = mockDeliveryProjects.find(d => d.id === id);
    if (!p) return null;
    return {
      ...p,
      nodes: p.nodes.map(n => ({ ...n, history: n.history.map(h => ({ ...h })) })),
      planApproval: p.planApproval ? { ...p.planApproval } : undefined,
      costApproval: p.costApproval ? { ...p.costApproval } : undefined,
    };
  });

  const [actualCosts, setActualCosts] = useState<Record<string, number>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const quotationGroups: Group[] = (() => {
    if (!project) return [];
    if (project.quotationId === 'proj-003' || project.quotationId === 'proj-001' || project.quotationId === 'proj-005') {
      return mockProject.groups.map(g => ({ ...g, items: g.items.map(i => ({ ...i })) }));
    }
    return [];
  })();

  const quotationVersion = (() => {
    if (!project) return undefined;
    if (project.quotationId === 'proj-003' || project.quotationId === 'proj-001' || project.quotationId === 'proj-005') {
      const v = mockProject.current_version;
      return { warranty_rate: v.warranty_rate, risk_rate: v.risk_rate, commercial_cost: v.commercial_cost };
    }
    return undefined;
  })();

  const planLocked = project?.planStatus === 'approved';
  const costLocked = project?.costStatus === 'approved';

  // Check if project can be marked completed: node15 done + cost approved
  const canComplete = useMemo(() => {
    if (!project) return false;
    const node15 = project.nodes.find(n => n.nodeNo === 15);
    return node15?.status === 'completed' && project.costStatus === 'approved' && project.status !== '已完成';
  }, [project]);

  // ---- Node handlers ----
  const handleNodeStatusClick = useCallback((nodeId: string) => {
    if (!project) return;
    const now = new Date().toISOString().slice(0, 10);
    setProject(prev => {
      if (!prev) return prev;
      const newNodes = prev.nodes.map(n => {
        if (n.id !== nodeId) return n;
        const idx = STATUS_CYCLE.indexOf(n.status);
        const nextStatus = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
        // 切到"已完成"时记录实际完成日期，切离"已完成"时清除
        const updated: any = { ...n, status: nextStatus };
        if (nextStatus === 'completed') {
          updated.actualDate = now;
        } else if (n.status === 'completed') {
          updated.actualDate = undefined;
        }
        return updated;
      });
      return { ...prev, nodes: newNodes };
    });
  }, [project]);

  const handlePlannedDateChange = useCallback((nodeId: string, field: 'plannedStartDate' | 'plannedEndDate', date: string) => {
    if (!project) return;
    const now = new Date().toISOString().slice(0, 10);
    const node = project.nodes.find(n => n.id === nodeId);
    if (!node || node[field] === date) return;  // 日期未变，不处理
    setHasChanges(true);
    setProject(prev => {
      if (!prev) return prev;
      const next = {
        ...prev,
        nodes: prev.nodes.map(n => {
          if (n.id !== nodeId) return n;
          const entry = {
            id: 'h-' + crypto.randomUUID().slice(0, 8),
            field: 'plannedDate' as const,
            oldValue: n[field],
            newValue: date,
            changedAt: now,
          };
          return { ...n, [field]: date, history: [...n.history, entry] };
        }),
      };
      return next;
    });
  }, [project]);

  const handleNodeCommentsChange = useCallback((nodeId: string, comments: string) => {
    if (!project) return;
    setProject(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, comments } : n),
      };
    });
  }, [project]);

  // ---- Cost handlers ----
  const handleActualCostChange = useCallback((itemId: string, value: number) => {
    if (costLocked) return;
    setActualCosts(prev => ({ ...prev, [itemId]: value }));
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
    setProject(prev => prev ? { ...prev, planStatus: 'pending' } : prev);
    setHasChanges(false);
    msg.success('实施计划已提交审批');
  }, [project, msg]);

  const handleSubmitCost = useCallback(() => {
    if (!project) return;
    if (Object.keys(actualCosts).length === 0) {
      msg.warning('请至少录入一项实际成本再提交');
      return;
    }
    setProject(prev => prev ? { ...prev, costStatus: 'pending' } : prev);
    msg.success('成本对比已提交审批');
  }, [project, actualCosts, msg]);

  const handleApprove = useCallback((type: 'plan' | 'cost') => {
    if (!project) return;
    let comment = '';
    Modal.confirm({
      title: `确认通过${type === 'plan' ? '实施计划' : '成本对比'}？`,
      content: (
        <div>
          <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>审批意见（可选）：</div>
          <textarea rows={3} placeholder="输入审批意见…"
            onChange={e => { comment = e.target.value; }}
            style={{ width: '100%', border: '1px solid #d9d9d9', borderRadius: 4, padding: 6, fontSize: 13 }} />
        </div>
      ),
      okText: '✓ 通过',
      cancelText: '取消',
      onOk: () => {
        const approval = { reviewer: '刘总监', action: 'approved' as const, comment, createdAt: new Date().toISOString().slice(0, 10) };
        setProject(prev => prev ? {
          ...prev,
          ...(type === 'plan' ? { planStatus: 'approved', planApproval: approval } : { costStatus: 'approved', costApproval: approval }),
        } : prev);
        msg.success(`${type === 'plan' ? '实施计划' : '成本对比'}已通过`);
      },
    });
  }, [project, msg]);

  const handleReject = useCallback((type: 'plan' | 'cost') => {
    if (!project) return;
    let comment = '';
    Modal.confirm({
      title: `确认驳回${type === 'plan' ? '实施计划' : '成本对比'}？`,
      content: (
        <div>
          <div style={{ marginBottom: 8, fontWeight: 600, color: '#c62828', fontSize: 13 }}>驳回原因 *</div>
          <textarea rows={3} placeholder="请输入驳回原因…"
            onChange={e => { comment = e.target.value; }}
            style={{ width: '100%', border: '1px solid #d9d9d9', borderRadius: 4, padding: 6, fontSize: 13 }} />
        </div>
      ),
      okText: '✗ 驳回',
      okType: 'danger' as const,
      cancelText: '取消',
      onOk: () => {
        if (!comment.trim()) {
          msg.warning('驳回必须填写原因');
          return Promise.reject();
        }
        const approval = { reviewer: '刘总监', action: 'rejected' as const, comment, createdAt: new Date().toISOString().slice(0, 10) };
        setProject(prev => prev ? {
          ...prev,
          ...(type === 'plan' ? { planStatus: 'rejected', planApproval: approval } : { costStatus: 'rejected', costApproval: approval }),
        } : prev);
        msg.warning(`${type === 'plan' ? '实施计划' : '成本对比'}已驳回`);
      },
    });
  }, [project, msg]);

  // Mark project as completed
  const handleComplete = useCallback(() => {
    if (!project) return;
    Modal.confirm({
      title: '确认完成项目',
      content: '项目总结已完成且成本对比已审批通过，确认将此项目标记为已完成并移至历史项目清单？',
      okText: '确认完成',
      cancelText: '取消',
      onOk: () => {
        setProject(prev => prev ? { ...prev, status: '已完成' } : prev);
        msg.success('项目已完成');
      },
    });
  }, [project, msg]);

  if (!project) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
        项目未找到
        <div style={{ marginTop: 16 }}>
          <Button onClick={() => navigate('/delivery')}>返回交付管理</Button>
        </div>
      </div>
    );
  }

  const totalActual = Object.values(actualCosts).reduce((s, v) => s + v, 0);
  const totalEstimated = quotationGroups.reduce((s, g) => s + g.items.reduce((si, i) => si + i.direct_cost, 0), 0);
  const warrantyCost = quotationVersion ? Math.round(
    quotationGroups.reduce((s, g) =>
      s + g.items.filter(i => i.has_warranty).reduce((si, i) => si + Math.round(i.unit_cost * i.qty_total), 0), 0)
    * quotationVersion.warranty_rate
  ) : 0;
  const riskCost = quotationVersion ? Math.round(totalEstimated * quotationVersion.risk_rate) : 0;
  // 概算总成本含风险费用和质保费用（两者均为独立大项行）
  const grandEstimated = totalEstimated + riskCost + warrantyCost;
  const grandActual = totalActual + warrantyCost;
  // 实际总成本预警阈值 = (概算总成本 - 风险费用 - 质保费用) × 95%
  const costWarningThreshold = Math.round((grandEstimated - riskCost - warrantyCost) * 0.95);
  const needsCostWarning = grandActual >= costWarningThreshold;
  const TAX_RATE = 0.13;
  const contractExTax = Math.round(project.contractAmount / (1 + TAX_RATE));
  const estProfit = contractExTax - grandEstimated;
  const actProfit = contractExTax - grandActual;
  const estGP3 = contractExTax > 0 ? (estProfit / contractExTax) : 0;
  const actGP3 = contractExTax > 0 ? (actProfit / contractExTax) : 0;

  const renderApprovalBar = (type: 'plan' | 'cost') => {
    const status = type === 'plan' ? project.planStatus : project.costStatus;
    const approval = type === 'plan' ? project.planApproval : project.costApproval;
    const label = type === 'plan' ? '实施计划' : '成本对比';
    const cfg = STATUS_LABELS[status];

    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
        background: '#fafafa', borderRadius: 4, marginBottom: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#333' }}>{label}</span>
        {type === 'cost' && status === 'approved' && (
          <>
            <LockOutlined style={{ color: '#1a6b3c' }} />
            <span style={{ fontSize: 12, color: '#666' }}>
              {approval?.reviewer} 于 {approval?.createdAt} 通过
              {approval?.comment && `：「${approval.comment}」`}
            </span>
          </>
        )}
        {type === 'cost' && status === 'rejected' && (
          <span style={{ fontSize: 12, color: '#c62828' }}>
            {approval?.reviewer} 驳回：{approval?.comment}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {status === 'draft' && (
          <div style={{ display: 'flex', gap: 8 }}>
            {type === 'cost' && (
              <div onClick={() => { msg.success('成本对比已保存'); }}
                style={{
                  width: 42, height: 42, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: Object.keys(actualCosts).length > 0 ? '#00509e' : '#d9d9d9',
                  fontSize: 24, cursor: 'pointer', userSelect: 'none',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = Object.keys(actualCosts).length > 0 ? 'rgba(0,80,158,0.06)' : 'transparent'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                title="保存">
                <SaveOutlined style={{ fontWeight: 800 }} />
              </div>
            )}
            <div onClick={type === 'plan' ? handleSubmitPlan : handleSubmitCost}
              style={{
                width: 42, height: 42, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: Object.keys(actualCosts).length > 0 || type === 'plan' ? '#1a6b3c' : '#d9d9d9',
                fontSize: 24, cursor: 'pointer', userSelect: 'none',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = Object.keys(actualCosts).length > 0 || type === 'plan' ? 'rgba(26,107,60,0.06)' : 'transparent'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              title={'提交' + label}>
              <SendOutlined style={{ fontWeight: 800 }} />
            </div>
          </div>
        )}
        {status === 'pending' && (
          <>
            <div onClick={() => handleApprove(type)}
              style={{
                width: 34, height: 34, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#1a6b3c', fontSize: 20, cursor: 'pointer', userSelect: 'none',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#e8f5e9'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              title="通过">
              <CheckCircleOutlined style={{ fontWeight: 700 }} />
            </div>
            <div onClick={() => handleReject(type)}
              style={{
                width: 34, height: 34, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#c62828', fontSize: 20, cursor: 'pointer', userSelect: 'none',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#ffebee'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              title="驳回">
              <CloseCircleOutlined style={{ fontWeight: 700 }} />
            </div>
          </>
        )}
        {(status === 'rejected') || (status === 'approved' && type === 'cost') ? (
          <span style={{ fontSize: 12, color: status === 'approved' ? '#999' : '#c62828' }}>
            {status === 'approved' ? '数据已锁定' : '已驳回，可修改后重新提交'}
          </span>
        ) : null}
      </div>
    );
  };

  const completedNodeCount = project.nodes.filter(n => n.status === 'completed' || n.status === 'delayed').length;

  return (
    <div>
      {ctx}
      {/* 返回按钮 + 标题 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16,
        background: '#fff', borderRadius: 4, border: '1px solid #e8e8e8',
        padding: '14px 20px',
      }}>
        <div onClick={() => navigate('/delivery')}
          style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#00509e', fontSize: 16, cursor: 'pointer', userSelect: 'none',
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
            <span style={{ fontSize: 17, fontWeight: 700, color: '#0d1b2a', letterSpacing: 1 }}>{project.clientName}</span>
            <Tag color={project.status === '已完成' ? 'green' : project.status === '已延期' ? 'red' : 'blue'}
              style={{ margin: 0, fontSize: 12, lineHeight: '20px', borderRadius: 3, border: 'none' }}>
              {project.status}
            </Tag>
          </div>
          <div style={{ fontSize: 13, color: '#999', marginTop: 4, display: 'flex', gap: 16 }}>
            <span>{project.projectName}</span>
            <span style={{ color: '#d9d9d9' }}>|</span>
            <span>{project.salesNo}</span>
            <span style={{ color: '#d9d9d9' }}>|</span>
            <span>节点进度 <strong style={{ color: '#00509e', fontWeight: 700 }}>{completedNodeCount}</strong>/{project.nodes.length}</span>
          </div>
        </div>
      </div>

      {/* 概览条 */}
      <div style={{
        display: 'flex', alignItems: 'center', marginBottom: 16,
        background: '#fff', borderRadius: 4, border: '1px solid #e8e8e8', padding: '14px 0',
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
            <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>合同金额</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#00509e' }}>&yen;{formatMoney(contractExTax)}</div>
          </div>

          {/* 总成本 */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            borderRight: '1px solid #d4e3f7',
          }}>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>总成本</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#999' }}>&yen;{formatMoney(grandEstimated)}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: grandActual < grandEstimated ? '#1a6b3c' : '#c62828' }}>
              &yen;{formatMoney(grandActual)}
            </div>
          </div>

          {/* 利润 */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            borderRight: '1px solid #d4e3f7',
          }}>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>利润</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#999' }}>&yen;{formatMoney(estProfit)}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: actProfit >= estProfit ? '#1a6b3c' : '#c62828' }}>
              &yen;{formatMoney(actProfit)}
            </div>
          </div>

          {/* GP3 */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          }}>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>GP3</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#999' }}>{(estGP3 * 100).toFixed(1)}%</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: actGP3 >= estGP3 ? '#1a6b3c' : '#c62828' }}>
              {(actGP3 * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* 标签切换 — 多 Tab 风格 */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #e8e8e8' }}>
        <div onClick={() => setTab('plan')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: tab === 'plan' ? '2px solid #00509e' : '2px solid transparent',
            color: tab === 'plan' ? '#00509e' : '#666', fontWeight: tab === 'plan' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>
          <ScheduleOutlined style={{ color: '#00509e', marginRight: 6 }} />实施计划
        </div>
        <div onClick={() => setTab('cost')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: tab === 'cost' ? '2px solid #1a6b3c' : '2px solid transparent',
            color: tab === 'cost' ? '#1a6b3c' : '#666', fontWeight: tab === 'cost' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>
          <AuditOutlined style={{ color: '#1a6b3c', marginRight: 6 }} />成本对比
        </div>
      </div>

      {tab === 'plan' ? (
        <div>
          {renderApprovalBar('plan')}
          <Card size="small" style={{ borderRadius: 4 }}>
            <DeliveryNodeTimeline
              nodes={project.nodes}
              planLocked={planLocked}
              hasChanges={hasChanges}
              onNodeStatusClick={handleNodeStatusClick}
              onPlannedDateChange={handlePlannedDateChange}
              onCommentsChange={handleNodeCommentsChange}
              onSavePlan={() => { setHasChanges(false); msg.success('实施计划已保存'); }}
              onSubmitPlan={handleSubmitPlan}
            />
          </Card>
        </div>
      ) : (
        <ConfigProvider theme={{ token: { colorPrimary: '#00509e' } }}>
        <div>
          {renderApprovalBar('cost')}
          {needsCostWarning && (
            <div style={{
              padding: '10px 16px', marginBottom: 12, borderRadius: 4,
              background: '#fff3e0', border: '1px solid #ffcc02',
              fontSize: 13, color: '#e65100', fontWeight: 600,
            }}>
              ⚠ 实际总成本已达 &yen;{formatMoney(grandActual)}，超过预警阈值 &yen;{formatMoney(costWarningThreshold)}（概算总成本-风险费用-质保费用）×95%，需要审批
            </div>
          )}
          <Card size="small" style={{ borderRadius: 4 }}>
            <ItemCostTable
              groups={quotationGroups}
              actualCosts={actualCosts}
              onActualCostChange={handleActualCostChange}
              locked={costLocked}
              version={quotationVersion}
            />
          </Card>
          <div style={{ fontSize: 12, color: '#999', marginTop: 6, textAlign: 'right' }}>
            分项红线：-5%~+10% | 总成本红线：-2.5%~+5%
          </div>
        </div>
          </ConfigProvider>
      )}
    </div>
  );
};

if (import.meta.hot) {
  import.meta.hot.decline();
}

export default DeliveryDetail;
