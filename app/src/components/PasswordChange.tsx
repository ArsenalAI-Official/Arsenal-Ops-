import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function PasswordChange() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { changePassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      await changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-[#080808] border-[rgba(255,255,255,0.07)]">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center">
              <Lock className="w-6 h-6 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-white text-center">
            Change Password
          </CardTitle>
          <CardDescription className="text-[#737373] text-center">
            Please change your temporary password to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 p-4 bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.2)] rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#F59E0B] mt-0.5" />
              <div className="text-xs text-[#a3a3a3]">
                <p className="font-medium text-[#F59E0B] mb-1">Security Requirement</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Minimum 8 characters</li>
                  <li>Include uppercase and lowercase letters</li>
                  <li>Include at least one number</li>
                  <li>Include at least one special character</li>
                </ul>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword" className="text-[#a3a3a3]">
                Current Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#737373]" />
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? 'text' : 'password'}
                  placeholder="Enter your current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="pl-10 pr-10 bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] placeholder:text-[#737373]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#737373] hover:text-white"
                >
                  {showCurrentPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-[#a3a3a3]">
                New Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#737373]" />
                <Input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-10 pr-10 bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] placeholder:text-[#737373]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#737373] hover:text-white"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-[#a3a3a3]">
                Confirm New Password
              </Label>
              <div className="relative">
                <CheckCircle2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#737373]" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] placeholder:text-[#737373]"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white font-medium"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Updating...
                </>
              ) : (
                'Change Password'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
