import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer, Table, Tag, Space } from 'antd';
import { PhoneOutlined, MailOutlined } from '@ant-design/icons';
import type { Client, Contact } from '../../types';
import { COLORS } from '../../styles/colors';
import { gradeConfig, creditConfig, roleColors } from './clientConstants';
import { formatMoney } from '../../utils/calculations';
import { formatBeijing } from '../../utils/timeFormat';

interface ClientDrawerProps {
  drawerClient: Client | null;
  clients: Client[];
  onClose: () => void;
}

const ClientDrawer: React.FC<ClientDrawerProps> = ({ drawerClient, clients, onClose }) => {
  const navigate = useNavigate();

  const sectionHeader = (title: string, count?: number) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{ width: 3, height: 16, background: COLORS.primary, borderRadius: 1 }} />
      <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.3 }}>{title}</span>
      {count !== undefined && <span style={{ fontSize: 12, color: COLORS.textFormLabel }}>（{count}）</span>}
    </div>
  );

  const infoRow = (label: string, value: React.ReactNode) => (
    <div style={{ padding: '8px 0', borderBottom: '1px solid #f0f4fa', display: 'flex', alignItems: 'center' }}>
      <span style={{ color: COLORS.textFormLabel, fontSize: 12, width: 80, flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#1a2234', fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  );

  const renderDrawerContent = (client: Client) => {
    const parent = client.parentId ? clients.find(c => c.id === client.parentId) : null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ── 基本信息卡片 ── */}
        <div style={{
          background: COLORS.bgCard, border: `1px solid ${COLORS.borderCard}`, borderRadius: 5,
          padding: '20px 24px',
        }}>
          {sectionHeader('基本信息')}
          {client.type === 'subsidiary' && parent && infoRow('母公司', parent.name)}
          {infoRow('行业', client.industry)}
          {infoRow('区域', client.region)}
          {infoRow('区域销售', client.salesman)}
          {infoRow('信用等级', (
            <Tag color={creditConfig[client.creditLevel]?.color || COLORS.textLight}
              style={{ borderRadius: 1, margin: 0, fontSize: 12, lineHeight: '20px' }}>
              {creditConfig[client.creditLevel]?.label}
            </Tag>
          ))}
          {infoRow('创建日期', formatBeijing(client.createdAt))}
        </div>

        {/* ── 联系人卡片 ── */}
        <div style={{
          background: COLORS.bgCard, border: `1px solid ${COLORS.borderCard}`, borderRadius: 5,
          padding: '20px 24px',
        }}>
          {sectionHeader('联系人', (client.contacts || []).length)}
          {(client.contacts || []).length > 0 ? (
            <Table
              dataSource={client.contacts}
              rowKey="id"
              pagination={false}
              size="small"
              bordered
              style={{ background: '#fff', borderRadius: 3 }}
              columns={[
                {
                  title: '联系人', key: 'contact', width: 130,
                  render: (_: unknown, c: Contact) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 3,
                        background: '#eef4ff', color: COLORS.primary,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, flexShrink: 0,
                      }}>
                        {c.name ? c.name.charAt(0) : '?'}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: COLORS.textFormLabel }}>{c.position}</div>
                      </div>
                    </div>
                  ),
                },
                {
                  title: '汇报人', dataIndex: 'superior', width: 80,
                  render: (v: string) => <span style={{ fontSize: 12, color: COLORS.textFormLabel }}>{v || '—'}</span>,
                },
                {
                  title: '电话', dataIndex: 'phone', width: 130,
                  render: (v: string) => (
                    <span style={{ fontSize: 12, color: COLORS.textPrimary }}>
                      <PhoneOutlined style={{ marginRight: 4, fontSize: 11, color: '#b0b8c4' }} />{v}
                    </span>
                  ),
                },
                {
                  title: '邮箱', dataIndex: 'email', width: 170,
                  render: (v: string) => (
                    <span style={{ fontSize: 12, color: COLORS.textPrimary }}>
                      <MailOutlined style={{ marginRight: 4, fontSize: 11, color: '#b0b8c4' }} />{v}
                    </span>
                  ),
                },
                {
                  title: '角色', dataIndex: 'decisionRole', width: 60, align: 'center' as const,
                  render: (v: string) => (
                    <Tag color={roleColors[v] || COLORS.textLight} style={{ borderRadius: 1, fontSize: 11, lineHeight: '20px', margin: 0 }}>
                      {v}
                    </Tag>
                  ),
                },
              ]}
            />
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: '#b0b8c4', fontSize: 13 }}>暂无联系人</div>
          )}
        </div>

        {/* ── 历史报价记录卡片 ── */}
        <div style={{
          background: COLORS.bgCard, border: `1px solid ${COLORS.borderCard}`, borderRadius: 5,
          padding: '20px 24px',
        }}>
          {sectionHeader('历史报价记录')}
          {(() => {
            const qh = (client as any).quotationHistory || [];
            return qh.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {qh.map((h: any, i: number) => {
                    const qId = h.quotationId;
                    const clickable = !!qId;
                    const salesNo = h.salesNo || '';
                    const verNo = h.versionNo || '';
                    const price = h.discountedPrice || h.amount || 0;
                    return (
                      <tr key={salesNo || i} onClick={() => clickable && navigate('/quotations/' + qId)}
                        style={{ cursor: clickable ? 'pointer' : 'default', transition: 'background 0.12s' }}
                        onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLElement).style.background = '#f5f8ff'; }}
                        onMouseLeave={e => { if (clickable) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                        <td style={{ padding: '10px 12px', borderBottom: `1px solid ${COLORS.borderLight}`, fontSize: 13 }}>
                          <span style={{ fontWeight: 600, color: COLORS.textDark }}>{salesNo}</span>
                          <span style={{ color: COLORS.textSecondary, marginLeft: 4, fontSize: 12 }}>{verNo}</span>
                          <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 500, color: COLORS.textSecondary }}>
                            &yen;{formatMoney(price)}
                          </span>
                        </td>
                        <td style={{ width: 24, padding: '10px 6px', borderBottom: `1px solid ${COLORS.borderLight}`, textAlign: 'center' }}>
                          {clickable && <span style={{ color: COLORS.textLight, fontSize: 14 }}>›</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: 20, textAlign: 'center', color: '#b0b8c4', fontSize: 13 }}>暂无历史记录</div>
            );
          })()}
        </div>
      </div>
    );
  };

  return (
    <Drawer
      title={
        drawerClient ? (
          <Space>
            {drawerClient.type === 'subsidiary' && <span style={{ fontSize: 12, color: COLORS.textLight }}>子公司</span>}
            <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.textDark }}>
              {drawerClient.type === 'enterprise'
                ? drawerClient.name
                : (clients.find(c => c.id === drawerClient.parentId)?.name || '') + '（' + drawerClient.name + '）'
              }
            </span>
            <Tag color={gradeConfig[drawerClient.grade]?.color || COLORS.textLight} style={{ borderRadius: 1 }}>
              {gradeConfig[drawerClient.grade]?.label}
            </Tag>
            <span style={{ fontSize: 12, color: COLORS.textLight }}>{drawerClient.code}</span>
          </Space>
        ) : ''
      }
      placement="right"
      onClose={onClose}
      open={!!drawerClient}
      styles={{ wrapper: { width: 600 } }}
    >
      {drawerClient && renderDrawerContent(drawerClient)}
    </Drawer>
  );
};

export default ClientDrawer;
