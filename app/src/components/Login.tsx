import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Lock, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { API_BASE_URL } from '@/config/api';

declare global {
  interface Window {
    google: any;
  }
}

export function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const { loginWithGoogle } = useAuth();

  // Load Google Sign-In SDK and wait for it to be ready
  useEffect(() => {
    // Fetch Google Client ID from backend first
    const fetchGoogleConfig = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/google/config`);
        if (response.ok) {
          const data = await response.json();
          (window as any).GOOGLE_CLIENT_ID = data.client_id;

          // Load Google Sign-In script
          if (!window.google) {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;

            script.onload = () => {
              // Initialize Google Sign-In
              if (window.google?.accounts?.id) {
                window.google.accounts.id.initialize({
                  client_id: data.client_id,
                  callback: handleGoogleSignIn,
                });
                setGoogleReady(true);
              }
            };

            document.head.appendChild(script);
          } else if (window.google?.accounts?.id) {
            window.google.accounts.id.initialize({
              client_id: data.client_id,
              callback: handleGoogleSignIn,
            });
            setGoogleReady(true);
          }
        }
      } catch (error) {
        console.error('Failed to load Google config:', error);
        setError('Failed to load Google Sign-In. Please refresh the page.');
      }
    };

    fetchGoogleConfig();
  }, []);

  // Handle Google Sign-In callback
  const handleGoogleSignIn = async (response: any) => {
    if (response.credential) {
      setIsLoading(true);
      setError(null);
      try {
        await loginWithGoogle(response.credential);
        toast.success('Login successful!');
        // The redirect will be handled by App.tsx useEffect
      } catch (error: any) {
        const errorMessage = error.message || 'Google login failed';
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Trigger Google Sign-In
  const handleSignInClick = () => {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
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
          <CardTitle className="text-2xl font-bold text-white text-center">Arsenal Ops</CardTitle>
          <CardDescription className="text-[#737373] text-center">
            Sign in with your Google account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Custom Google Sign-In Button */}
          <button
            onClick={handleSignInClick}
            disabled={isLoading || !googleReady}
            className="w-full py-3 px-4 bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#9d7722] disabled:from-[#737373] disabled:to-[#737373] text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing in...
              </>
            ) : !googleReady ? (
              'Loading Google Sign-In...'
            ) : (
              'Sign in with Google'
            )}
          </button>

          <div className="mt-6 p-4 bg-[rgba(224,185,84,0.1)] border border-[rgba(224,185,84,0.2)] rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#E0B954] mt-0.5" />
              <p className="text-xs text-[#a3a3a3]">
                Sign in with your Google account to access Arsenal Ops. New accounts will be
                automatically created on first login.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
