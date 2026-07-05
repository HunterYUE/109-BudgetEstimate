import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
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

const TABLE_GLOBAL_STYLES = `
  .ant-table-wrapper .ant-table-thead > tr > th {
    background: #f0f4ff !important;
    color: #2c3e6b !important;
    font-weight: 700 !important;
    font-size: 12px !important;
    padding: 10px 14px !important;
    border-bottom: 2px solid #d6e0f0 !important;
    letter-spacing: 0.5px !important;
    text-transform: uppercase !important;
  }
  .ant-table-wrapper .ant-table-thead > tr > th::before { display: none !important; }
  .ant-table-wrapper .ant-table-tbody > tr > td {
    padding: 10px 14px !important;
    font-size: 13px !important;
    color: #3a4a6a !important;
    border-bottom: 1px solid #eef2f7 !important;
    transition: all 0.15s ease !important;
  }
  .ant-table-wrapper .ant-table-tbody > tr:nth-child(even) > td {
    background: #f8faff !important;
  }
  .ant-table-wrapper .ant-table-tbody > tr:hover > td {
    background: #edf3ff !important;
  }
  .ant-table-wrapper .ant-table-tbody > tr:last-child > td { border-bottom: none !important; }
  .ant-table-wrapper .ant-table-tbody .ant-tag {
    font-size: 12px !important; padding: 1px 10px !important;
    line-height: 22px !important; border-radius: 4px !important; border: none !important;
  }
  .ant-table-wrapper .ant-table-tbody .ant-btn-text {
    color: #5a6d8a !important; transition: color 0.15s !important;
  }
  .ant-table-wrapper .ant-table-tbody .ant-btn-text:hover { color: #2c3e6b !important; }
  .ant-table-wrapper { border-radius: 8px !important; }
  .ant-table-wrapper .ant-table-thead .ant-table-cell { white-space: nowrap !important; }
`;

const App: React.FC = () => {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = TABLE_GLOBAL_STYLES;
    document.head.appendChild(style);

  }, []);
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
