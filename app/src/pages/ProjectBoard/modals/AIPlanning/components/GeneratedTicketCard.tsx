import { Users, Target, ClipboardList, BookOpen, Bug } from 'lucide-react';
import type { GeneratedTicket } from '../useAIPlanning';

const TYPE_CONFIG = {
  user_story: { icon: BookOpen, color: '#E0B954', label: 'Story', bg: 'rgba(224,185,84,0.15)' },
  task: { icon: ClipboardList, color: '#F59E0B', label: 'Task', bg: 'rgba(245,158,11,0.15)' },
  bug: { icon: Bug, color: '#EF4444', label: 'Bug', bg: 'rgba(239,68,68,0.15)' },
  epic: { icon: Target, color: '#A78BFA', label: 'Epic', bg: 'rgba(167,139,250,0.15)' },
  subtask: { icon: ClipboardList, color: '#FBBF24', label: 'Subtask', bg: 'rgba(251,191,36,0.15)' },
};

const PRIORITY_COLORS = {
  critical: { hex: '#EF4444' },
  high: { hex: '#F97316' },
  medium: { hex: '#F59E0B' },
  low: { hex: '#737373' },
};

interface GeneratedTicketCardProps {
  ticket: GeneratedTicket;
}

const GeneratedTicketCard = ({ ticket }: GeneratedTicketCardProps) => {
  const typeInfo = TYPE_CONFIG[ticket.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.task;
  const TypeIcon = typeInfo.icon;
  return (
    <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
              style={{
                backgroundColor: typeInfo.bg,
                color: typeInfo.color,
              }}
            >
              <TypeIcon className="w-3 h-3" />
              {typeInfo.label}
            </div>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{
                backgroundColor:
                  (
                    PRIORITY_COLORS[ticket.priority as keyof typeof PRIORITY_COLORS] ||
                    PRIORITY_COLORS.low
                  ).hex + '33',
                color: (
                  PRIORITY_COLORS[ticket.priority as keyof typeof PRIORITY_COLORS] ||
                  PRIORITY_COLORS.low
                ).hex,
              }}
            >
              {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
            </span>
          </div>
          <h4 className="text-sm font-medium text-white mb-1">{ticket.title}</h4>
          <p className="text-xs text-[#737373] line-clamp-2">{ticket.description}</p>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#737373]">{ticket.story_points} pts</span>
            <span className="text-xs text-[#737373]">{ticket.estimated_hours}h</span>
          </div>
          {ticket.assignee_name && (
            <div className="flex items-center gap-2 bg-[rgba(244,246,255,0.05)] rounded-lg px-2 py-1">
              <Users className="w-3 h-3 text-[#E0B954]" />
              <span className="text-xs text-[#a3a3a3]">{ticket.assignee_name}</span>
            </div>
          )}
        </div>
      </div>
      {ticket.assignee_reasoning && (
        <p className="text-[10px] text-[#737373] mt-2 italic">
          Assignment: {ticket.assignee_reasoning}
        </p>
      )}
      {ticket.tags && ticket.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {ticket.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded-md bg-[rgba(255,255,255,0.05)] text-[#737373]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default GeneratedTicketCard;
