import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }) {
  return <div className={cn('animate-pulse rounded-card bg-surface-hover', className)} {...props} />;
}

export { Skeleton };
