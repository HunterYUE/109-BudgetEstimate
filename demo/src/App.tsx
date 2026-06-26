import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import Dashboard from './pages/Dashboard';
import SalesOpportunityList from './pages/SalesOpportunityList';
import QuotationList from './pages/QuotationList';
import QuotationPage from './pages/QuotationPage';
import ApprovalList from './pages/ApprovalList';
import DeliveryDetail from './pages/DeliveryDetail';
import ClientManagement from './pages/ClientManagement';
import DeliveryManagement from './pages/DeliveryManagement';
import SalesAnalysis from './pages/SalesAnalysis';
import SystemManagement from './pages/SystemManagement';

const App: React.FC = () => {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/opportunities" element={<SalesOpportunityList />} />
        <Route path="/quotations" element={<QuotationList />} />
        <Route path="/quotations/:id" element={<QuotationPage />} />
        <Route path="/approval" element={<ApprovalList />} />
        <Route path="/clients" element={<ClientManagement />} />
        <Route path="/delivery" element={<DeliveryManagement />} />
        <Route path="/delivery/:id" element={<DeliveryDetail />} />
        <Route path="/analysis" element={<SalesAnalysis />} />
        <Route path="/settings" element={<SystemManagement />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

export default App;
