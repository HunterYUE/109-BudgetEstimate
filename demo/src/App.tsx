import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
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

const App: React.FC = () => {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#999' }}>加载中...</div>}>
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/opportunities" element={<SalesOpportunityList />} />
        <Route path="/quotations" element={<QuotationList />} />
        <Route path="/quotations/:id" element={<QuotationPage />} />
        <Route path="/approval" element={<ApprovalList />} />
        <Route path="/clients" element={<ClientManagement />} />
        <Route path="/materials" element={<MaterialManagement />} />
        <Route path="/tags" element={<TagManagement />} />
        <Route path="/delivery" element={<DeliveryManagement />} />
        <Route path="/delivery/:id" element={<DeliveryDetail />} />
        <Route path="/delivery-analysis" element={<DeliveryAnalysis />} />
        <Route path="/analysis" element={<SalesAnalysis />} />
        <Route path="/settings" element={<SystemManagement />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </Suspense>
  );
};

export default App;
