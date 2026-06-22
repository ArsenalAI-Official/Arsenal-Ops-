import { useEffect, useState } from 'react';

// Per-user scratch notepad backed by localStorage. Hydrates on mount and
// auto-saves with an 800ms debounce. Extracted from useProjectsPageData so the
// notepad's two effects live apart from the page's server-state concerns.
export const useNotepad = (userId: number | undefined) => {
  const [notepadContent, setNotepadContent] = useState('');
  const [notepadSaved, setNotepadSaved] = useState(true);
  const [notepadOpen, setNotepadOpen] = useState(false);

  // Load from localStorage per user.
  useEffect(() => {
    if (userId) {
      const saved = localStorage.getItem(`notepad_${userId}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from localStorage is a one-shot mount sync
      if (saved !== null) setNotepadContent(saved);
    }
  }, [userId]);

  // Auto-save with debounce.
  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mark dirty before the debounced save fires
    setNotepadSaved(false);
    const timer = setTimeout(() => {
      localStorage.setItem(`notepad_${userId}`, notepadContent);
      setNotepadSaved(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [notepadContent, userId]);

  return {
    notepadContent,
    setNotepadContent,
    notepadSaved,
    notepadOpen,
    setNotepadOpen,
  };
};
