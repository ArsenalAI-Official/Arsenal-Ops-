// Shared mutation key for inline per-field work-item patches driven by the
// WorkItemPanel Properties rail (edit-in-place dropdowns / steppers).
//
// A SHARED key lets `queryClient.isMutating({ mutationKey })` count the
// concurrent field patches in flight, so only the last one standing triggers
// cache invalidation. Without that guard, a burst of inline edits would each
// refetch on settle and a mid-sequence refetch could clobber a later optimistic
// value ("window of inconsistency"). See TkDodo, "Concurrent Optimistic Updates
// in React Query" (https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query).
export const WORK_ITEM_PATCH_FIELD_KEY = ['workItem', 'patch-field'] as const;
