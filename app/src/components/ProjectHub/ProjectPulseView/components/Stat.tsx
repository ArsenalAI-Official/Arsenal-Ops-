import React from 'react';

/* -------------------------------------------------------------------- */
/*  STAT TILE — used inside the unified hero                            */
/* -------------------------------------------------------------------- */
export const Stat: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: 'neutral' | 'gold' | 'green' | 'amber';
  children?: React.ReactNode;
}> = ({ label, value, sub, tone = 'neutral', children }) => {
  const toneBorder: Record<string, string> = {
    neutral: 'border-[rgba(255,255,255,0.05)]',
    gold: 'border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)]',
    green: 'border-[#34D399]/20 bg-[#34D399]/[0.04]',
    amber: 'border-[#FBBF24]/20 bg-[#FBBF24]/[0.04]',
  };
  return (
    <div className={'rounded-xl p-4 bg-[rgba(255,255,255,0.02)] border ' + toneBorder[tone]}>
      <div className="text-[10px] uppercase tracking-wider text-[#737373]">{label}</div>
      <div className="text-xl font-bold text-white tabular-nums mt-1.5">{value}</div>
      {sub && <div className="text-[11px] text-[#a3a3a3] mt-1">{sub}</div>}
      {children}
    </div>
  );
};
