import { NavLink } from 'react-router-dom';
import { Home, BarChart3, Layers } from 'lucide-react';
import { ROUTES } from '../lib/routes';

const ITEMS = [
  { to: ROUTES.home, label: 'Home', Icon: Home, end: true },
  { to: ROUTES.progress, label: 'Progress', Icon: BarChart3 },
  { to: ROUTES.decks, label: 'Decks', Icon: Layers },
];

/** Mobile-only tab bar. Hidden on desktop and during an active quiz (caller decides when to mount it). */
export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-safe backdrop-blur sm:hidden">
      {ITEMS.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            [
              'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors',
              isActive ? 'text-accent' : 'text-ink-dim hover:text-ink',
            ].join(' ')
          }
        >
          <Icon size={20} strokeWidth={1.75} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
