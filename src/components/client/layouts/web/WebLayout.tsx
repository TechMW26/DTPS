'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import { Bell, Search, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface WebLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showSearch?: boolean;
  headerAction?: ReactNode;
  className?: string;
}

/**
 * WebLayout - Desktop/Laptop layout for client pages
 * Features:
 * - Fixed sidebar navigation (collapsible)
 * - Top header with search, notifications, profile
 * - Main content area with proper spacing
 * - Responsive design for large screens
 */
export function WebLayout({ 
  children, 
  title,
  subtitle,
  showSearch = true,
  headerAction,
  className 
}: WebLayoutProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [notificationCount, setNotificationCount] = useState(3);

  const user = session?.user;
  const initials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : 'U';

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Fixed Sidebar */}
      <aside className="fixed left-0 top-0 h-full bg-white border-r border-gray-200 z-40">
        <Sidebar />
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 ml-16 lg:ml-64 min-h-screen flex flex-col transition-all duration-300">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between h-16 px-6">
            {/* Left: Title or Search */}
            <div className="flex items-center gap-4 flex-1">
              {title ? (
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
                  {subtitle && (
                    <p className="text-sm text-gray-500">{subtitle}</p>
                  )}
                </div>
              ) : showSearch ? (
                <div className="relative max-w-md w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search..."
                    className="pl-10 bg-gray-50 border-gray-200 focus:bg-white"
                  />
                </div>
              ) : null}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3">
              {headerAction}

              {/* Notifications */}
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5 text-gray-600" />
                {notificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {notificationCount}
                  </span>
                )}
              </Button>

              {/* Profile Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={user?.avatar || ''} alt={user?.name || ''} />
                      <AvatarFallback className="bg-green-100 text-green-700">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span className="font-medium">{user?.name}</span>
                      <span className="text-xs text-gray-500">{user?.email}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push('/user/profile')}>
                    <User className="h-4 w-4 mr-2" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/user/settings')}>
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600">
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className={cn("flex-1 p-6 lg:p-8", className)}>
          {children}
        </main>
      </div>
    </div>
  );
}

export default WebLayout;
