import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { X, Save, RotateCcw, Sparkles, Send, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import MermaidRenderer from './MermaidRenderer';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import type { ProjectArchitectureResponse } from '@/client';

import { API_BASE_URL } from '@/config/api';

interface ArchitectureEditorProps {
  architecture: ProjectArchitectureResponse;
  onSave: (
    id: number,
    updates: { mermaid_code?: string; name?: string; description?: string },
  ) => void;
  onClose: () => void;
}

const ArchitectureEditor = ({ architecture, onSave, onClose }: ArchitectureEditorProps) => {
  const { token } = useAuth();
  const [code, setCode] = useState(architecture.mermaid_code);
  const [name, setName] = useState(architecture.name);
  const [description, setDescription] = useState(architecture.description ?? '');
  const [originalCode] = useState(architecture.mermaid_code);
  const [isSaving, setIsSaving] = useState(false);

  // AI Refine state
  const [changeInstructions, setChangeInstructions] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [changesApplied, setChangesApplied] = useState<string[]>([]);
  const [aiNotes, setAiNotes] = useState('');

  const hasChanges =
    code !== originalCode || name !== architecture.name || description !== architecture.description;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(architecture.id, { mermaid_code: code, name, description });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setCode(originalCode);
    setName(architecture.name);
    setDescription(architecture.description ?? '');
    setChangesApplied([]);
    setAiNotes('');
  };

  // AI Refine - send plain English instructions to AI
  const handleAIRefine = async () => {
    if (!changeInstructions.trim()) {
      toast.error('Please describe the changes you want to make');
      return;
    }

    setIsRefining(true);
    setChangesApplied([]);
    setAiNotes('');

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/prd/architectures/${architecture.id}/ai-refine`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            current_mermaid_code: code,
            change_instructions: changeInstructions,
          }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        setCode(data.architecture.mermaid_code);
        if (data.architecture.description) {
          setDescription(data.architecture.description);
        }
        setChangesApplied(data.changes_applied || []);
        setAiNotes(data.ai_notes || '');
        setChangeInstructions('');
        toast.success('Architecture updated with AI!');
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to refine architecture');
      }
    } catch (err) {
      toast.error('Failed to connect to AI service');
    } finally {
      setIsRefining(false);
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-[#080808] flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-[rgba(255,255,255,0.07)] bg-[#080808] flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="w-px h-6 bg-[rgba(255,255,255,0.07)]" />
          <div className="flex items-center gap-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-transparent border-none text-lg font-semibold text-white h-9 w-64 focus:ring-0"
              placeholder="Architecture Name"
            />
            <span className="text-xs text-[#737373] capitalize px-2 py-1 rounded bg-[rgba(244,246,255,0.05)]">
              {architecture.architecture_type}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-[#737373] hover:text-white"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="bg-[#E0B954] hover:bg-[#C79E3B] text-white"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Description */}
      <div className="h-12 border-b border-[rgba(255,255,255,0.05)] bg-[#080808]/50 flex items-center px-4">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="bg-transparent border-none text-sm text-[#a3a3a3] h-8 w-full focus:ring-0"
          placeholder="Architecture description..."
        />
      </div>

      {/* AI Refine Panel */}
      <div className="border-b border-[rgba(255,255,255,0.05)] bg-gradient-to-r from-[#E0B954]/5 to-transparent">
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-[#E0B954]" />
            <span className="text-sm font-medium text-white">AI Architecture Refine</span>
            <span className="text-xs text-[#737373]">Describe changes in plain English</span>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <Textarea
                value={changeInstructions}
                onChange={(e) => setChangeInstructions(e.target.value)}
                placeholder="e.g., Add a Redis cache between API and database, Replace MySQL with PostgreSQL, Add a load balancer, Include message queue for async processing..."
                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.08)] text-[#F4F6FF] rounded-lg min-h-[60px] max-h-[80px] text-sm placeholder:text-[#737373] resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleAIRefine();
                  }
                }}
              />
            </div>
            <Button
              onClick={handleAIRefine}
              disabled={isRefining || !changeInstructions.trim()}
              className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white h-[60px] px-6 self-start"
            >
              {isRefining ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Refining...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Refine
                </>
              )}
            </Button>
          </div>
          <p className="text-[10px] text-[#737373] mt-1">Press Cmd+Enter or Ctrl+Enter to submit</p>

          {/* Changes Applied */}
          {changesApplied.length > 0 && (
            <div className="mt-3 p-3 bg-[#E0B954]/10 border border-[#E0B954]/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-[#E0B954]" />
                <span className="text-sm font-medium text-[#E0B954]">Changes Applied</span>
              </div>
              <ul className="space-y-1">
                {changesApplied.map((change, i) => (
                  <li key={i} className="text-xs text-[#a3a3a3] flex items-start gap-2">
                    <span className="text-[#E0B954]">+</span>
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
              {aiNotes && (
                <p className="text-xs text-[#737373] mt-2 italic border-t border-[#E0B954]/20 pt-2">
                  AI Notes: {aiNotes}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content - Split View */}
      <div className="flex flex-1 overflow-hidden">
        {/* Code Editor */}
        <div className="w-1/2 border-r border-[rgba(255,255,255,0.07)] flex flex-col">
          <div className="h-10 border-b border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] flex items-center justify-between px-4">
            <span className="text-xs font-medium text-[#737373]">Mermaid Code</span>
            <span className="text-xs text-[#737373]">{code.split('\n').length} lines</span>
          </div>
          <div className="flex-1">
            <Editor
              height="100%"
              defaultLanguage="markdown"
              value={code}
              onChange={(value) => setCode(value || '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 16, bottom: 16 },
                fontFamily: 'JetBrains Mono, Fira Code, monospace',
              }}
            />
          </div>
        </div>

        {/* Preview */}
        <div className="w-1/2 flex flex-col bg-[#080808]">
          <div className="h-10 border-b border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] flex items-center px-4">
            <span className="text-xs font-medium text-[#737373]">Preview</span>
            <span className="text-xs text-[#737373] ml-auto">Drag to pan • Scroll to zoom</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <MermaidRenderer code={code} className="w-full h-full" />
          </div>
        </div>
      </div>

      {/* Info Bar */}
      <div className="h-8 border-t border-[rgba(255,255,255,0.05)] bg-[#080808] flex items-center justify-between px-4 text-xs text-[#737373] flex-shrink-0">
        <div className="flex items-center gap-4">
          <span>
            Cost: <span className="text-[#E0B954]">{architecture.estimated_cost}</span>
          </span>
          <span>
            Complexity: <span className="text-[#F59E0B] capitalize">{architecture.complexity}</span>
          </span>
          <span>
            Timeline: <span className="text-[#E0B954]">{architecture.time_to_implement}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span>
            Press{' '}
            <kbd className="px-1.5 py-0.5 bg-[rgba(255,255,255,0.08)] rounded text-[#a3a3a3]">
              Esc
            </kbd>{' '}
            to close
          </span>
        </div>
      </div>
    </div>
  );
};

export default ArchitectureEditor;
