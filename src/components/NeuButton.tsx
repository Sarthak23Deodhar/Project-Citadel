import React from 'react';
import { cn } from '@/src/lib/utils';

interface NeuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  variant?: 'glass' | 'neu-flat' | 'neu-pressed' | 'primary';
}

export function NeuButton({ active, variant = 'neu-flat', className, children, ...props }: NeuButtonProps) {
  return (
    <button
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all active:scale-95 duration-200 uppercase tracking-widest',
        variant !== 'primary' ? variant : '',
        variant === 'primary' ? 'bg-accent text-white shadow-md shadow-accent/20 hover:shadow-accent/40' : '',
        active 
          ? 'neu-pressed text-accent' 
          : 'text-text-muted hover:text-text',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
