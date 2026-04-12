'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import previewImage from "@/app/public/icons/app-icon-original.png"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  User,
  Settings,
  LogOut,
  Menu,
  X,
  Heart,
  Calendar,
  MessageCircle,
  BarChart3,
  Users,
  AlertTriangle
} from 'lucide-react';
import { UserRole } from '@/types';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface NavbarProps {
  isDarkMode?: boolean;
}

export default function Navbar({ isDarkMode = false }: NavbarProps) {
  const pathname = usePathname();
  const isDashboard = pathname?.includes('/dashboard');
  const { data: session, status } = useSession();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const getInitials = (firstName?: string, lastName?: string) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  const getDashboardLink = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN:
        return '/dashboard/admin';
      case UserRole.DIETITIAN:
      case UserRole.HEALTH_COUNSELOR:
        return '/dashboard/dietitian';
      case UserRole.CLIENT:
        return '/client-dashboard';
      default:
        return '/dashboard';
    }
  };

  type NavigationItem = {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  };

  const getNavigationItems = (role: UserRole): NavigationItem[] => {
    const baseItems: NavigationItem[] = [
      { href: getDashboardLink(role), label: 'Dashboard', icon: BarChart3 },
    ];

    switch (role) {

      case UserRole.CLIENT:
        return [
          ...baseItems,
          { href: '/my-plan', label: 'My Plan', icon: Heart },
          { href: '/appointments', label: 'Appointments', icon: Calendar },
          { href: '/progress', label: 'Progress', icon: BarChart3 },
          { href: '/messages', label: 'Messages', icon: MessageCircle },
        ];
      case UserRole.ADMIN:
        return [
          ...baseItems,
          { href: '/users', label: 'Users', icon: Users },
          { href: '/analytics', label: 'Analytics', icon: BarChart3 },
        ];
      default:
        return baseItems;
    }
  };

  const handleSignOut = async () => {
    const fullSigninUrl = `${window.location.origin}/`;
    await signOut({ callbackUrl: fullSigninUrl });
  };

  if (status === 'loading') {
    return (
      <nav className={cn("border-b safe-area-top", isDarkMode ? "bg-gray-900 border-gray-700" : "bg-white")}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="flex items-center space-x-2">
                <Heart className="h-6 w-6 text-green-600" />
                <span className={cn("text-lg font-semibold", isDarkMode ? "text-white" : "text-gray-900")}>DTPS</span>
              </div>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className={cn("border-b sticky top-0 z-50 safe-area-top", isDarkMode ? "bg-gray-900 border-gray-700" : "bg-white")}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <div className="flex items-center space-x-2">
              <Heart className="h-6 w-6 text-green-600" />
              <span className={cn("text-lg font-semibold", isDarkMode ? "text-white" : "text-gray-900")}>DTPS</span>
            </div>
          </div>

          {/* Desktop Navigation */}
          {session?.user && (
            <div className="hidden md:flex items-center space-x-4">
              {getNavigationItems(session.user.role).map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      isDarkMode
                        ? "text-gray-300 hover:text-white hover:bg-gray-800"
                        : "text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            {session?.user ? (
              <>
                {/* Mobile menu button */}
                <div className="md:hidden">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className={isDarkMode ? "text-gray-300 hover:bg-gray-800" : ""}
                  >
                    {isMobileMenuOpen ? (
                      <X className="h-5 w-5" />
                    ) : (
                      <Menu className="h-5 w-5" />
                    )}
                  </Button>
                </div>

                {/* User dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={session.user.avatar}
                          alt={session.user.name}
                        />
                        <AvatarFallback className={isDarkMode ? "bg-gray-700 text-gray-300" : ""}>
                          {getInitials(session.user.firstName, session.user.lastName)}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className={cn("w-56", isDarkMode && "bg-gray-800 border-gray-700")} align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className={cn("text-sm font-medium leading-none", isDarkMode && "text-white")}>
                          {session.user.name}
                        </p>
                        <p className={cn("text-xs leading-none", isDarkMode ? "text-gray-400" : "text-muted-foreground")}>
                          {session.user.email}
                        </p>
                        <p className={cn("text-xs leading-none capitalize", isDarkMode ? "text-gray-400" : "text-muted-foreground")}>
                          {session.user.role}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className={isDarkMode ? "bg-gray-700" : ""} />
                    <DropdownMenuItem asChild className={isDarkMode ? "text-gray-300 focus:bg-gray-700 focus:text-white" : ""}>
                      <Link href="/profile" className="flex items-center">
                        <User className="mr-2 h-4 w-4" />
                        <span>Profile</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className={isDarkMode ? "text-gray-300 focus:bg-gray-700 focus:text-white" : ""}>
                      <Link href="/settings" className="flex items-center">
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Settings</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className={isDarkMode ? "bg-gray-700" : ""} />
                    <DropdownMenuItem onClick={handleSignOut} className={isDarkMode ? "text-gray-300 focus:bg-gray-700 focus:text-white" : ""}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <div className="flex items-center space-x-2">
                <Button variant="ghost" asChild className={isDarkMode ? "text-gray-300 hover:bg-gray-800" : ""}>
                  <Link href="/auth/signin">Sign In</Link>
                </Button>
                <Button asChild>
                  <Link href="/auth/signup">Sign Up</Link>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Navigation - Full Screen Modal */}
        {session?.user && isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="md:hidden fixed inset-0 top-16 z-30 bg-black/20"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            {/* Menu Drawer */}
            <div className={cn("md:hidden fixed left-0 right-0 top-16 z-40 max-h-[calc(100vh-4rem)] overflow-y-auto border-t", isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
              <nav className={cn("w-full py-2 space-y-1", isDarkMode ? "bg-gray-800" : "bg-white")}>
                {/* Quick Access Section */}
                <div className={cn("px-4 py-3 mb-2 border-b", isDarkMode ? "border-gray-700" : "border-gray-200")}>
                  <p className={cn("text-xs font-semibold px-1 py-2 mb-2", isDarkMode ? "text-gray-400" : "text-gray-500")}>QUICK ACCESS</p>
                  <div className="space-y-1">
                    {/* Dashboard */}
                    <Link
                      href={session.user.role === UserRole.ADMIN ? '/dashboard/admin' : session.user.role === UserRole.CLIENT ? '/client-dashboard' : '/dashboard/dietitian'}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-base font-medium transition-colors",
                        isDarkMode
                          ? "text-gray-300 hover:text-white hover:bg-gray-700 active:bg-gray-600"
                          : "text-gray-700 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200"
                      )}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <BarChart3 className="h-5 w-5 shrink-0" />
                      <span>Dashboard</span>
                    </Link>

                    {/* Messages */}
                    <Link
                      href="/messages"
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-base font-medium transition-colors",
                        isDarkMode
                          ? "text-gray-300 hover:text-white hover:bg-gray-700 active:bg-gray-600"
                          : "text-gray-700 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200"
                      )}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <MessageCircle className="h-5 w-5 shrink-0" />
                      <span>Messages</span>
                    </Link>

                    {/* Pending Plans - Dietitian only */}
                    {session.user.role === UserRole.DIETITIAN && (
                      <Link
                        href="/dietician/pending-plans"
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-base font-medium transition-colors",
                          isDarkMode
                            ? "text-gray-300 hover:text-white hover:bg-gray-700 active:bg-gray-600"
                            : "text-gray-700 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200"
                        )}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <AlertTriangle className="h-5 w-5 shrink-0" />
                        <span>Pending Plans</span>
                      </Link>
                    )}

                    {/* My Clients - Dietitian/Health Counselor */}
                    {(session.user.role === UserRole.DIETITIAN || session.user.role === UserRole.HEALTH_COUNSELOR) && (
                      <Link
                        href={session.user.role === UserRole.DIETITIAN ? '/dietician/clients' : '/health-counselor/clients'}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-base font-medium transition-colors",
                          isDarkMode
                            ? "text-gray-300 hover:text-white hover:bg-gray-700 active:bg-gray-600"
                            : "text-gray-700 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200"
                        )}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <Users className="h-5 w-5 shrink-0" />
                        <span>My Clients</span>
                      </Link>
                    )}
                  </div>
                </div>
              </nav>
            </div>
          </>
        )}
      </div>
    </nav>
  );
}
