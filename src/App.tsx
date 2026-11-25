import { Navigate, Route, Routes } from 'react-router-dom';

import { DEFAULT_SECTION_PATH } from './app/navigation';
import { DEFAULT_CRM_TAB_PATH } from './features/crm/config/tabs';
import CrmPage from './pages/CrmPage';
import { ClientsTab } from './pages/crm/ClientsTab';
import { DealsTab } from './pages/crm/DealsTab';
import { SuppliersTab } from './pages/crm/SuppliersTab';
import ServiceDeskPage from './pages/ServiceDeskPage';
import { ThemeProvider } from './theme/ThemeContext';

/**
 * Маршруты приложения.
 *
 * /crm — оболочка раздела CRM с верхним меню:
 *   /crm/deals     — сделки (канбан),
 *   /crm/clients   — клиенты (список, поиск, создание),
 *   /crm/suppliers — поставщики (пусто).
 */
export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<Navigate to={DEFAULT_SECTION_PATH} replace />} />
        <Route path="/crm" element={<CrmPage />}>
          <Route index element={<Navigate to="deals" replace />} />
          <Route path="deals" element={<DealsTab />} />
          <Route path="clients" element={<ClientsTab />} />
          <Route path="suppliers" element={<SuppliersTab />} />
          <Route path="*" element={<Navigate to={DEFAULT_CRM_TAB_PATH} replace />} />
        </Route>
        <Route path="/service-desk" element={<ServiceDeskPage />} />
        <Route path="*" element={<Navigate to={DEFAULT_SECTION_PATH} replace />} />
      </Routes>
    </ThemeProvider>
  );
}

