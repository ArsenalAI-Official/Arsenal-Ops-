// Shared react-day-picker classNames for the date-picker popovers. Previously
// duplicated verbatim in ProjectsPage/constants.ts and WorkItemPanel/constants.ts.
// Only the keys that react-day-picker (v9/v10) actually recognizes are kept; the
// old v8-era keys (caption/nav_button/table/head_row/head_cell/row/cell/day_*)
// were no-ops under v9 and are omitted rather than remapped, so the popovers keep
// rendering exactly as before.
export const CALENDAR_CLASS_NAMES = {
  months: 'flex flex-col',
  month: 'space-y-4',
  caption_label: 'text-sm font-medium text-white',
  nav: 'space-x-1 flex items-center',
  day: 'h-8 w-8 p-0 font-normal',
  day_button: 'text-white hover:bg-[rgba(255,255,255,0.12)] rounded-lg h-8 w-8 transition-colors',
};
