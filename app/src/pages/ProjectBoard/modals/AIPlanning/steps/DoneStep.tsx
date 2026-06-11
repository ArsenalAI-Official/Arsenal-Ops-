import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DoneStepProps {
  createdTicketCount: number;
  onClose: () => void;
}

const DoneStep = ({ createdTicketCount, onClose }: DoneStepProps) => {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-20 h-20 rounded-full bg-[#E0B954]/20 flex items-center justify-center mb-6">
        <CheckCircle2 className="w-10 h-10 text-[#E0B954]" />
      </div>
      <h3 className="text-2xl font-bold text-white mb-2">All Done!</h3>
      <p className="text-[#a3a3a3] mb-6">
        <span className="text-2xl font-bold text-[#E0B954]">{createdTicketCount}</span> tickets
        created successfully
      </p>
      <Button
        onClick={onClose}
        className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-8"
      >
        View Board
      </Button>
    </div>
  );
};

export default DoneStep;
