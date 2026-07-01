import React, { useState } from 'react';
import { COLORS } from '../styles/constants';

type TabKey = 'users' | 'config' | 'audit';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'users', label: '用户管理' },
  { key: 'config', label: '基础配置' },
  { key: 'audit', label: '审核配置' },
];

const SystemManagement: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('users');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: '#0d1b2a' }}>系统管理</span>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #e8e8e8' }}>
        {TABS.map(t => (
          <div key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '8px 20px', cursor: 'pointer', fontSize: 14,
              borderBottom: tab === t.key ? '2px solid COLORS.primary' : '2px solid transparent',
              color: tab === t.key ? COLORS.primary : '#666',
              fontWeight: tab === t.key ? 600 : 400,
              marginBottom: -2, transition: 'all 0.15s',
            }}>{t.label}</div>
        ))}
      </div>

      {tab === 'users' && (
        <div style={{ padding: 40, textAlign: 'center', background: '#fff', borderRadius: 6, border: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>👥</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#333', marginBottom: 8 }}>用户管理</div>
          <div style={{ fontSize: 13, color: '#999', lineHeight: 1.6 }}>
            角色权限控制、用户账号管理、团队设置<br />
            后续版本开发
          </div>
        </div>
      )}

      {tab === 'config' && (
        <div style={{ padding: 40, textAlign: 'center', background: '#fff', borderRadius: 6, border: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>⚙️</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#333', marginBottom: 8 }}>基础配置</div>
          <div style={{ fontSize: 13, color: '#999', lineHeight: 1.6 }}>
            系统参数设置、默认工费费率配置、汇率管理<br />
            后续版本开发
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div style={{ padding: 40, textAlign: 'center', background: '#fff', borderRadius: 6, border: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#333', marginBottom: 8 }}>审核配置</div>
          <div style={{ fontSize: 13, color: '#999', lineHeight: 1.6 }}>
            物料审核流程、报价审批流程、交付审批流程配置<br />
            后续版本开发
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemManagement;
