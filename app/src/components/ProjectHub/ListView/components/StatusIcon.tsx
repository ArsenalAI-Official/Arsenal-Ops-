import { CheckCircle2, Clock, AlertCircle, Circle } from 'lucide-react';
import { getStatusColor } from '@/lib/workItemConfig';

export const getStatusIcon = (status: string) => {
  switch (status) {
    case 'done':
      return <CheckCircle2 className="w-4 h-4" style={{ color: getStatusColor('done') }} />;
    case 'in_progress':
      return <Clock className="w-4 h-4" style={{ color: getStatusColor('in_progress') }} />;
    case 'in_review':
      return <AlertCircle className="w-4 h-4" style={{ color: getStatusColor('in_review') }} />;
    default:
      return <Circle className="w-4 h-4 text-[#737373]" />;
  }
};
