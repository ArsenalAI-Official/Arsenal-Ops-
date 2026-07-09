import { ArrowLeft, LogOut, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { avatarColor } from '@/lib/avatarColor';

interface PersonalTasksHeaderProps {
  userName?: string;
  showAdmin: boolean;
  onBack: () => void;
  onAdminClick: () => void;
  onLogout: () => void;
}

const PersonalTasksHeader = ({
  userName,
  showAdmin,
  onBack,
  onAdminClick,
  onLogout,
}: PersonalTasksHeaderProps) => {
  return (
    <header className="border-b border-[rgba(255,255,255,0.05)] bg-[#080808]/90 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-[1400px] mx-auto px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Personal Tasks</h1>
            <p className="text-xs text-[#737373] font-medium">Manage your personal tasks</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {userName &&
            (() => {
              const c = avatarColor(userName);
              return (
                <div className="flex items-center gap-2 mr-2">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                    style={{ backgroundColor: c.bg, color: c.fg, border: `1px solid ${c.ring}` }}
                  >
                    {userName?.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-[#a3a3a3] hidden md:block">{userName}</span>
                </div>
              );
            })()}
          {/* Admin nav link visibility uses the same admin-cap set as the
              /admin route guard (RequireAnyAdminCapability in App.tsx).
              Keeps link + route in sync via lib/adminCaps.ts. */}
          {showAdmin && (
            <Button
              variant="ghost"
              onClick={onAdminClick}
              className="text-[#737373] hover:text-white hover:bg-[rgba(244,246,255,0.05)] rounded-xl px-3"
            >
              <Settings className="w-4 h-4 mr-2" />
              Admin
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={onLogout}
            className="text-[#737373] hover:text-red-400 hover:bg-red-500/10 rounded-xl px-3"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
};

export default PersonalTasksHeader;
