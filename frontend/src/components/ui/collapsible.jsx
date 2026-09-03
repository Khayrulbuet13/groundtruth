import * as React from 'react';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';

import { cn } from '@/lib/utils';

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = React.forwardRef(function CollapsibleTrigger(
  { className, ...props },
  ref
) {
  return <CollapsiblePrimitive.CollapsibleTrigger ref={ref} className={cn(className)} {...props} />;
});

const CollapsibleContent = React.forwardRef(function CollapsibleContent(
  { className, ...props },
  ref
) {
  return <CollapsiblePrimitive.CollapsibleContent ref={ref} className={cn(className)} {...props} />;
});

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
