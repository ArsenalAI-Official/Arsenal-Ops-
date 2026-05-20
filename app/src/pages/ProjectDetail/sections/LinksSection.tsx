import { useState, useEffect, useRef } from 'react';
import { Link2, Plus, ExternalLink, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ProjectLink {
  id: number;
  name: string;
  url: string;
  created_at?: string;
}

interface LinksSectionProps {
  links: ProjectLink[];
  isLoading: boolean;
  onAddLink: (link: { name: string; url: string }) => void;
  onDeleteLink: (linkId: number) => void;
}

const LinksSection = ({ links, isLoading, onAddLink, onDeleteLink }: LinksSectionProps) => {
  const [showAddLink, setShowAddLink] = useState(false);
  const [newLink, setNewLink] = useState({ name: '', url: '' });
  const addLinkFormRef = useRef<HTMLDivElement>(null);

  // Scroll to add link form when it opens
  useEffect(() => {
    if (showAddLink && addLinkFormRef.current) {
      addLinkFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [showAddLink]);

  const handleAddLink = () => {
    if (!newLink.name || !newLink.url) return;
    onAddLink(newLink);
    setNewLink({ name: '', url: '' });
    setShowAddLink(false);
  };

  return (
    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 mb-4 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E0B954]/10 flex items-center justify-center">
            <Link2 className="w-5 h-5 text-[#E0B954]" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Resources</h3>
            <p className="text-xs text-[#737373]">Useful links and resources</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAddLink(!showAddLink)}
          className="text-[#E0B954] hover:bg-[#E0B954]/10"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Link
        </Button>
      </div>

      {/* Add Link Form */}
      {showAddLink && (
        <div
          ref={addLinkFormRef}
          className="bg-[rgba(255,255,255,0.01)] border border-[rgba(224,185,84,0.2)] rounded-xl p-4 mb-4"
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1.5">
                Link Name
              </label>
              <Input
                value={newLink.name}
                onChange={(e) => setNewLink((l) => ({ ...l, name: e.target.value }))}
                placeholder="e.g., API Documentation"
                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1.5">URL</label>
              <Input
                value={newLink.url}
                onChange={(e) => setNewLink((l) => ({ ...l, url: e.target.value }))}
                placeholder="https://example.com"
                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAddLink(false);
                  setNewLink({ name: '', url: '' });
                }}
                className="text-[#737373] hover:text-white"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddLink}
                disabled={!newLink.name || !newLink.url}
                className="bg-[#E0B954] hover:bg-[#C79E3B] text-white rounded-xl disabled:opacity-50"
              >
                Add Link
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Links List */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className="h-12 bg-[rgba(255,255,255,0.02)] rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : links.length > 0 ? (
        <div className="space-y-2">
          {links.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between p-3 bg-[rgba(255,255,255,0.01)] border border-[rgba(255,255,255,0.04)] rounded-lg hover:bg-[rgba(255,255,255,0.02)] transition"
            >
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 flex-1 min-w-0"
              >
                <ExternalLink className="w-4 h-4 text-[#E0B954] flex-shrink-0" />
                <span className="text-sm text-[#E0B954] hover:underline truncate">
                  {link.name}
                </span>
              </a>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDeleteLink(link.id)}
                className="text-red-400 hover:text-red-300 hover:bg-red-400/10 ml-2"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6">
          <p className="text-sm text-[#737373]">No links added yet</p>
        </div>
      )}
    </div>
  );
};

export default LinksSection;
