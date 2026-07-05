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
    <style>{`
      /* ── 全局表格深色科技感表头 ── */
      .ant-table-wrapper .ant-table-thead > tr > th {
        background: linear-gradient(135deg, #2c3e6b, #3d5a99) !important;
        color: #fff !important;
        font-weight: 600 !important;
        font-size: 13px !important;
        padding: 10px 12px !important;
        border-bottom: none !important;
        letter-spacing: 0.3px !important;
      }
      .ant-table-wrapper .ant-table-thead > tr > th::before { display: none !important; }
      .ant-table-wrapper .ant-table-tbody > tr > td {
        padding: 8px 12px !important;
        font-size: 13px !important;
        color: #333 !important;
        border-bottom: 1px solid #eef2f7 !important;
        transition: background 0.12s !important;
      }
      .ant-table-wrapper .ant-table-tbody > tr:nth-child(even) > td {
        background: #f8f9fb !important;
      }
      .ant-table-wrapper .ant-table-tbody > tr:hover > td {
        background: #eef4ff !important;
      }
      .ant-table-wrapper .ant-table-tbody > tr:last-child > td {
        border-bottom: none !important;
      }
      .ant-table-summary { background: #f0f4ff !important; }
      .ant-table-summary td { border-bottom: none !important; }
      .ant-table-wrapper .ant-table-tbody .ant-tag {
        font-size: 12px !important; padding: 1px 8px !important; border: none !important;
        line-height: 22px !important; border-radius: 4px !important;
      }
    `}</style>
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
