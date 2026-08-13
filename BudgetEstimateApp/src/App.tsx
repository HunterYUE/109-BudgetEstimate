import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './utils/authContext';
import { canAccessRoute } from './utils/permissions';
import { pageLoaders } from './utils/pageLoaders';
import AppLayout from './layouts/AppLayout';

// ⚠️ B9 修复：lazy 组件统一取自 pageLoaders（与 AppLayout 悬停预加载同源，增删页面只改一处）
const Dashboard = lazy(pageLoaders['/']);
const SalesOpportunityList = lazy(pageLoaders['/opportunities']);
const QuotationList = lazy(pageLoaders['/quotations']);
const QuotationPage = lazy(pageLoaders['/quotations/:id']);
const ApprovalList = lazy(pageLoaders['/approval']);
const DeliveryDetail = lazy(pageLoaders['/delivery/:id']);
const ClientManagement = lazy(pageLoaders['/clients']);
const MaterialManagement = lazy(pageLoaders['/materials']);
const TagManagement = lazy(pageLoaders['/tags']);
const DeliveryManagement = lazy(pageLoaders['/delivery']);
const DeliveryAnalysis = lazy(pageLoaders['/delivery-analysis']);
const SalesAnalysis = lazy(pageLoaders['/analysis']);
const SystemManagement = lazy(pageLoaders['/settings']);
const Login = lazy(() => import('./pages/Login'));

/** 受保护路由：未登录则跳转到 /login */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: '#999' }}>加载中...</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
};

/** 权限守卫：检查当前用户是否有权限访问该路径 */
function RoleGuard({ path, children }: { path: string; children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user || !canAccessRoute(user.permissions, path)) {
    // 无权限时重定向到仪表盘
    return <Navigate to="/" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

function createRoute(path: string, element: React.ReactNode) {
  return <Route path={path} element={<RoleGuard path={path}>{element}</RoleGuard>} />;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#999' }}>加载中...</div>}>
    <Routes>
      {/* 登录页（无需登录） */}
      <Route path="/login" element={
        user ? <Navigate to="/" replace /> : <Login />
      } />

      {/* 受保护的应用路由 */}
      <Route element={
        <ProtectedRoute>
            <AppLayout />
        </ProtectedRoute>
      }>
        {createRoute('/', <Dashboard />)}
        {createRoute('/opportunities', <SalesOpportunityList />)}
        {createRoute('/quotations', <QuotationList />)}
        {createRoute('/quotations/:id', <QuotationPage />)}
        {createRoute('/approval', <ApprovalList />)}
        {createRoute('/clients', <ClientManagement />)}
        {createRoute('/materials', <MaterialManagement />)}
        {createRoute('/tags', <TagManagement />)}
        {createRoute('/delivery', <DeliveryManagement />)}
        {createRoute('/delivery/:id', <DeliveryDetail />)}
        {createRoute('/delivery-analysis', <DeliveryAnalysis />)}
        {createRoute('/analysis', <SalesAnalysis />)}
        {createRoute('/settings', <SystemManagement />)}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </Suspense>
  );
}

export default App;
