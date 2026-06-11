import type { MyTask } from '../../types';
import { STATUS_BARS } from '../../constants';

interface StatusBarProps {
  filteredMyTasks: MyTask[];
}

const StatusBar = ({ filteredMyTasks }: StatusBarProps) => {
  const bars = STATUS_BARS.filter((s) => s.key !== 'done');
  return (
    <div className="px-5 py-3 border-t border-[rgba(255,255,255,0.05)] flex-shrink-0">
      <div className="h-2 rounded-full overflow-hidden flex w-full mb-2">
        {bars.map((s) => {
          const count = filteredMyTasks.filter((t) => t.status === s.key).length;
          const pct = (count / filteredMyTasks.length) * 100;
          return pct > 0 ? (
            <div
              key={s.key}
              style={{ width: `${pct}%`, backgroundColor: s.color }}
              title={`${s.label}: ${count}`}
            />
          ) : null;
        })}
      </div>
      <div className="flex flex-wrap gap-3">
        {bars.map((s) => {
          const count = filteredMyTasks.filter((t) => t.status === s.key).length;
          return (
            <div key={s.key} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-xs text-[#737373]">
                {s.label} <span className="text-white font-medium">{count}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StatusBar;
