import React, { useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Tag, Card, Button, message, Modal, ConfigProvider } from 'antd';
import { ScheduleOutlined, AuditOutlined, SendOutlined, SaveOutlined, ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import { mockDeliveryProjects, mockProject, mockApprovalRequests } from '../mockData';
import { formatMoney } from '../utils/calculations';
import { notifyMockUpdate } from '../utils/mockStore';
import DeliveryNodeTimeline from '../components/DeliveryNodeTimeline';
import IconButton from '../components/IconButton';
import ItemCostTable from '../components/ItemCostTable';
import type { DeliveryProject, DeliveryNode, Group } from '../types';
import { COLORS } from '../styles/constants';

const STATUS_CYCLE: DeliveryNode['status'][] = ['pending', 'in_progress', 'completed', 'delayed'];
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: COLORS.textSecondary },
  pending: { label: '待审批', color: COLORS.warning },
  approved: { label: '已通过', color: '#2e7d32' },
  rejected: { label: '已驳回', color: COLORS.danger },
};

const DeliveryDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [msg, ctx] = message.useMessage();
  const location = useLocation();
  const initTab = (location.state as { tab?: 'plan' | 'cost' })?.tab || 'plan';
  const [tab, setTab] = useState<'plan' | 'cost'>(initTab);

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
  const [costDirty, setCostDirty] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const quotationGroups: Group[] = useMemo(() => {
    if (!project) return [];
    if (project.quotationId === 'proj-003' || project.quotationId === 'proj-001' || project.quotationId === 'proj-005') {
      return mockProject.groups.map(g => ({ ...g, items: g.items.map(i => ({ ...i })) }));
    }
    return [];
  }, [project]);

  const quotationVersion = useMemo(() => {
    if (!project) return undefined;
    if (project.quotationId === 'proj-003' || project.quotationId === 'proj-001' || project.quotationId === 'proj-005') {
      const v = mockProject.current_version;
      return { warranty_rate: v.warranty_rate, risk_rate: v.risk_rate, commercial_cost: v.commercial_cost };
    }
    return undefined;
  }, [project]);

  // 实施计划：仅待审批时锁定（通过后可继续修改无需再审批，驳回后可修改重新提交）
  const planLocked = project?.planStatus === 'pending';
  // 成本对比：仅待审批时锁定（通过后可修改并重新提交覆盖旧数据，驳回后可修改重新提交）
  const costLocked = project?.costStatus === 'pending';
  const costCanEdit = project?.costStatus !== 'pending';

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
        const updated: DeliveryNode = { ...n, status: nextStatus as DeliveryNode['status'] };
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
    // 提交审批：写入共享审批列表
    const existing = mockApprovalRequests.find(r => r.deliveryId === project.id && r.approvalType === 'plan' && r.status === 'pending');
    if (!existing) {
      mockApprovalRequests.push({
        id: 'apr-plan-' + crypto.randomUUID().slice(0, 6),
        approvalType: 'plan', quotationId: project.quotationId, deliveryId: project.id,
        salesNo: project.salesNo, clientName: project.clientName,
        projectName: project.projectName,
        amount: project.contractAmount, totalCost: 0, profitRate: 0, gp3: 0,
        submitter: '方案经理', submitTime: new Date().toISOString().slice(0, 10),
        status: 'pending', records: [],
      });
    }
    setProject(prev => prev ? { ...prev, planStatus: 'pending' } : prev);
    setHasChanges(false);
    notifyMockUpdate();
    msg.success('实施计划已提交审批，请前往审批管理模块查看');
  }, [project, msg]);

  const handleSubmitCost = useCallback(() => {
    if (!project) return;
    if (Object.keys(actualCosts).length === 0) {
      msg.warning('请至少录入一项实际成本再提交');
      return;
    }
    const totalActual = Object.values(actualCosts).reduce((s, v) => s + v, 0);
    const existing = mockApprovalRequests.find(r => r.deliveryId === project.id && r.approvalType === 'cost' && r.status === 'pending');
    if (!existing) {
      mockApprovalRequests.push({
        id: 'apr-cost-' + crypto.randomUUID().slice(0, 6),
        approvalType: 'cost', quotationId: project.quotationId, deliveryId: project.id,
        salesNo: project.salesNo, clientName: project.clientName,
        projectName: project.projectName,
        amount: project.contractAmount, totalCost: totalActual, profitRate: 0, gp3: 0,
        submitter: '交付经理', submitTime: new Date().toISOString().slice(0, 10),
        status: 'pending', records: [],
      });
    }
    setProject(prev => prev ? { ...prev, costStatus: 'pending' } : prev);
    setCostDirty(false);
    notifyMockUpdate();
    msg.success('成本对比已提交审批，请前往审批管理模块查看');
  }, [project, actualCosts, msg]);

  const handleExportPlan = useCallback(() => {
    if (!project) return;
    const TAX_RATE = 0.13;
    const exTax = Math.round(project.contractAmount / (1 + TAX_RATE));
    const doneCount = project.nodes.filter(n => n.status === 'completed' || n.status === 'delayed').length;
    Modal.info({
      title: '实施计划概览',
      width: 560,
      content: (
        <div style={{ fontSize: 13, lineHeight: 2 }}>
          <p>项目：{project.projectName}</p>
          <p>客户：{project.clientName}</p>
          <p>合同金额：&yen;{formatMoney(exTax)}</p>
          <p>节点进度：{doneCount}/{project.nodes.length}</p>
        </div>
      ),
      okText: '关闭',
    });
  }, [project]);

  const handleExportCost = useCallback(() => {
    if (!project) return;
    const totalAct = Object.values(actualCosts).reduce((s, v) => s + v, 0);
    const totEst = quotationGroups.reduce((s, g) => s + g.items.reduce((si, i) => si + i.direct_cost, 0), 0);
    Modal.info({
      title: '成本对比概览',
      width: 560,
      content: (
        <div style={{ fontSize: 13, lineHeight: 2 }}>
          <p>项目：{project.projectName}</p>
          <p>客户：{project.clientName}</p>
          <p>概算总成本：&yen;{formatMoney(totEst)}</p>
          <p>实际总成本：&yen;{formatMoney(totalAct)}</p>
        </div>
      ),
      okText: '关闭',
    });
  }, [project, quotationGroups, actualCosts]);

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
        background: COLORS.bgLight, borderRadius: 4, marginBottom: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: COLORS.textPrimary }}>{label}</span>
        {cfg && <Tag color={cfg.color} style={{ margin: 0, fontSize: 12, lineHeight: '20px', borderRadius: 3, border: 'none' }}>{cfg.label}</Tag>}
        {status === 'approved' && approval && (
          <span style={{ fontSize: 12, color: COLORS.textSecondary }}>
            {approval.reviewer} 于 {approval.createdAt} 通过
            {approval.comment ? `：「${approval.comment}」` : ''}
          </span>
        )}
        {status === 'rejected' && approval && (
          <span style={{ fontSize: 12, color: COLORS.danger }}>
            {approval.reviewer} 驳回：{approval.comment}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {status === 'rejected' && (
          <span style={{ fontSize: 12, color: COLORS.danger }}>已驳回，可修改后重新提交</span>
        )}
        {status === 'approved' && type === 'cost' && (
          <span style={{ fontSize: 12, color: COLORS.textLight }}>数据已锁定</span>
        )}
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
            <Tag color={project.status === '已完成' ? 'green' : project.status === '已延期' ? 'red' : 'blue'}
              style={{ margin: 0, fontSize: 12, lineHeight: '20px', borderRadius: 3, border: 'none' }}>
              {project.status}
            </Tag>
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
        <div onClick={() => setTab('plan')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: tab === 'plan' ? `2px solid ${COLORS.primary}` : '2px solid transparent',
            color: tab === 'plan' ? COLORS.primary : COLORS.textSecondary, fontWeight: tab === 'plan' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>
          <ScheduleOutlined style={{ color: COLORS.primary, marginRight: 6 }} />实施计划
        </div>
        <div onClick={() => setTab('cost')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: tab === 'cost' ? `2px solid ${COLORS.success}` : '2px solid transparent',
            color: tab === 'cost' ? COLORS.success : COLORS.textSecondary, fontWeight: tab === 'cost' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>
          <AuditOutlined style={{ color: COLORS.success, marginRight: 6 }} />成本对比
        </div>
      </div>

      {tab === 'plan' ? (
        <div>
          {renderApprovalBar('plan')}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 12, fontSize: 12, color: COLORS.textSecondary }}>
            <span>项目延期：
              <strong style={{ color: COLORS.danger }}>
                {(() => {
                  const done15 = project.nodes.find(n => n.nodeNo === 15);
                  if (done15?.status === 'completed' && done15.actualDate) {
                    const planEnd = new Date(done15.plannedEndDate);
                    const actual = new Date(done15.actualDate);
                    const days = Math.round((actual.getTime() - planEnd.getTime()) / (1000 * 60 * 60 * 24));
                    return days > 0 ? days + '天' : '0天';
                  }
                  const now = new Date();
                  const end15 = new Date(done15?.plannedEndDate || now);
                  return end15 < now ? Math.round((now.getTime() - end15.getTime()) / (1000 * 60 * 60 * 24)) + '天' : '0天';
                })()}
              </strong>
            </span>
          </div>
          <Card size="small" styles={{ body: { padding: 0 } }} style={{ borderRadius: 4, border: 'none', boxShadow: 'none', background: 'transparent' }}>
            <DeliveryNodeTimeline
              nodes={project.nodes}
              locked={planLocked}
              hasChanges={hasChanges}
              onNodeStatusClick={handleNodeStatusClick}
              onPlannedDateChange={handlePlannedDateChange}
              onCommentsChange={handleNodeCommentsChange}
              onSavePlan={() => { setHasChanges(false); msg.success('实施计划已保存'); }}
              onSubmitPlan={handleSubmitPlan}
              onExportPlan={handleExportPlan}
            />
          </Card>
        </div>
      ) : (
        <ConfigProvider theme={{ token: { colorPrimary: COLORS.primary } }}>
        <div>
          {renderApprovalBar('cost')}
          {needsCostWarning && (
            <div style={{
              padding: '10px 16px', marginBottom: 12, borderRadius: 4,
              background: '#fff3e0', border: '1px solid #ffcc02',
              fontSize: 13, color: COLORS.warning, fontWeight: 600,
            }}>
              ⚠ 实际总成本已达 &yen;{formatMoney(grandActual)}，超过预警阈值 &yen;{formatMoney(costWarningThreshold)}（概算总成本-风险费用-质保费用）×95%，需要审批
            </div>
          )}
          <Card size="small" styles={{ body: { padding: 0 } }} style={{ borderRadius: 4, border: 'none', boxShadow: 'none', background: 'transparent' }}>
            <ItemCostTable
              groups={quotationGroups}
              actualCosts={actualCosts}
              onActualCostChange={handleActualCostChange}
              locked={costLocked}
              version={quotationVersion}
            />
          </Card>
          {costCanEdit && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 16 }}>
            <IconButton icon={<SaveOutlined style={{ fontWeight: 700 }} />}
              onClick={() => { setCostDirty(false); msg.success('成本对比已保存'); }}
              color="#d46b08" hoverBg="#fff7e6" title="保存"
              disabled={!costDirty} />
            <IconButton icon={<SendOutlined style={{ fontWeight: 700 }} />}
              onClick={handleSubmitCost}
              color={COLORS.primary} hoverBg="#e6f0fa" title="提交审批"
              disabled={!costDirty} />
            <IconButton icon={<DownloadOutlined style={{ fontWeight: 700 }} />}
              onClick={handleExportCost} color={COLORS.success} hoverBg="#e8f5e9" title="导出" />
          </div>
          )}
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
