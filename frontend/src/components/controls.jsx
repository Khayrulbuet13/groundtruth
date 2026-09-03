import { forwardRef } from 'react';

export function Segmented({ options, value, onChange, mono = false }) {
  return (
    <div className="flex gap-[3px] rounded-card border border-line-strong bg-surface p-[3px]">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={[
              'cursor-pointer rounded-chip px-[13px] py-[7px] text-[12.5px] transition-colors',
              mono ? 'font-mono' : '',
              active ? 'bg-ink font-semibold text-surface' : 'text-ink-mid hover:text-ink',
            ].join(' ')}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        'flex h-[26px] w-[46px] shrink-0 cursor-pointer rounded-full p-[3px] transition-colors',
        checked ? 'justify-end bg-accent' : 'justify-start bg-line-strong',
      ].join(' ')}
    >
      <span className={['h-5 w-5 rounded-full', checked ? 'bg-surface' : 'bg-ink-mid'].join(' ')} />
    </button>
  );
}

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
  return (
    <div className={`font-mono text-eyebrow uppercase text-ink-dim ${className}`}>{children}</div>
  );
}

export const PrimaryButton = forwardRef(function PrimaryButton(
  { children, disabled, className = '', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      className={[
        'shrink-0 rounded-card border-none font-semibold transition-colors',
        disabled ? 'cursor-not-allowed bg-surface-hover text-ink-faint' : 'cursor-pointer bg-accent text-on-accent hover:brightness-110',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
});

export const NeutralButton = forwardRef(function NeutralButton({ children, className = '', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={`shrink-0 cursor-pointer rounded-card border-none bg-ink font-semibold text-surface transition-colors hover:bg-ink-bright ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});

export const GhostButton = forwardRef(function GhostButton({ children, className = '', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={`shrink-0 cursor-pointer rounded-card border border-line-strong bg-transparent font-medium text-ink-mid transition-colors hover:border-line-hover hover:text-ink-bright ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
