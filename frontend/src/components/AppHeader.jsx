export function AppHeader({ children, trailing, onHome }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/[0.93] backdrop-blur">
      <div className="mx-auto flex max-w-shell items-center gap-3 px-4 py-[13px] sm:px-7">
        <button
          type="button"
          onClick={onHome}
          aria-label="Home"
          className="flex min-h-[44px] shrink-0 cursor-pointer items-center border-none bg-transparent p-0 font-mono text-sm font-bold tracking-[-0.01em] text-ink sm:min-h-0"
        >
          groundtruth
        </button>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-3 sm:gap-4">
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
      className={[
        'min-h-[44px] cursor-pointer border-none bg-transparent px-1 py-1.5 text-[13px] text-ink-mid transition-colors hover:text-ink sm:min-h-0',
        hideOnMobile ? 'hidden sm:inline-flex sm:items-center' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
