import React from 'react';

export const Card: React.FC<React.PropsWithChildren<{ className?: string }>> = ({
  className = '',
  children,
}) => (
  <div
    className={
      'bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl ' + className
    }
  >
    {children}
  </div>
);
