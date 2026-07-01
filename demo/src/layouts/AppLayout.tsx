import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Tooltip } from 'antd';
import ErrorBoundary from '../components/ErrorBoundary';
import { MdOutlineDashboard, MdOutlineSell, MdOutlineDescription, MdOutlineFactCheck,
  MdOutlinePeople, MdOutlineInventory, MdOutlineLocalShipping, MdOutlineBarChart, MdOutlineSettings,
  MdOutlinePerson, MdOutlineNotificationsNone, MdOutlineLabel } from 'react-icons/md';

const { Header, Content } = Layout;

const MENU_ITEMS = [
  { key: '/',             icon: MdOutlineDashboard,  label: '仪表盘' },
  { key: '/opportunities', icon: MdOutlineSell,     label: '销售管理' },
  { key: '/quotations',    icon: MdOutlineDescription, label: '报价列表' },
  { key: '/approval',     icon: MdOutlineFactCheck,  label: '审批管理' },
  { key: '/analysis',     icon: MdOutlineBarChart,   label: '销售分析' },
  { key: '/delivery',     icon: MdOutlineLocalShipping, label: '交付管理' },
  { key: '/tags',         icon: MdOutlineLabel,     label: '标签管理' },
  { key: '/materials',    icon: MdOutlineInventory,   label: '物料管理' },
  { key: '/clients',      icon: MdOutlinePeople,     label: '客户管理' },
  { key: '/settings',     icon: MdOutlineSettings,   label: '系统管理' },
];

const sidebarWidth = 81;

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const activeKey = MENU_ITEMS.find(item => location.pathname.startsWith(item.key))?.key || '/';

  return (
    <div style={{ display: 'flex', width: '100%', minHeight: '100vh' }}>
      {/* 左侧竖条导航 */}
      <div style={{
        width: sidebarWidth, flexShrink: 0,
        background: '#1a1a2e',
        height: '100vh', position: 'sticky', top: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1, padding: '24px 0 20px' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: 2 }}>T&amp;J</span>
          <span style={{ fontSize: 8, fontWeight: 500, color: 'rgba(255,255,255,0.45)', letterSpacing: 1.5 }}>AUTOMATION</span>
        </div>

        {MENU_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = activeKey === item.key;
          return (
            <Tooltip key={item.key} title={item.label} placement="right">
              <div
                onClick={() => navigate(item.key)}
                style={{
                  width: 40, height: 40, margin: '8px auto',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 5, cursor: 'pointer',
                  background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.45)',
                  fontSize: 24, transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon style={{ display: 'block' }} />
              </div>
            </Tooltip>
          );
        })}
      </div>

      {/* 主区域 */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* 顶部栏 */}
        <Header
          style={{
            height: 56, background: '#f5f5f5',
            borderBottom: '1px solid #e8e8e8',
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
          }}
        >
          <span style={{ fontSize: 17, fontWeight: 700, color: '#0d1b2a', letterSpacing: 1 }}>
            销售和交付管理系统
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <MdOutlineNotificationsNone size={20} style={{ color: '#666', cursor: 'pointer' }} />
            <div style={{ width: 32, height: 32, borderRadius: '50%',
              background: '#00509e', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              <MdOutlinePerson size={18} />
            </div>
          </div>
        </Header>

        {/* 内容区 */}
        <Content className="app-content" style={{ background: '#fff', padding: '20px 24px', flex: 1, overflow: 'auto' }}>
          <ErrorBoundary><Outlet /></ErrorBoundary>
        </Content>
      </div>
    </div>
  );
};

export default AppLayout;
