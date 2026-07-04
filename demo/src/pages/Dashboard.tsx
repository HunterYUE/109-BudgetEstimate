import React from 'react';
import { COLORS } from '../styles/constants';

const Dashboard: React.FC = () => (
  <div>
    <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark, marginBottom: 4 }}>仪表盘</div>
    <div style={{ fontSize: 13, color: COLORS.textLight, marginBottom: 24 }}>销售和交付管理系统概览</div>
    <div style={{ padding: 40, textAlign: 'center', color: COLORS.textLight, background: '#fff', borderRadius: 6 }}>
      仪表盘 — 待开发
    </div>
  </div>
);

export default Dashboard;
