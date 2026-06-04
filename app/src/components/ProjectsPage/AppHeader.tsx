import { Settings, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { hasAnyAdminCapability } from '@/lib/adminCaps';
import arsenalOpsLogo from '@/assets/images/arsenal-ops-logo.webp';

interface AppHeaderProps {
  user: { name: string; role: string } | null;
  onAdminClick: () => void;
  onLogout: () => void;
}

const AppHeader = ({ user, onAdminClick, onLogout }: AppHeaderProps) => {
  const { can } = useAuth();
  return (
    <header className="border-b border-[rgba(255,255,255,0.05)] bg-[#080808]/90 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-[1400px] mx-auto px-8 py-5 flex items-center justify-between">
        <img
          src={arsenalOpsLogo}
          alt="Arsenal Ops"
          className="h-11 w-auto"
          width={1043}
          height={198}
          loading="eager"
          // @ts-expect-error — fetchpriority is a valid HTML attr that React 18 lower-cases
          fetchpriority="high"
          decoding="async"
        />
        <div className="flex items-center gap-3">
          {user && (
            <div className="flex items-center gap-2 mr-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center text-[#080808] text-sm font-medium">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-[#a3a3a3] hidden md:block">{user.name}</span>
            </div>
          )}
          {/* Admin nav link visibility uses the same admin-cap set as the
              /admin route guard (RequireAnyAdminCapability in App.tsx).
              Keeps link + route in sync via lib/adminCaps.ts. */}
          {hasAnyAdminCapability(can) && (
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
            Logout
            <LogOut className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
