import React from 'react';
import { cn } from '@/src/lib/utils';

interface NeuCardProps extends React.HTMLAttributes<HTMLDivElement> {
  inset?: boolean;
  glow?: 'red' | 'yellow' | 'none';
  variant?: 'glass' | 'neu-flat' | 'neu-pressed';
}

export function NeuCard({ inset, glow = 'none', variant = 'glass', className, children, ...props }: NeuCardProps) {
  return (
    <div
      className={cn(
        variant,
        'p-6 overflow-hidden relative',
        glow === 'red' && 'shadow-[0_0_20px_rgba(239,68,68,0.2)]',
        glow === 'yellow' && 'shadow-[0_0_20px_rgba(191,161,129,0.2)]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
