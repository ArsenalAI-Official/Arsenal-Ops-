import { Layers, Settings, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface AppHeaderProps {
    user: { name: string; role: string } | null;
    onAdminClick: () => void;
    onLogout: () => void;
}

const AppHeader = ({ user, onAdminClick, onLogout }: AppHeaderProps) => {
    return (
        <header className="border-b border-[rgba(255,255,255,0.05)] bg-[#080808]/90 backdrop-blur-xl sticky top-0 z-50">
            <div className="max-w-[1400px] mx-auto px-8 py-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#E0B954] via-[#B8872A] to-[#4338CA] flex items-center justify-center shadow-lg shadow-[#B8872A]/25">
                        <Layers className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-white">Arsenal Ops</h1>
                        <p className="text-xs text-[#737373] font-medium">Project Management</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {user && (
                        <div className="flex items-center gap-2 mr-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center text-[#080808] text-sm font-medium">
                                {user.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm text-[#a3a3a3] hidden md:block">{user.name}</span>
                        </div>
                    )}
                    {user?.role.includes('admin') && (
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
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 px-3 py-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2 animate-pulse" />
                        Online
                    </Badge>
                </div>
            </div>
        </header>
    );
};

export default AppHeader;
