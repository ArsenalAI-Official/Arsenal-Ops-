import React, { useState } from 'react';
import { Clock, AlertCircle, AlertTriangle } from 'lucide-react';
import { getHealthMeta } from './lib/health';
import { useBusinessReviewComments } from './hooks/useBusinessReviewComments';
import type { BusinessReviewViewProps } from './types';
import KpiCards from './sections/KpiCards';
import MilestoneProgress from './sections/MilestoneProgress';
import StakeholderSummary from './sections/StakeholderSummary';
import BusinessReviewComments from './sections/BusinessReviewComments';
import ItemListDialog from './modals/ItemListDialog';
import HealthExplanationModal from './modals/HealthExplanationModal';

const BusinessReviewView: React.FC<BusinessReviewViewProps> = ({
  project,
  analytics,
  sprints,
  milestones,
  workItems,
}) => {
  const { businessReviewComments, toggleCommentResolved } = useBusinessReviewComments(project?.id);
  const [showHealthExplanation, setShowHealthExplanation] = useState(false);
  const [showOverdueDialog, setShowOverdueDialog] = useState(false);
  const [showBugsDialog, setShowBugsDialog] = useState(false);
  const [showCriticalDialog, setShowCriticalDialog] = useState(false);

  const today = new Date();

  const overdueItems = workItems.filter(
    (item) => item.due_date && new Date(item.due_date) < today && item.status !== 'done',
  ).length;

  const openBugs = workItems.filter((item) => item.type === 'bug' && item.status !== 'done').length;

  // Filter lists for dialogs
  const overdueItemsList = workItems.filter(
    (item) => item.due_date && new Date(item.due_date) < today && item.status !== 'done',
  );
  const bugsList = workItems.filter((item) => item.type === 'bug' && item.status !== 'done');
  const criticalItemsList = workItems.filter(
    (item) => item.priority === 'critical' && item.status !== 'done',
  );

  const completedMilestones = milestones.filter((m) => m.is_completed).length;
  const totalMilestones = milestones.length;
  const milestonePct =
    totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

  const activeSprint = sprints.find((s) => s.status === 'active');

  const completionPct =
    analytics && analytics.total_story_points > 0
      ? Math.round((analytics.completed_points / analytics.total_story_points) * 100)
      : 0;

  // Health score: start at 100, subtract for issues
  let healthScore = 100;
  const deductions: Array<{ label: string; amount: number; detail: string }> = [];

  const overdueDeduction = Math.min(30, overdueItems * 5);
  if (overdueDeduction > 0) {
    healthScore -= overdueDeduction;
    deductions.push({
      label: 'Overdue Items',
      amount: overdueDeduction,
      detail: `${overdueItems} overdue items × 5 points each (max 30)`,
    });
  }

  const bugsDeduction = Math.min(20, openBugs * 4);
  if (bugsDeduction > 0) {
    healthScore -= bugsDeduction;
    deductions.push({
      label: 'Open Bugs',
      amount: bugsDeduction,
      detail: `${openBugs} open bugs × 4 points each (max 20)`,
    });
  }

  if (totalMilestones > 0 && milestonePct < 50 && activeSprint) {
    healthScore -= 10;
    deductions.push({
      label: 'Low Milestone Progress',
      amount: 10,
      detail: `Only ${milestonePct}% of milestones completed with active sprint`,
    });
  }

  healthScore = Math.max(0, Math.min(100, healthScore));

  const health = getHealthMeta(healthScore);

  const onTimeDeliveryPct =
    analytics && analytics.total_items > 0
      ? Math.round(((analytics.status_distribution?.done || 0) / analytics.total_items) * 100)
      : 0;

  const criticalOpen = workItems.filter(
    (i) => i.priority === 'critical' && i.status !== 'done',
  ).length;

  return (
    <div className="space-y-6">
      {/* Top Row: Health Score + KPI Cards */}
      <KpiCards
        health={health}
        healthScore={healthScore}
        onTimeDeliveryPct={onTimeDeliveryPct}
        analytics={analytics}
        overdueItems={overdueItems}
        openBugs={openBugs}
        criticalOpen={criticalOpen}
        onShowHealthExplanation={() => setShowHealthExplanation(true)}
        onShowOverdueDialog={() => setShowOverdueDialog(true)}
        onShowBugsDialog={() => setShowBugsDialog(true)}
        onShowCriticalDialog={() => setShowCriticalDialog(true)}
      />

      {/* Milestone Progress */}
      {milestones.length > 0 && (
        <MilestoneProgress
          milestones={milestones}
          completedMilestones={completedMilestones}
          totalMilestones={totalMilestones}
          milestonePct={milestonePct}
          today={today}
        />
      )}

      {/* Stakeholder Summary */}
      <StakeholderSummary
        completionPct={completionPct}
        activeSprint={activeSprint}
        analytics={analytics}
        sprints={sprints}
      />

      {/* Business Review Comments */}
      <BusinessReviewComments
        comments={businessReviewComments}
        projectId={project.id}
        onToggleResolved={toggleCommentResolved}
      />

      {/* Overdue Items Dialog */}
      {showOverdueDialog && (
        <ItemListDialog
          title="Overdue Items"
          countNoun="item"
          items={overdueItemsList}
          emptyMessage="No overdue items 🎉"
          headerIcon={<Clock className="w-5 h-5 text-[#EF4444]" />}
          headerIconBgClass="bg-[#EF4444]/20"
          rowIcon={<Clock className="w-4 h-4 text-[#EF4444]" />}
          rowIconBgClass="bg-[#EF4444]/10"
          projectId={project.id}
          onClose={() => setShowOverdueDialog(false)}
        />
      )}

      {/* Open Bugs Dialog */}
      {showBugsDialog && (
        <ItemListDialog
          title="Open Bugs"
          countNoun="bug"
          items={bugsList}
          emptyMessage="No open bugs 🎉"
          headerIcon={<AlertCircle className="w-5 h-5 text-[#EF4444]" />}
          headerIconBgClass="bg-[#EF4444]/20"
          rowIcon={<AlertCircle className="w-4 h-4 text-[#EF4444]" />}
          rowIconBgClass="bg-[#EF4444]/10"
          projectId={project.id}
          onClose={() => setShowBugsDialog(false)}
        />
      )}

      {/* Critical Items Dialog */}
      {showCriticalDialog && (
        <ItemListDialog
          title="Critical Items"
          countNoun="item"
          items={criticalItemsList}
          emptyMessage="No critical items 🎉"
          headerIcon={<AlertTriangle className="w-5 h-5 text-[#F97316]" />}
          headerIconBgClass="bg-[#F97316]/20"
          rowIcon={<AlertTriangle className="w-4 h-4 text-[#F97316]" />}
          rowIconBgClass="bg-[#F97316]/10"
          projectId={project.id}
          onClose={() => setShowCriticalDialog(false)}
        />
      )}

      {/* Health Explanation Modal */}
      {showHealthExplanation && (
        <HealthExplanationModal
          health={health}
          healthScore={healthScore}
          deductions={deductions}
          onClose={() => setShowHealthExplanation(false)}
        />
      )}
    </div>
  );
};

export default BusinessReviewView;
