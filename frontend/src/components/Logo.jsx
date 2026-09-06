import { cn } from '../lib/utils';

/**
 * The groundtruth mark: a registration crosshair — the reference point everything is
 * measured against. Drawn in `currentColor` (not the raw accent) so it inherits whatever
 * the surrounding text uses and works in both themes.
 *
 * The standalone tile version lives in `public/favicon.svg`; keep the two in sync.
 */
export function Logo({ size = 20, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <g stroke="currentColor" strokeWidth="5" strokeLinecap="round">
        <circle cx="32" cy="32" r="12.5" />
        <path d="M32 7.5v7M32 49.5v7M7.5 32h7M49.5 32h7" />
      </g>
      <circle cx="32" cy="32" r="4.5" fill="currentColor" />
    </svg>
  );
}
