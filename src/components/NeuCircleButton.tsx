import React, { useState } from 'react';
import { cn } from '@/src/lib/utils';
import { motion, useAnimation, HTMLMotionProps } from 'motion/react';

interface NeuCircleButtonProps extends Omit<HTMLMotionProps<"button">, "onDragStart" | "onDragEnd"> {
  size?: number;
  glow?: 'red' | 'yellow' | 'none';
}

export function NeuCircleButton({ size = 120, glow = 'none', className, onClick, children, ...props }: NeuCircleButtonProps) {
  const [isPressed, setIsPressed] = useState(false);
  const controls = useAnimation();

  const handlePointerDown = () => {
    setIsPressed(true);
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100, 50, 200]);
    }
    controls.start({ scale: 0.95 });
  };

  const handlePointerUp = (e: React.MouseEvent<HTMLButtonElement>) => {
    setIsPressed(false);
    controls.start({ scale: 1 });
    if (onClick) onClick(e);
  };

  return (
    <motion.button
      animate={controls}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => { setIsPressed(false); controls.start({ scale: 1 }); }}
      style={{ width: size, height: size }}
      className={cn(
        'rounded-full flex items-center justify-center transition-all duration-300',
        isPressed ? 'neu-pressed' : 'neu-flat',
        glow === 'red' ? 'text-red-500 font-bold' :
        glow === 'yellow' ? 'text-accent font-bold' :
        'text-text font-bold',
        className
      )}
      {...props}
    >
      <div className={cn("w-full h-full rounded-full flex items-center justify-center", 
        glow === 'red' && isPressed ? 'shadow-[inset_0_0_30px_rgba(239,68,68,0.2)] bg-red-500/5' : '',
        glow === 'red' && !isPressed ? 'shadow-[0_0_30px_rgba(239,68,68,0.1)]' : '',
      )}>
        {children as React.ReactNode}
      </div>
    </motion.button>
  );
}
