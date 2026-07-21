'use client';

import { useEffect } from 'react';
import { Check, X } from 'lucide-react';

interface MealCompletionCelebrationProps {
  open: boolean;
  mealLabel: string;
  onClose: () => void;
}

const PARTICLES = Array.from({ length: 30 }, (_, index) => ({
  id: index,
  left: (index * 37) % 100,
  delay: (index % 10) * 70,
  duration: 1500 + (index % 6) * 140,
  color: ['#3AB1A0', '#E06A26', '#F8C146', '#9B6CE6', '#EF5DA8'][index % 5],
  rotation: (index * 47) % 180,
}));

export default function MealCompletionCelebration({
  open,
  mealLabel,
  onClose,
}: MealCompletionCelebrationProps) {
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(onClose, 4200);
    return () => window.clearTimeout(timer);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-black/30 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Meal completed"
      onClick={onClose}
    >
      <style>{`
        @keyframes meal-confetti-fall {
          0% { transform: translate3d(0, -12vh, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate3d(0, 112vh, 0) rotate(720deg); opacity: .15; }
        }
        @keyframes meal-celebration-pop {
          0% { transform: scale(.75); opacity: 0; }
          70% { transform: scale(1.04); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .meal-confetti { display: none; }
          .meal-celebration-card { animation: none !important; }
        }
      `}</style>

      {PARTICLES.map((particle) => (
        <span
          key={particle.id}
          className="meal-confetti pointer-events-none absolute top-0 h-3 w-2 rounded-sm"
          style={{
            left: `${particle.left}%`,
            backgroundColor: particle.color,
            animation: `meal-confetti-fall ${particle.duration}ms linear ${particle.delay}ms both`,
            transform: `rotate(${particle.rotation}deg)`,
          }}
        />
      ))}

      <div
        className="meal-celebration-card relative z-10 w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl dark:bg-gray-900 dark:text-white"
        style={{ animation: 'meal-celebration-pop 420ms ease-out both' }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-2 text-gray-400 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#3AB1A0] dark:hover:bg-white/10"
          aria-label="Close celebration"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#3AB1A0]/15">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#3AB1A0] text-white shadow-lg">
            <Check className="h-8 w-8" strokeWidth={3} />
          </div>
        </div>
        <p className="text-3xl" aria-hidden="true">🎉</p>
        <h2 className="mt-2 text-2xl font-bold">Fantastic work!</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-300" aria-live="polite">
          Your {mealLabel.toLowerCase()} is complete. Every healthy choice moves you closer to your goal!
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-[#3AB1A0] px-4 py-3 font-semibold text-white transition hover:bg-[#2A9A8B] focus:outline-none focus:ring-2 focus:ring-[#3AB1A0] focus:ring-offset-2"
        >
          Keep it going
        </button>
      </div>
    </div>
  );
}
