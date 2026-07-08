import { Sparkles } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

const AnalyzingStep = () => {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.12)] flex items-center justify-center mb-6 animate-pulse">
        <Sparkles className="w-8 h-8 text-muted-foreground" />
      </div>
      <Spinner size="xl" className="mb-6" />
      <h3 className="text-xl font-semibold text-white mb-2">AI is analyzing your project</h3>
      <p className="text-[#737373] text-center max-w-md">
        Performing cost analysis, recommending tools, and generating architecture options...
      </p>
    </div>
  );
};

export default AnalyzingStep;
