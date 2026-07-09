interface PersonalTasksStatsBarProps {
  stats: {
    total: number;
    completed: number;
    pending: number;
  };
}

const PersonalTasksStatsBar = ({ stats }: PersonalTasksStatsBarProps) => {
  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      {[
        { label: 'Total Tasks', value: stats.total, color: 'var(--text-mid)' },
        { label: 'Pending', value: stats.pending, color: '#F59E0B' },
        { label: 'Completed', value: stats.completed, color: '#40BE86' },
      ].map((stat) => (
        <div key={stat.label} className="relative group">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[rgba(255,255,255,0.05)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 transition-all duration-300 group-hover:border-[rgba(255,255,255,0.12)]">
            <div className="text-sm text-[#737373] font-medium mb-2">{stat.label}</div>
            <div className="text-3xl font-bold" style={{ color: stat.color }}>
              {stat.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default PersonalTasksStatsBar;
