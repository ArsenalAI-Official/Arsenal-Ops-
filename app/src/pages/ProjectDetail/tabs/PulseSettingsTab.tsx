import { PulseSettingsView } from '@/components/ProjectHub';
import { PulseData } from '@/components/ProjectHub/pulseData';

interface PulseSettingsTabProps {
  projectId: string;
  pulseData: PulseData;
  onChange: (data: PulseData) => void;
}

const PulseSettingsTab = ({ projectId, pulseData, onChange }: PulseSettingsTabProps) => {
  return <PulseSettingsView projectId={projectId} initial={pulseData} onChange={onChange} />;
};

export default PulseSettingsTab;
