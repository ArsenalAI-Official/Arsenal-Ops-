import type { ConfirmFn } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectsList } from './useProjectsList';
import { useMyTasks } from './useMyTasks';
import { usePersonalTasksPanel } from './usePersonalTasksPanel';
import { useNotepad } from './useNotepad';

type AuthUser = ReturnType<typeof useAuth>['user'];

interface UseProjectsPageDataArgs {
  user: AuthUser;
  confirm: ConfirmFn;
}

// Thin composer for the home page. The page's data layer is split across four
// domain hooks — projects list + create modal, the cross-project "My Tasks"
// feed, the personal-tasks panel, and the scratch notepad — each owning its own
// state, queries, and mutations. This hook just calls them and merges their
// returns into the single object ProjectsPage.tsx destructures. The hooks' keys
// are disjoint by design, so the spread is unambiguous.
export const useProjectsPageData = ({ user, confirm }: UseProjectsPageDataArgs) => {
  const projectsList = useProjectsList(confirm);
  const myTasks = useMyTasks();
  const personalTasks = usePersonalTasksPanel(confirm);
  const notepad = useNotepad(user?.id);

  return {
    ...projectsList,
    ...myTasks,
    ...personalTasks,
    ...notepad,
  };
};
