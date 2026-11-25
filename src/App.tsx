import { Navigate, Route, Routes } from 'react-router-dom';

import { DEFAULT_SECTION_PATH } from './app/navigation';
import CrmPage from './pages/CrmPage';
import ServiceDeskPage from './pages/ServiceDeskPage';
import { ThemeProvider } from './theme/ThemeContext';

/**
 * Бизнес-маршруты отделены от визуальной оболочки: оба раздела используют
 * общий AppShell, поэтому позже сюда можно подключить CRM и Service Desk
 * без переписывания оболочки.
 */
export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<Navigate to={DEFAULT_SECTION_PATH} replace />} />
        <Route path="/crm" element={<CrmPage />} />
        <Route path="/service-desk" element={<ServiceDeskPage />} />
        <Route path="*" element={<Navigate to={DEFAULT_SECTION_PATH} replace />} />
      </Routes>
    </ThemeProvider>
  );
}
