import { forwardRef } from 'react';
import { cn } from '../lib/utils';

/**
 * One size scale for every action control in the app. Height is fixed (not derived from
 * padding + line-height) so a bordered GhostButton and a borderless PrimaryButton sitting
 * side by side measure the same. `md` is the default and clears the 44px touch target.
 */
export const CONTROL_SIZES = {
  // `sm` is compact for a mouse and grows to the 44px touch minimum on any coarse pointer,
  // phone or tablet. `md`/`lg` already clear 44px for everyone.
  sm: 'h-9 gap-1.5 px-3.5 text-[13px] coarse:h-11',
  md: 'h-11 gap-2 px-[18px] text-sm',
  lg: 'h-12 gap-2 px-6 text-[15px]',
};

/** Shared by every button variant: identical box model, identical disabled behaviour. */
const BUTTON_BASE =
  'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-card border border-transparent font-semibold leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-55';

function buttonClass(size, variant, className) {
  return cn(BUTTON_BASE, CONTROL_SIZES[size] ?? CONTROL_SIZES.md, variant, className);
}

export const PrimaryButton = forwardRef(function PrimaryButton(
  { children, size = 'md', className = '', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={buttonClass(
        size,
        'cursor-pointer bg-accent text-on-accent hover:brightness-110 disabled:bg-surface-hover disabled:text-ink-faint disabled:hover:brightness-100',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export const NeutralButton = forwardRef(function NeutralButton(
  { children, size = 'md', className = '', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={buttonClass(
        size,
        'cursor-pointer bg-ink text-surface hover:bg-ink-bright disabled:bg-surface-hover disabled:text-ink-faint',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export const GhostButton = forwardRef(function GhostButton(
  { children, size = 'md', className = '', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={buttonClass(
        size,
        'cursor-pointer border-line-strong bg-transparent font-medium text-ink-mid hover:border-line-hover hover:text-ink-bright',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

/**
 * Quiet text action (links styled as buttons). Kept on the same height scale as the solid
 * buttons so a row mixing the two lines up.
 */
export const TextButton = forwardRef(function TextButton(
  { children, size = 'md', className = '', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-card border-none bg-transparent font-medium text-accent transition-colors hover:text-accent-hi disabled:cursor-not-allowed disabled:opacity-55',
        CONTROL_SIZES[size] ?? CONTROL_SIZES.md,
        'px-2',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

/**
 * Icon-only control. Square, and big enough to hit with a thumb on touch — the visual size
 * stays small on pointer devices where 44px would look oversized.
 */
export const IconButton = forwardRef(function IconButton(
  { children, active = false, className = '', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent transition-colors coarse:h-11 coarse:w-11',
        active ? 'bg-accent-wash text-accent' : 'text-ink-dim hover:bg-surface-hover hover:text-ink',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

/** Segmented picker. Every segment is the same height as the other controls on its row. */
export function Segmented({ options, value, onChange, mono = false, className = '' }) {
  return (
    <div
      role="group"
      className={cn(
        'inline-flex max-w-full flex-wrap gap-[3px] rounded-card border border-line-strong bg-surface p-[3px]',
        className
      )}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex h-9 min-w-[44px] cursor-pointer items-center justify-center rounded-chip px-3 text-[12.5px] leading-none transition-colors coarse:h-11',
              mono && 'font-mono',
              active ? 'bg-accent font-semibold text-on-accent' : 'text-ink-mid hover:bg-surface-hover hover:text-ink'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Track is 26px for looks; the button around it is 44px so it is thumb-sized. */
export function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent"
    >
      <span
        className={cn(
          'flex h-[26px] w-[46px] rounded-full p-[3px] transition-colors',
          checked ? 'justify-end bg-accent' : 'justify-start bg-line-strong'
        )}
      >
        <span className={cn('h-5 w-5 rounded-full', checked ? 'bg-surface' : 'bg-ink-mid')} />
      </span>
    </button>
  );
}

/**
 * Text field / textarea skin. Inputs used to be styled ad-hoc at each call site, so the two
 * textareas in the app had different padding, type size and font family.
 */
export const FIELD =
  'w-full rounded-card border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent';

export function Checkbox({ checked }) {
  return checked ? (
    <span className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-chip bg-accent text-[11px] font-bold text-on-accent">
      ✓
    </span>
  ) : (
    <span className="h-[17px] w-[17px] shrink-0 rounded-chip border-[1.5px] border-line-strong" />
  );
}

export function Eyebrow({ children, className = '' }) {
  return <div className={cn('font-mono text-eyebrow uppercase text-ink-dim', className)}>{children}</div>;
}
