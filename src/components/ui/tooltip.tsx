import * as React from 'react';
import { cn } from '@/lib/ui-utils';

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  className?: string;
}

function Tooltip({ children, content, className }: TooltipProps) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className={cn(
            'absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 overflow-hidden rounded-md bg-zinc-900 border border-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-200 shadow-md animate-in fade-in-0 zoom-in-95 pointer-events-none whitespace-nowrap',
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}

const TooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;
const TooltipTrigger: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;
const TooltipContent: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('z-50 rounded-md bg-zinc-900 border border-zinc-800 px-2.5 py-1 text-[11px] text-zinc-200 shadow-md', className)}>
    {children}
  </div>
);

export { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent };
