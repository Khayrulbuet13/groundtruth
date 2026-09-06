import { cn } from '../lib/utils';
import { SHELL } from '../lib/layout';
import { Logo } from './Logo';

/** Every direct child of the header row is this tall, so the row has one baseline. */
const HEADER_CONTROL = 'inline-flex h-9 items-center coarse:h-11';

export function AppHeader({ children, trailing, onHome }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/[0.93] backdrop-blur">
      {/* No flex-wrap: a long name or an error message must never push the header to a
          second row and land on top of the page content underneath it. */}
      <div className={cn(SHELL, 'flex items-center gap-3 py-2')}>
        <button
          type="button"
          onClick={onHome}
          aria-label="Home"
          className={cn(
            HEADER_CONTROL,
            'shrink-0 cursor-pointer gap-2 border-none bg-transparent p-0 font-mono text-sm font-bold tracking-[-0.01em] text-ink transition-colors hover:text-accent'
          )}
        >
          <Logo size={19} className="text-accent" />
          groundtruth
        </button>
        <div className="ml-auto flex min-w-0 items-center justify-end gap-1 sm:gap-2">
          {children}
          {trailing}
        </div>
      </div>
    </header>
  );
}

/** `hideOnMobile` drops links that duplicate a BottomNav tab, so the mobile header stays to wordmark + avatar. */
export function HeaderLink({ children, onClick, hideOnMobile = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        HEADER_CONTROL,
        'shrink-0 cursor-pointer whitespace-nowrap rounded-card border-none bg-transparent px-2 text-[13px] text-ink-mid transition-colors hover:text-ink',
        hideOnMobile && 'hidden sm:inline-flex'
      )}
    >
      {children}
    </button>
  );
}
