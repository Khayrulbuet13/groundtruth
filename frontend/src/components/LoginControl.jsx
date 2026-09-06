import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, LogOut } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { ROUTES } from '../lib/routes';
import { GhostButton } from './controls';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';

const AUTH_ERRORS = {
  access_denied: 'Sign-in was cancelled.',
  oauth_failed: 'Sign-in failed. Try again.',
  provider_mismatch: 'Sign-in failed (provider mismatch).',
  missing_code: 'Sign-in failed (missing authorization).',
};

export function LoginControl() {
  const { user, loading, error, login, loginDev, logout } = useAuth();
  const navigate = useNavigate();
  const [authError, setAuthError] = useState(null);
  const isLocal =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('auth_error');
    if (err) {
      setAuthError(AUTH_ERRORS[err] || 'Sign-in failed.');
      params.delete('auth_error');
      const qs = params.toString();
      window.history.replaceState({}, '', qs ? `?${qs}` : window.location.pathname);
    }
  }, []);

  if (loading) {
    return <span className="text-[12px] text-ink-dim">…</span>;
  }

  if (user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Height comes from the shared control scale; width is content-driven because the
              display name is shown from `sm:` up and a fixed width would clip it. */}
          <button
            type="button"
            aria-label="Account menu"
            className="flex h-9 min-w-0 max-w-[180px] shrink cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-transparent px-1 transition-colors hover:bg-surface-hover coarse:h-11"
          >
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" className="h-7 w-7 shrink-0 rounded-full" />
            ) : (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-hover text-ink-mid">
                <User size={15} />
              </span>
            )}
            <span className="hidden truncate text-[13px] text-ink-mid sm:inline">
              {user.display_name}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => navigate(ROUTES.profile)} className="gap-2">
            <User className="h-4 w-4" /> Profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={logout} className="gap-2">
            <LogOut className="h-4 w-4" /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="relative flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <GhostButton size="sm">
            Log in
          </GhostButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => login('google')}>
            Continue with Google
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => login('github')}>
            Continue with GitHub
          </DropdownMenuItem>
          {isLocal && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={loginDev}>
                Dev login
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {(authError || error) && (
        <span className="absolute right-0 top-full mt-1 whitespace-nowrap text-[11px] text-wrong">
          {authError || error}
        </span>
      )}
    </div>
  );
}
