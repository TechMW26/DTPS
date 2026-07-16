'use client';

import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

/**
 * Gradient shimmer skeleton used while AI is generating content.
 * Renders a pulsing gradient bar with optional label + sparkle icon.
 */
export function AISkeleton({
  className,
  label,
  style,
}: {
  className?: string;
  label?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={cn('relative overflow-hidden rounded-md', className)} style={style}>
      <div className="absolute inset-0 bg-gradient-to-r from-purple-100 via-blue-100 to-purple-100 dark:from-purple-900/30 dark:via-blue-900/30 dark:to-purple-900/30 animate-ai-shimmer bg-[length:200%_100%]" />
      {label && (
        <div className="relative flex items-center justify-center gap-1.5 py-1 text-xs font-medium text-purple-500 dark:text-purple-400">
          <Sparkles className="h-3 w-3" />
          {label}
        </div>
      )}
    </div>
  );
}

/** A single skeleton line (for text inputs, textareas) */
export function AISkeletonInput({ className }: { className?: string }) {
  return <AISkeleton className={cn('h-10 w-full', className)} />;
}

/** A taller skeleton block (for textareas / multi-line) */
export function AISkeletonTextarea({ className, rows = 3 }: { className?: string; rows?: number }) {
  return <AISkeleton className={cn('w-full', className)} style={{ height: `${Math.round(rows * 1.75 + 1)}rem` }} />;
}

/** Skeleton for a row of badge pills */
export function AISkeletonBadges({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <AISkeleton key={i} className="h-6 rounded-full" style={{ width: `${60 + (i * 17) % 50}px` }} />
      ))}
    </div>
  );
}

/** Skeleton for an ingredient row */
export function AISkeletonIngredientRow() {
  return (
    <div className="grid grid-cols-12 gap-4 items-end">
      <div className="col-span-4"><AISkeleton className="h-10 w-full" /></div>
      <div className="col-span-2"><AISkeleton className="h-10 w-full" /></div>
      <div className="col-span-3"><AISkeleton className="h-10 w-full" /></div>
      <div className="col-span-2"><AISkeleton className="h-10 w-full" /></div>
      <div className="col-span-1"><AISkeleton className="h-8 w-8" /></div>
    </div>
  );
}

/** Skeleton for an instruction step */
export function AISkeletonInstructionRow({ step }: { step: number }) {
  return (
    <div className="flex items-start space-x-4">
      <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-purple-200 to-blue-200 dark:from-purple-800 dark:to-blue-800 animate-pulse flex items-center justify-center text-sm font-medium text-purple-500 dark:text-purple-300">
        {step}
      </div>
      <div className="flex-1">
        <AISkeleton className="h-[4.5rem] w-full" />
      </div>
      <AISkeleton className="h-8 w-8 shrink-0" />
    </div>
  );
}

/** Full card-level skeleton overlay with centered sparkle message */
export function AISkeletonOverlay({ message = 'AI is generating...' }: { message?: string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 dark:bg-gray-900/70 rounded-lg backdrop-blur-[2px]">
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/50 dark:to-blue-900/50 border border-purple-200 dark:border-purple-700 shadow-lg">
        <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400 animate-pulse" />
        <span className="text-sm font-medium text-purple-700 dark:text-purple-300">{message}</span>
      </div>
    </div>
  );
}
