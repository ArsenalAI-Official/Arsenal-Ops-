import { GitCommit } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

const CommittingStep = () => {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center mb-6">
        <GitCommit className="w-8 h-8 text-white" />
      </div>
      <Spinner size="xl" className="mb-6" />
      <h3 className="text-xl font-semibold text-white mb-2">Creating Tickets</h3>
      <p className="text-[#737373] text-center max-w-md">
        Adding tickets to your board and assigning to team members...
      </p>
    </div>
  );
};

export default CommittingStep;
