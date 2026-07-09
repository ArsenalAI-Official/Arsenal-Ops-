import { BookOpen, Lock, X } from 'lucide-react';

interface QuickNotesPanelProps {
  notepadOpen: boolean;
  setNotepadOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  notepadContent: string;
  setNotepadContent: (value: string) => void;
  notepadSaved: boolean;
}

const QuickNotesPanel = ({
  notepadOpen,
  setNotepadOpen,
  notepadContent,
  setNotepadContent,
  notepadSaved,
}: QuickNotesPanelProps) => {
  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2 pointer-events-none">
      <div
        className={`transition-all duration-300 origin-bottom-right ${
          notepadOpen
            ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 scale-95 translate-y-4 pointer-events-none'
        }`}
      >
        <div
          className="w-80 bg-[#111] border border-[rgba(255,255,255,0.10)] rounded-2xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
          style={{ height: '340px' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(255,255,255,0.07)] flex-shrink-0">
            <div className="flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-[#a3a3a3]" />
              <span className="text-sm font-semibold text-white">Quick Notes</span>
              <Lock className="w-3 h-3 text-[#555]" />
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs transition-colors duration-300 ${notepadSaved ? 'text-status-done' : 'text-[#737373]'}`}
              >
                {notepadSaved ? '✓ Saved' : 'Saving...'}
              </span>
              <button
                onClick={() => setNotepadOpen(false)}
                className="p-1 rounded-lg hover:bg-[rgba(255,255,255,0.06)] text-[#555] hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden p-4">
            <textarea
              value={notepadContent}
              onChange={(e) => setNotepadContent(e.target.value)}
              placeholder="Jot down a quick note, idea, or link... Only you can see this."
              className="w-full h-full bg-transparent text-sm text-[#a3a3a3] placeholder:text-[#333] resize-none outline-none leading-relaxed"
              autoFocus={notepadOpen}
            />
          </div>
        </div>
      </div>

      <button
        onClick={() => setNotepadOpen((o) => !o)}
        className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all duration-200 shadow-lg ${
          notepadOpen
            ? 'bg-[#1a1a1a] border-[rgba(255,255,255,0.12)] text-[#a3a3a3] hover:text-white'
            : 'bg-[#1a1a1a] border-[rgba(255,255,255,0.08)] text-[#737373] hover:text-[#a3a3a3] hover:border-[rgba(255,255,255,0.12)]'
        }`}
        title="Quick Notes"
      >
        <BookOpen className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">Quick Notes</span>
        <Lock className="w-3 h-3 opacity-50" />
      </button>
    </div>
  );
};

export default QuickNotesPanel;
