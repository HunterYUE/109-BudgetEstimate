import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Tooltip, Dropdown } from 'antd';
import ErrorBoundary from '../components/ErrorBoundary';
import { useAuth } from '../utils/authContext';
import { canSeeMenu } from '../utils/permissions';
import { MdOutlineDashboard, MdOutlineSell, MdOutlineRequestQuote, MdOutlineFactCheck,
  MdOutlineCategory, MdOutlineFactory, MdOutlineBarChart, MdOutlineSettings,
  MdOutlineNotificationsNone, MdOutlineLabel, MdOutlineAssessment, MdOutlineBusinessCenter,
  MdOutlineLogout } from 'react-icons/md';

const { Header, Content } = Layout;

const MENU_ITEMS = [
  { key: '/',             icon: MdOutlineDashboard,  label: '仪表盘' },
  { key: '/analysis',     icon: MdOutlineBarChart,   label: '销售分析' },
  { key: '/opportunities', icon: MdOutlineSell,     label: '销售管理' },
  { key: '/quotations',    icon: MdOutlineRequestQuote,   label: '报价列表' },
  { key: '/delivery-analysis', icon: MdOutlineAssessment,  label: '交付分析' },
  { key: '/delivery',     icon: MdOutlineFactory,    label: '交付管理' },
  { key: '/approval',     icon: MdOutlineFactCheck,  label: '审批管理' },
  { key: '/tags',         icon: MdOutlineLabel,     label: '标签管理' },
  { key: '/materials',    icon: MdOutlineCategory,   label: '物料管理' },
  { key: '/clients',      icon: MdOutlineBusinessCenter, label: '客户管理' },
  { key: '/settings',     icon: MdOutlineSettings,   label: '系统管理' },
];

const sidebarWidth = 81;

/** 顶部栏用户菜单 */
const HeaderUserMenu: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initial = user?.displayName?.charAt(0) || '?';

  const items = [
    {
      key: 'info',
      label: (
        <div style={{ padding: '2px 0' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a2e', letterSpacing: 0.3 }}>
            {user?.displayName}
          </div>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
            {user?.email}
          </div>
          <div style={{
            marginTop: 8, fontSize: 11, fontWeight: 600,
            color: '#fff', background: 'linear-gradient(135deg, #00509e, #4060e0)',
            padding: '2px 12px', borderRadius: 10, display: 'inline-block',
          }}>
            {user?.title || (user?.role === 'director' ? '部门总监' : user?.role === 'admin' ? '管理员' : '用户')}
          </div>
        </div>
      ),
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <MdOutlineLogout size={16} style={{ color: '#ff4d4f' }} />,
      label: <span style={{ color: '#ff4d4f', fontWeight: 500 }}>退出登录</span>,
      onClick: () => { logout(); navigate('/login'); },
    },
  ];

  return (
    <Dropdown
      menu={{ items }}
      placement="bottomRight"
      trigger={['click']}
      dropdownRender={menu => (
        <div style={{
          borderRadius: 10, overflow: 'hidden',
          boxShadow: '0 6px 20px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
          border: '1px solid #e8e8e8',
          minWidth: 200,
        }}>
          {menu}
        </div>
      )}
    >
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: 'linear-gradient(135deg, #00509e, #4060e0)',
        color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 700, cursor: 'pointer',
        boxShadow: '0 2px 6px rgba(0,80,158,0.3)',
        transition: 'box-shadow 0.2s',
      }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,80,158,0.45)'; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,80,158,0.3)'; }}
      >
        {initial}
      </div>
    </Dropdown>
  );
};

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // 按权限过滤菜单（基于用户自定义 permissions 数组）
  const visibleMenu = user ? MENU_ITEMS.filter(item => canSeeMenu(user.permissions, item.key)) : [];

  const activeKey = visibleMenu.find(item =>
    item.key === '/' ? location.pathname === '/' : (location.pathname === item.key || location.pathname.startsWith(item.key + '/'))
  )?.key || '/';

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

        {visibleMenu.map(item => {
          const Icon = item.icon;
          const isActive = activeKey === item.key;
          return (

            <Tooltip key={item.key} title={item.label} placement="right">
              <div
                onClick={() => navigate(item.key)}
                onMouseEnter={e => {
                  if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  // 悬停时预加载页面 chunk（减少点击后的加载等待）
                  const pageMap: Record<string, () => Promise<any>> = {
                    '/': () => import('../pages/Dashboard'),
                    '/analysis': () => import('../pages/SalesAnalysis'),
                    '/opportunities': () => import('../pages/SalesOpportunityList'),
                    '/quotations': () => import('../pages/QuotationList'),
                    '/delivery-analysis': () => import('../pages/DeliveryAnalysis'),
                    '/delivery': () => import('../pages/DeliveryManagement'),
                    '/approval': () => import('../pages/ApprovalList'),
                    '/tags': () => import('../pages/TagManagement'),
                    '/materials': () => import('../pages/MaterialManagement'),
                    '/clients': () => import('../pages/ClientManagement'),
                    '/settings': () => import('../pages/SystemManagement'),
                  };
                  pageMap[item.key]?.();
                }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                style={{
                  width: 40, height: 40, margin: '8px auto',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 5, cursor: 'pointer',
                  background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.45)',
                  fontSize: 24, transition: 'all 0.15s ease',
                }}
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
            <HeaderUserMenu />
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
