import type { ProjectArchitectureResponse } from '@/client';
import ArchitectureEditor from '@/components/ArchitectureEditor';

export interface ArchitectureEditorWrapperProps {
  architecture: ProjectArchitectureResponse;
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
