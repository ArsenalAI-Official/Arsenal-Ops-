import ArchitectureEditor from '@/components/ArchitectureEditor';

interface Architecture {
  id: number;
  name: string;
  description: string;
  architecture_type: string;
  mermaid_code: string;
  pros: string[];
  cons: string[];
  estimated_cost: string;
  complexity: string;
  time_to_implement: string;
  is_selected: boolean;
}

export interface ArchitectureEditorWrapperProps {
  architecture: Architecture;
  onSave: (
    archId: number,
    updates: { mermaid_code?: string; name?: string; description?: string },
  ) => Promise<void>;
  onClose: () => void;
}

const ArchitectureEditorWrapper = ({
  architecture,
  onSave,
  onClose,
}: ArchitectureEditorWrapperProps) => (
  <ArchitectureEditor architecture={architecture} onSave={onSave} onClose={onClose} />
);

export default ArchitectureEditorWrapper;
