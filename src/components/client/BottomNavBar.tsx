'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, UtensilsCrossed, ListTodo, BarChart3, MessageCircle, User } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

export default function BottomNavBar() {
  const pathname = usePathname();
  const { isDarkMode } = useTheme();

  const isActive = (href: string) => {
    if (href === '/user') {
      return pathname === '/user';
    }
    return pathname.startsWith(href);
  };

  const navItems = [
    { href: '/user', icon: Home, label: 'Home' },
    { href: '/user/plan', icon: UtensilsCrossed, label: 'Meal' },
       { href: '/user/messages', icon: MessageCircle, label: 'Messages' },
    { href: '/user/tasks', icon: ListTodo, label: 'Tasks' },
    { href: '/user/progress', icon: BarChart3, label: 'Progress' },
 
  
  ];

  return (
    <div className={`fixed bottom-0 left-0 right-0 px-9 py-3 z-50 border-t transition-colors duration-300 ${isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
      <div className="pb-safe max-w-lg mx-auto">
        <div className="flex items-center justify-between gap-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-center"
            >
              <item.icon
                className={`h-6 w-6 transition-colors duration-200 ${isActive(item.href) ? 'text-[#ff9500]' : (isDarkMode ? 'text-gray-400' : 'text-gray-400')}`}
              />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
