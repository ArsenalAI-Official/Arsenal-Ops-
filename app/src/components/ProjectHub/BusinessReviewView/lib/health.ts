export interface HealthMeta {
  color: string;
  label: string;
  borderColor: string;
  bgColor: string;
}

export const getHealthMeta = (score: number): HealthMeta => {
  if (score >= 80)
    return {
      color: '#34D399',
      label: 'Healthy',
      borderColor: 'border-[#34D399]/20',
      bgColor: 'bg-[#34D399]/5',
    };
  if (score >= 60)
    return {
      color: '#FBBF24',
      label: 'At Risk',
      borderColor: 'border-[#FBBF24]/20',
      bgColor: 'bg-[#FBBF24]/5',
    };
  return {
    color: '#EF4444',
    label: 'Critical',
    borderColor: 'border-[#EF4444]/20',
    bgColor: 'bg-[#EF4444]/5',
  };
};
