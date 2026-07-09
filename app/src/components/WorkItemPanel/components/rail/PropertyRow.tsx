import type { ReactNode } from 'react';

// A single labelled row in the Properties rail: an uppercase micro-label above
// its inline control. Keeps the rail's vertical rhythm and label styling in one
// place so every property (Status, Assignee, Priority, …) reads identically.
export const PropertyRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="space-y-1.5">
    <div className="text-[10px] font-semibold tracking-wider text-[#8A8A8A] uppercase">{label}</div>
    {children}
  </div>
);
