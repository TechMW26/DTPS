'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, 
  Heart, 
  TrendingUp, 
  Calendar, 
  MessageCircle,
  CreditCard,
  User,
  Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/user', label: 'Home', icon: Home },
  { href: '/user/plan', label: 'My Plan', icon: Heart },
  { href: '/user/progress', label: 'Progress', icon: TrendingUp },
  { href: '/user/messages', label: 'Messages', icon: MessageCircle },
];

export default function ClientBottomNav() {
  const pathname = usePathname();
  const { data: session } = useSession();

  // Only show for clients
  if (session?.user?.role !== 'client') return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 lg:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full px-1 py-2 transition-colors",
                isActive 
                  ? "text-[#E06A26]" 
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              <Icon className={cn("h-5 w-5 mb-1", isActive && "text-[#E06A26]")} />
              <span className={cn(
                "text-[10px] font-medium truncate",
                isActive ? "text-[#E06A26]" : "text-gray-500"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
