import { Plus, CheckSquare2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface MyTasksHeaderProps {
  taskSearch: string;
  setTaskSearch: (value: string) => void;
  onAddPersonalTaskClick: () => void;
}

const MyTasksHeader = ({
  taskSearch,
  setTaskSearch,
  onAddPersonalTaskClick,
}: MyTasksHeaderProps) => {
  return (
    <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold text-white">My tasks</h2>
        <CheckSquare2 className="w-3.5 h-3.5 text-[#737373]" />
      </div>
      <div className="flex items-center gap-2">
        {/* Search — styled to match the ProjectsBox header search so the
            home page stays consistent. Filters across every tab using
            the matchesSearch helper above. */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737373]" />
          <Input
            placeholder="Search..."
            value={taskSearch}
            onChange={(e) => setTaskSearch(e.target.value)}
            className="pl-8 w-32 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-lg h-7 text-xs focus:border-[#E0B954]/50"
          />
        </div>
        <button
          onClick={onAddPersonalTaskClick}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-gradient-to-r from-[#E0B954] to-[#C79E3B] hover:opacity-90 text-[#080808] transition-opacity"
          title="Add personal task"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default MyTasksHeader;
