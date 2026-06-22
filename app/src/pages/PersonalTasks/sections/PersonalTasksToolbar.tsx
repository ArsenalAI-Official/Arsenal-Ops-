import { Plus, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type FilterStatus = 'all' | 'todo' | 'done';
type SortBy = 'date-desc' | 'date-asc' | 'priority';

interface PersonalTasksToolbarProps {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  filterStatus: FilterStatus;
  setFilterStatus: (value: FilterStatus) => void;
  sortBy: SortBy;
  setSortBy: (value: SortBy) => void;
  onNewTask: () => void;
}

const PersonalTasksToolbar = ({
  searchQuery,
  setSearchQuery,
  filterStatus,
  setFilterStatus,
  sortBy,
  setSortBy,
  onNewTask,
}: PersonalTasksToolbarProps) => {
  return (
    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-2xl p-5 mb-8">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex-1 flex flex-col md:flex-row gap-3 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 md:flex-initial md:w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#737373]" />
            <Input
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-lg h-10 text-sm focus:border-[#E0B954]/50"
            />
          </div>

          {/* Filter */}
          <Select value={filterStatus} onValueChange={(v: any) => setFilterStatus(v)}>
            <SelectTrigger className="w-full md:w-40 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] h-10">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a1a] border-[rgba(255,255,255,0.07)]">
              <SelectItem value="all">All Tasks</SelectItem>
              <SelectItem value="todo">Pending</SelectItem>
              <SelectItem value="done">Completed</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger className="w-full md:w-40 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a1a] border-[rgba(255,255,255,0.07)]">
              <SelectItem value="date-desc">Newest First</SelectItem>
              <SelectItem value="date-asc">Oldest First</SelectItem>
              <SelectItem value="priority">By Priority</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={onNewTask}
          className="w-full md:w-auto bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-[#080808] font-semibold hover:opacity-90 rounded-xl"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Task
        </Button>
      </div>
    </div>
  );
};

export default PersonalTasksToolbar;
