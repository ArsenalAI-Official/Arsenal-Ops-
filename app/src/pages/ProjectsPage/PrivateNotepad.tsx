import React from 'react';
import { BookOpen, Lock } from 'lucide-react';

interface PrivateNotepadProps {
  notepadContent: string;
  setNotepadContent: (content: string) => void;
  notepadSaved: boolean;
}

const PrivateNotepad: React.FC<PrivateNotepadProps> = ({
  notepadContent,
  setNotepadContent,
  notepadSaved,
}) => {
  return (
    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-2xl flex flex-col h-[460px]">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#a3a3a3]" />
          <h3 className="text-base font-semibold text-white">Private Notepad</h3>
          <Lock className="w-3.5 h-3.5 text-[#737373]" />
        </div>
        <span
          className={`text-xs transition-colors duration-300 ${
            notepadSaved ? 'text-[#E0B954]' : 'text-[#737373]'
          }`}
        >
          {notepadSaved ? '✓ Saved' : 'Saving...'}
        </span>
      </div>
      <div className="flex-1 overflow-hidden p-5">
        <textarea
          value={notepadContent}
          onChange={(e) => setNotepadContent(e.target.value)}
          placeholder="Jot down a quick note, idea, or add a link to an important resource. Only you can see this."
          className="w-full h-full bg-transparent text-sm text-[#a3a3a3] placeholder:text-[#333] resize-none outline-none leading-relaxed"
        />
      </div>
    </div>
  );
};

export default PrivateNotepad;
