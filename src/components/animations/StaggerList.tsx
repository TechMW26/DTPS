'use client';

import { ReactNode } from 'react';

interface StaggerListProps {
  children: ReactNode[];
  className?: string;
  containerClassName?: string;
  staggerDelay?: number; // in milliseconds
}

export default function StaggerList({
  children,
  className = '',
  containerClassName = 'space-y-3',
  staggerDelay = 50,
}: StaggerListProps) {
  const staggerClasses = [
    'animate-stagger-1',
    'animate-stagger-2',
    'animate-stagger-3',
    'animate-stagger-4',
    'animate-stagger-5',
    'animate-stagger-6',
  ];

  return (
    <div className={containerClassName}>
      {Array.isArray(children) ? (
        children.map((child, index) => (
          <div
            key={index}
            className={`${className} ${staggerClasses[Math.min(index, 5)]}`}
            style={{
              animationDelay: `${index * staggerDelay}ms`,
            }}
          >
            {child}
          </div>
        ))
      ) : (
        <div className={`${className} ${staggerClasses[0]}`}>{children}</div>
      )}
    </div>
  );
}
