import React from 'react';
import { useDroppable } from '@/lib/dnd';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface DroppableNavItemProps {
  id: string;
  data?: any;
  className?: string;
  children: React.ReactNode;
}

export function DroppableNavItem({ id, data, className, children }: DroppableNavItemProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    type: 'folder',
    ...data,
  });

  return (
    <div
      ref={setNodeRef}
      className={twMerge(
        clsx(
          "relative rounded-lg transition-all duration-200",
          isOver && "ring-2 ring-[var(--umbra-accent)] bg-[var(--umbra-accent)]/20 scale-105 z-50",
          className
        )
      )}
    >
      {children}
      {isOver && (
        <div className="absolute inset-0 bg-[var(--umbra-accent)]/10 rounded-lg animate-pulse pointer-events-none" />
      )}
    </div>
  );
}
