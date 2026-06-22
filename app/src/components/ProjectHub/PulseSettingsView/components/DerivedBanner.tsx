import React from 'react';
import { Link } from 'react-router-dom';

// Why: shared banner for sections now replaced by DB-derived values.
export const DerivedBanner: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-lg border border-[#E0B954]/15 bg-[#E0B954]/5 px-4 py-2.5 text-xs text-[#a3a3a3] flex items-start gap-2">
    <span aria-hidden="true" className="text-[#E0B954] flex-shrink-0">
      ●
    </span>
    <span>{children}</span>
  </div>
);

/** Inline gold link used inside DerivedBanner copy to point PMs at the
 *  canonical edit surface for the data being mirrored. */
export const BannerLink: React.FC<{ to: string; children: React.ReactNode }> = ({
  to,
  children,
}) => (
  <Link to={to} className="text-[#E0B954] underline-offset-2 hover:underline">
    {children}
  </Link>
);
