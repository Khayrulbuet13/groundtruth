import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import { latestSyncCursor } from '../lib/sync';
import { ROUTES } from '../lib/routes';
import { cn } from '../lib/utils';
import { SHELL } from '../lib/layout';
import { Eyebrow, GhostButton, PrimaryButton } from '../components/controls';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';

export function ProfileScreen() {
  const { user, loading, logout } = useAuth();
  const [lastSync, setLastSync] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [logoutAllError, setLogoutAllError] = useState('');

  useEffect(() => {
    if (!user) return;
    latestSyncCursor().then(setLastSync).catch(() => setLastSync(null));
  }, [user]);

  const handleDeleteAccount = async () => {
    setDeleteError('');
    try {
      await api.deleteAccount();
      setDeleteOpen(false);
      logout();
    } catch {
      setDeleteError('Could not delete account. Try again.');
    }
  };

  const handleLogoutAll = async () => {
    setLogoutAllError('');
    try {
      await api.logoutAll();
      logout();
    } catch {
      setLogoutAllError('Could not log out everywhere. Try again.');
    }
  };

  // /profile is only linked from the logged-in avatar menu; a signed-out visit (deep link, stale
  // tab) has nothing to show. Wait for the session to resolve before redirecting so a logged-in
  // user who deep-links or refreshes is not bounced to home while the auth check is still in flight.
  if (loading) return null;
  if (!user) return <Navigate to={ROUTES.home} replace />;

  return (
    <div className={cn(SHELL, 'pb-16 pt-8')}>
      <Eyebrow className="mb-4">Profile</Eyebrow>

      <div className="mb-8 flex items-center gap-4 rounded-card border border-line bg-surface-raised p-5">
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="h-14 w-14 shrink-0 rounded-full" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-hover text-lg font-semibold text-ink-mid">
            {(user.display_name || user.email || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-ink-bright">{user.display_name}</div>
          <div className="truncate text-sm text-ink-dim">{user.email}</div>
          <div className="mt-0.5 text-xs text-ink-faint">{user.provider || 'oauth'}</div>
          <div className="mt-1 text-xs text-ink-faint">
            {lastSync ? `Last synced ${new Date(lastSync).toLocaleString()}` : 'Not synced yet'}
          </div>
        </div>
      </div>

      <Eyebrow className="mb-3">Account</Eyebrow>
      <div className="mb-8 rounded-card border border-line bg-surface-raised p-4">
        <div className="flex flex-wrap items-center gap-2">
          <GhostButton onClick={handleLogoutAll}>
            Log out everywhere
          </GhostButton>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <GhostButton className="text-wrong">Delete account</GhostButton>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete your account?</DialogTitle>
                <DialogDescription>
                  This permanently deletes your account and every synced quiz run. Quiz history stored only on
                  this device is not affected. This can&rsquo;t be undone.
                </DialogDescription>
              </DialogHeader>
              {deleteError && <p className="m-0 text-[12.5px] text-wrong">{deleteError}</p>}
              <DialogFooter>
                <PrimaryButton onClick={handleDeleteAccount}>
                  Confirm delete
                </PrimaryButton>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {logoutAllError && <p className="mt-2 text-[12.5px] text-wrong">{logoutAllError}</p>}
      </div>
    </div>
  );
}
