import { Users, BarChart3, ClipboardList } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import GeneratedTicketCard from '../components/GeneratedTicketCard';
import type { GeneratedTicket, TicketsSummary } from '../useAIPlanning';

interface PreviewStepProps {
  uploadMode: 'prd' | 'roadmap';
  generatedTickets: GeneratedTicket[];
  ticketsSummary: TicketsSummary | null;
  roadmapSummary: any;
  roadmapParsedData: any;
  sprintWeeks: number;
}

const PreviewStep = ({
  uploadMode,
  generatedTickets,
  ticketsSummary,
  roadmapSummary,
  roadmapParsedData,
  sprintWeeks,
}: PreviewStepProps) => {
  return (
    <div className="space-y-6">
      {/* PRD Mode - Summary Stats */}
      {uploadMode === 'prd' && ticketsSummary && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-[#E0B954]">{generatedTickets.length}</p>
            <p className="text-xs text-[#737373]">Tickets</p>
          </div>
          <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-[#F59E0B]">{ticketsSummary.total_story_points}</p>
            <p className="text-xs text-[#737373]">Total Points</p>
          </div>
          <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-[#E0B954]">
              {ticketsSummary.total_estimated_hours}h
            </p>
            <p className="text-xs text-[#737373]">Estimated Hours</p>
          </div>
        </div>
      )}

      {/* Roadmap Mode - Summary Stats */}
      {uploadMode === 'roadmap' && roadmapSummary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[rgba(102,184,255,0.1)] rounded-lg p-3">
              <p className="text-xs text-[#737373] mb-1">Epics</p>
              <p className="text-lg font-bold text-[#66b8ff]">{roadmapSummary.total_epics}</p>
            </div>
            <div className="bg-[rgba(224,185,84,0.1)] rounded-lg p-3">
              <p className="text-xs text-[#737373] mb-1">Tasks</p>
              <p className="text-lg font-bold text-[#E0B954]">{roadmapSummary.total_tasks}</p>
            </div>
            <div className="bg-[rgba(16,185,129,0.1)] rounded-lg p-3">
              <p className="text-xs text-[#737373] mb-1">Team Size</p>
              <p className="text-lg font-bold text-[#10b981]">{roadmapSummary.total_assignees}</p>
            </div>
            <div className="bg-[rgba(245,158,11,0.1)] rounded-lg p-3">
              <p className="text-xs text-[#737373] mb-1">Duration</p>
              <p className="text-lg font-bold text-[#F59E0B]">
                {roadmapSummary.timeline?.duration_weeks || '?'}w
              </p>
            </div>
          </div>

          {/* Sprint Info */}
          {roadmapSummary.total_sprints !== undefined && (
            <div className="bg-[rgba(224,185,84,0.1)] border border-[#E0B954]/20 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-[#E0B954]/20 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-[#E0B954]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Sprint Plan</p>
                  <p className="text-xs text-[#737373]">{sprintWeeks} weeks per sprint</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-[#E0B954] mb-1">
                {roadmapSummary.total_sprints} Sprints
              </p>
              <p className="text-xs text-[#a3a3a3]">
                Will be created with {sprintWeeks}-week cycles
              </p>
            </div>
          )}
        </>
      )}

      {/* Sprint Recommendation (PRD only) */}
      {uploadMode === 'prd' && ticketsSummary?.sprint_recommendation && (
        <div className="bg-[#E0B954]/10 border border-[#E0B954]/20 rounded-xl p-4">
          <p className="text-sm text-[#E0B954] font-medium">Sprint Recommendation</p>
          <p className="text-xs text-[#a3a3a3] mt-1">{ticketsSummary.sprint_recommendation}</p>
        </div>
      )}

      {/* Tickets List - PRD Mode */}
      {uploadMode === 'prd' && (
        <div>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-[#E0B954]" />
            Generated Tickets ({generatedTickets.length})
          </h3>
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {generatedTickets.length === 0 ? (
              <Empty className="py-8">
                <EmptyDescription className="text-[#737373]">
                  No tickets generated. Please try again.
                </EmptyDescription>
              </Empty>
            ) : (
              generatedTickets.map((ticket, index) => (
                <GeneratedTicketCard key={index} ticket={ticket} />
              ))
            )}
          </div>
        </div>
      )}

      {/* Tickets List - Roadmap Mode */}
      {uploadMode === 'roadmap' && roadmapParsedData && (
        <div>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-[#E0B954]" />
            Roadmap Tickets ({roadmapParsedData.tickets?.length || 0})
          </h3>
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {!roadmapParsedData.tickets || roadmapParsedData.tickets.length === 0 ? (
              <Empty className="py-8">
                <EmptyDescription className="text-[#737373]">
                  No tickets found in roadmap.
                </EmptyDescription>
              </Empty>
            ) : (
              roadmapParsedData.tickets.map((ticket: any, index: number) => (
                <div
                  key={index}
                  className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className="text-[10px] bg-[#E0B954]/20 text-[#E0B954] border-0">
                          {ticket.priority || 'medium'}
                        </Badge>
                      </div>
                      <h4 className="text-sm font-medium text-white mb-1">{ticket.name}</h4>
                      <p className="text-xs text-[#737373] line-clamp-2">
                        {ticket.description || 'No description'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span className="text-xs text-[#737373]">{ticket.effort_hrs || 0}h</span>
                      {ticket.assignee && (
                        <div className="flex items-center gap-2 bg-[rgba(244,246,255,0.05)] rounded-lg px-2 py-1">
                          <Users className="w-3 h-3 text-[#E0B954]" />
                          <span className="text-xs text-[#a3a3a3]">{ticket.assignee}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {ticket.milestone && (
                    <p className="text-[10px] text-[#737373] mt-2">Milestone: {ticket.milestone}</p>
                  )}
                  {ticket.epic && <p className="text-[10px] text-[#737373]">Epic: {ticket.epic}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PreviewStep;
