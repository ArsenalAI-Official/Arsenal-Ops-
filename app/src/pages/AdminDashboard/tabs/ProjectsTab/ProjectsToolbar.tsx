import { Filter, Tag, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ProjectCategory } from '../../modals/CategoryManagerModal';

interface ProjectsToolbarProps {
  projectSearch: string;
  onProjectSearchChange: (value: string) => void;
  categories: ProjectCategory[];
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  onClearFilters: () => void;
  /** Searched count (numerator) shown against the category-filtered total. */
  searchedCount: number;
  totalCount: number;
  onOpenCategoryManager: () => void;
  canWriteProjects: boolean;
}

/** Header row — title, free-text search, category filter, clear-filters,
 *  result count, and the (write-gated) Manage Categories button. */
const ProjectsToolbar: React.FC<ProjectsToolbarProps> = ({
  projectSearch,
  onProjectSearchChange,
  categories,
  categoryFilter,
  onCategoryFilterChange,
  onClearFilters,
  searchedCount,
  totalCount,
  onOpenCategoryManager,
  canWriteProjects,
}) => {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <h2 className="text-lg font-semibold text-white">All Projects</h2>

      <div className="flex items-center gap-2">
        {/* Free-text search — matches name + description across the
            category-filtered list. Same input style as the Users tab
            search so the admin shell stays uniform. */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737373]" />
          <Input
            placeholder="Search projects…"
            value={projectSearch}
            onChange={(e) => onProjectSearchChange(e.target.value)}
            className="pl-8 w-56 bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-9 text-sm focus:border-[#E0B954]/50"
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[#737373]">
          <Filter className="w-3.5 h-3.5" />
          Category
        </div>
        <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
          <SelectTrigger className="w-[200px] bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-white h-9">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
            <SelectItem value="all" className="text-white">
              All categories
            </SelectItem>
            <SelectItem value="uncategorized" className="text-white">
              Uncategorized
            </SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={String(cat.id)} className="text-white">
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Clear-filters affordance — surfaces when search OR a non-"all"
            category is active. Mirrors the UsersTab pattern so both
            tabs reset the same way. Resets both at once, even if only
            one of them is set, so the "back to default" expectation is
            consistent. */}
        {(projectSearch !== '' || categoryFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-9 text-xs text-[#737373] hover:text-white rounded-xl px-3"
          >
            Clear filters
          </Button>
        )}
        {/* Result count — always shown so the admin sees the size of
            the current list at a glance. Mirrors UsersTab's "{x} of {y}"
            indicator. `projects` here is the parent's category-filtered
            list; the count denominator is therefore "after category
            filter", which is the largest meaningful baseline given the
            parent owns the category filter. */}
        <div className="text-xs text-[#737373]">
          {searchedCount} of {totalCount}
        </div>
        {/* Match "Back to Projects" button style — ghost variant, muted
            foreground that brightens on hover. Keeps the header visual
            hierarchy consistent across the admin shell.
            Hidden without `admin.projects_write` so read-only admins
            don't see an entry point that would 403 on category mutation. */}
        {canWriteProjects && (
          <Button
            variant="ghost"
            onClick={onOpenCategoryManager}
            className="text-[#737373] hover:text-white"
          >
            <Tag className="w-4 h-4 mr-2" />
            Manage categories
          </Button>
        )}
      </div>
    </div>
  );
};

export default ProjectsToolbar;
