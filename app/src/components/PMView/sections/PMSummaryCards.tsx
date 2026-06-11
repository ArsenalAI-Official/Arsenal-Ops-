import { Clock, Calendar, TrendingUp, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { HoursAnalytics } from '../types';

interface PMSummaryCardsProps {
  analytics: HoursAnalytics;
  progressPercentage: number;
}

export default function PMSummaryCards({ analytics, progressPercentage }: PMSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card className="bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.05)]">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#E0B954]/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-[#E0B954]" />
            </div>
            <div>
              <p className="text-xs text-[#737373]">Total Project Hours</p>
              <p className="text-xl font-bold text-white">{analytics.total_allocated_hours}h</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.05)]">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#E0B954]/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-[#E0B954]" />
            </div>
            <div>
              <p className="text-xs text-[#737373]">Logged Hours</p>
              <p className="text-xl font-bold text-white">{analytics.total_logged_hours}h</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.05)]">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#F59E0B]/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <div>
              <p className="text-xs text-[#737373]">Remaining Hours</p>
              <p className="text-xl font-bold text-white">{analytics.total_remaining_hours}h</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.05)]">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#C79E3B]/20 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-[#C79E3B]" />
            </div>
            <div>
              <p className="text-xs text-[#737373]">Progress</p>
              <p className="text-xl font-bold text-white">{progressPercentage}%</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
