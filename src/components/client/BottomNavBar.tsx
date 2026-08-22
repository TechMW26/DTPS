'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, UtensilsCrossed, ListTodo, BarChart3, MessageCircle, type LucideIcon } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useUnreadCountsSafe } from '@/contexts/UnreadCountContext';

const NAV_ITEMS: Array<{ href: string; icon: LucideIcon; label: string }> = [
  { href: '/user', icon: Home, label: 'Home' },
  { href: '/user/plan', icon: UtensilsCrossed, label: 'Meal' },
  { href: '/user/messages', icon: MessageCircle, label: 'Messages' },
  { href: '/user/tasks', icon: ListTodo, label: 'Tasks' },
  { href: '/user/progress', icon: BarChart3, label: 'Progress' },
];

function NavigationPendingHint() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className={`absolute inset-x-3 top-0 h-0.5 rounded-full bg-[#E06A26] transition-opacity duration-150 ${pending ? 'animate-pulse opacity-100' : 'opacity-0'}`}
    />
  );
}

export default function BottomNavBar() {
  const pathname = usePathname();
  const { isDarkMode } = useTheme();
  const { counts } = useUnreadCountsSafe();

  const isActive = (href: string) => {
    if (href === '/user') {
      return pathname === '/user';
    }
    return pathname.startsWith(href);
  };

  return (
    <nav
      aria-label="Primary client navigation"
      className={`client-bottom-nav-safe fixed inset-x-0 bottom-0 z-40 border-t px-2 pt-1.5 transition-colors duration-300 ${isDarkMode ? 'bg-gray-900/95 border-gray-800' : 'bg-white/95 border-gray-100'} shadow-[0_-6px_20px_rgba(15,23,42,0.06)] backdrop-blur`}
    >
      <div className="mx-auto max-w-xl">
        <div className="grid grid-cols-5 items-stretch gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              aria-label={item.label}
              className={`relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 transition-colors ${isActive(item.href) ? (isDarkMode ? 'bg-orange-500/10' : 'bg-orange-50') : (isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50')}`}
            >
              <NavigationPendingHint />
              <item.icon
                aria-hidden="true"
                className={`h-5 w-5 shrink-0 transition-colors duration-200 ${isActive(item.href) ? 'text-[#E06A26]' : (isDarkMode ? 'text-gray-400' : 'text-gray-500')}`}
              />
              <span className={`max-w-full truncate text-[10px] font-medium leading-none ${isActive(item.href) ? 'text-[#E06A26]' : (isDarkMode ? 'text-gray-400' : 'text-gray-600')}`}>
                {item.label}
              </span>
              {item.href === '/user/messages' && counts.messages > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center font-semibold">
                  {counts.messages > 99 ? '99+' : counts.messages}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
