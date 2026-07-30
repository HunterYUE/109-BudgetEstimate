import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './utils/authContext';
import { canAccessRoute } from './utils/permissions';
import AppLayout from './layouts/AppLayout';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const SalesOpportunityList = lazy(() => import('./pages/SalesOpportunityList'));
const QuotationList = lazy(() => import('./pages/QuotationList'));
const QuotationPage = lazy(() => import('./pages/QuotationPage'));
const ApprovalList = lazy(() => import('./pages/ApprovalList'));
const DeliveryDetail = lazy(() => import('./pages/DeliveryDetail'));
const ClientManagement = lazy(() => import('./pages/ClientManagement'));
const MaterialManagement = lazy(() => import('./pages/MaterialManagement'));
const TagManagement = lazy(() => import('./pages/TagManagement'));
const DeliveryManagement = lazy(() => import('./pages/DeliveryManagement'));
const DeliveryAnalysis = lazy(() => import('./pages/DeliveryAnalysis'));
const SalesAnalysis = lazy(() => import('./pages/SalesAnalysis'));
const SystemManagement = lazy(() => import('./pages/SystemManagement'));
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
