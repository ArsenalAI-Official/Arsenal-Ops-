import type { ReactNode } from 'react';

// The two-pane body shell shared by both panel variants: a scrolling main
// content column beside a Properties rail.
//
// Responsive: side-by-side at `md+`, stacked (rail below content) on narrow
// panels — the panel is a right-side overlay whose width tracks the viewport at
// small sizes, so a viewport breakpoint is an acceptable proxy here (Tailwind v3
// has no container-query support configured). When `collapsed`, the rail is
// hidden entirely and the main column takes the full width; the header's
// layout-toggle drives that boolean (persisted via useRailCollapsed).
interface PanelLayoutProps {
  main: ReactNode;
  rail: ReactNode;
  collapsed: boolean;
}

export const PanelLayout = ({ main, rail, collapsed }: PanelLayoutProps) => (
  <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
    <div className="min-w-0 flex-1 overflow-y-auto p-6">{main}</div>
    {!collapsed && (
      <div className="flex-shrink-0 overflow-y-auto border-t border-[rgba(255,255,255,0.07)] p-5 md:w-80 md:border-t-0 md:border-l">
        {rail}
      </div>
    )}
  </div>
);
