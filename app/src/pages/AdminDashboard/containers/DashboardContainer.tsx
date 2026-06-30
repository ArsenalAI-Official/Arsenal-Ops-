// Container for the Dashboard tab: owns the tab's data hook and renders the tab.
import { AdminSpinner } from '../components/AdminSpinner';
import { useAdminStats } from '../hooks/useAdminStats';
import DashboardTab from '../tabs/DashboardTab';
import { AdminTab } from '../types';

interface DashboardContainerProps {
  setActiveTab: (tab: AdminTab) => void;
}

const DashboardContainer = ({ setActiveTab }: DashboardContainerProps) => {
  const { stats, isLoading } = useAdminStats();

  if (isLoading) return <AdminSpinner />;

  return stats ? <DashboardTab stats={stats} setActiveTab={setActiveTab} /> : null;
};

export default DashboardContainer;
