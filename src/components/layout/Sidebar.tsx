'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Heart,
  BarChart3,
  Users,
  Calendar,
  MessageCircle,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  User,
  FileText,
  TrendingUp,
  ChefHat,
  Clock,
  Utensils,
  CreditCard,
  DollarSign,
  Package,
  Wallet,
  AlertTriangle,
  Bell,
  FolderOpen,
  Tags,
  Sparkles,
  BookOpen,
  ShoppingBag,
  Star,
  Shield
} from 'lucide-react';
import { UserRole } from '@/types';

interface SidebarProps {
  className?: string;
  isDarkMode?: boolean;
}

export default function Sidebar({ className, isDarkMode = false }: SidebarProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<string[]>(['Content Management']);

  const toggleFolder = (label: string) => {
    setExpandedFolders(prev => (
      prev.includes(label) ? prev.filter(item => item !== label) : [...prev, label]
    ));
  };

  const getNavigationItems = (role: UserRole) => {
    switch (role) {
      case UserRole.DIETITIAN:
        return [
          {
            href: '/dashboard/dietitian',
            label: 'Dashboard',
            icon: BarChart3,
            description: 'Overview and analytics'
          },
          {
            href: '/dietician/clients',
            label: 'My Clients',
            icon: Users,
            description: 'Manage your assigned clients'
          },
          {
            href: '/dietician/pending-plans',
            label: 'Pending Plans',
            icon: AlertTriangle,
            description: 'Clients needing meal plans'
          },
          {
            href: '/appointments',
            label: 'Appointments',
            icon: Calendar,
            description: 'Schedule and manage appointments'
          },
          {
            href: '/appointments/unified-booking',
            label: 'Book Appointment',
            icon: Clock,
            description: 'Book appointment for assigned clients'
          },
          {
            href: '/meal-plan-templates',
            label: 'Diet Plan Templates',
            icon: FileText,
            description: 'Reusable Diet plan templates'
          },
          {
            href: '/recipes',
            label: 'Recipes',
            icon: ChefHat,
            description: 'Recipe database'
          },
          {
            href: '/messages',
            label: 'Messages',
            icon: MessageCircle,
            description: 'Client communications'
          },
          {
            href: '/settings/notifications',
            label: 'Send Notifications',
            icon: Bell,
            description: 'Send push notifications to clients'
          },
          {
            href: '/profile',
            label: 'Profile',
            icon: User,
            description: 'View your profile'
          },
          {
            href: '/settings',
            label: 'Settings',
            icon: Settings,
            description: 'Account settings'
          },
        ];
      case UserRole.HEALTH_COUNSELOR:
        // Health Counselors manage assigned clients only
        return [
          {
            href: '/dashboard/health-counselor',
            label: 'Dashboard',
            icon: BarChart3,
            description: 'Overview and analytics'
          },
          {
            href: '/health-counselor/clients',
            label: 'My Clients',
            icon: Users,
            description: 'Manage your assigned clients'
          },
          {
            href: '/health-counselor/recipes',
            label: 'Recipes',
            icon: ChefHat,
            description: 'View recipe database'
          },
          {
            href: '/health-counselor/appointments',
            label: 'Appointments',
            icon: Calendar,
            description: 'Schedule and manage appointments'
          },
          {
            href: '/appointments/unified-booking',
            label: 'Book Appointment',
            icon: Clock,
            description: 'Book appointment for assigned clients'
          },
          {
            href: '/health-counselor/messages',
            label: 'Messages',
            icon: MessageCircle,
            description: 'Client communications'
          },
          {
            href: '/health-counselor/profile',
            label: 'Profile',
            icon: User,
            description: 'View your profile'
          },
          {
            href: '/settings',
            label: 'Settings',
            icon: Settings,
            description: 'Account settings'
          },
        ];
      case UserRole.CLIENT:
        return [
          {
            href: '/client-dashboard',
            label: 'Dashboard',
            icon: BarChart3,
            description: 'Your health overview'
          },
          {
            href: '/my-plan',
            label: 'My Plan',
            icon: Heart,
            description: 'Current meal plan'
          },
          {
            href: '/progress',
            label: 'Progress',
            icon: TrendingUp,
            description: 'Track your progress'
          },
          {
            href: '/appointments',
            label: 'Appointments',
            icon: Calendar,
            description: 'Upcoming consultations'
          },
          {
            href: '/messages',
            label: 'Messages',
            icon: MessageCircle,
            description: 'Chat with your dietitian'
          },
          {
            href: '/billing',
            label: 'Billing',
            icon: CreditCard,
            description: 'Payments and billing'
          },
          {
            href: '/profile',
            label: 'Profile',
            icon: User,
            description: 'View your profile'
          },
          {
            href: '/settings',
            label: 'Settings',
            icon: Settings,
            description: 'Account settings'
          },
        ];
      case UserRole.ADMIN:
        return [
          {
            href: '/dashboard/admin',
            label: 'Dashboard',
            icon: BarChart3,
            description: 'System overview'
          },
          {
            href: '/users',
            label: 'Users',
            icon: Users,
            description: 'Manage all users'
          },
          {
            href: '/admin/allclients',
            label: 'All Clients',
            icon: Users,
            description: 'Assign dietitians to clients'
          },
          {
            href: '/admin/subscription-plans',
            label: 'Subscription Plans',
            icon: CreditCard,
            description: 'Manage subscription plans'
          },
          {
            href: '/admin/service-plans',
            label: 'Service Plans',
            icon: Package,
            description: 'Manage service plans with pricing'
          },
          {
            href: '/admin/duration-presets',
            label: 'Duration Presets',
            icon: Clock,
            description: 'Manage plan duration options'
          },
          {
            href: '/admin/appointments',
            label: 'All Appointments',
            icon: Calendar,
            description: 'View all booked meetings'
          },
          {
            href: '/settings/notifications',
            label: 'Send Notifications',
            icon: Bell,
            description: 'Send role-based push notifications'
          },
          {
            href: '/appointments/unified-booking',
            label: 'Book Appointment',
            icon: Clock,
            description: 'Book appointments for any user'
          },
          {
            href: '/admin/appointment-config',
            label: 'Appointment Config',
            icon: Settings,
            description: 'Configure appointment types and modes'
          },
          {
            href: '/admin/recipes',
            label: 'Recipes',
            icon: ChefHat,
            description: 'Manage recipe database'
          },
          {
            href: '/admin/diet-templates',
            label: 'Diet Templates',
            icon: FileText,
            description: 'Manage diet templates by creator'
          },
          {
            href: '/analytics',
            label: 'Analytics',
            icon: TrendingUp,
            description: 'Platform analytics'
          },
          {
            href: '/revenue-report',
            label: 'Revenue Report',
            icon: DollarSign,
            description: 'Detailed revenue analytics'
          },
          {
            href: '/admin/payments',
            label: 'User Payments',
            icon: CreditCard,
            description: 'View all user payments'
          },
          {
            href: '/admin/other-platform-payments',
            label: 'Other Payments',
            icon: Wallet,
            description: 'Review external payments'
          },
          // Content Management Section
          {
            href: '/admin/content',
            label: 'Content Management',
            icon: FolderOpen,
            description: 'Manage content',
            children: [
              {
                href: '/admin/blogs',
                label: 'Blogs',
                icon: BookOpen,
                description: 'Manage blog posts'
              },
              {
                href: '/admin/tags',
                label: 'Tags',
                icon: Tags,
                description: 'Manage tags'
              },
              {
                href: '/admin/goal-categories',
                label: 'Goal Categories',
                icon: FileText,
                description: 'Manage goal categories'
              },
              {
                href: '/admin/transformations',
                label: 'Transformations',
                icon: Sparkles,
                description: 'Manage transformations'
              },
            ]
          },
          {
            href: '/admin/ecommerce',
            label: 'DTPSecommerce',
            icon: ShoppingBag,
            description: 'Ecommerce management',
            children: [
              {
                href: '/admin/ecommerce/orders',
                label: 'Ecommerce Orders',
                icon: Package,
                description: 'Manage ecommerce orders'
              },
              {
                href: '/admin/ecommerce/payments',
                label: 'Ecommerce Payments',
                icon: Wallet,
                description: 'View ecommerce payments'
              },
              {
                href: '/admin/ecommerce/blogs',
                label: 'Ecommerce Blogs',
                icon: BookOpen,
                description: 'Manage ecommerce blogs'
              },
              {
                href: '/admin/ecommerce/transformations',
                label: 'Ecommerce Transformations',
                icon: Sparkles,
                description: 'Manage ecommerce transformations'
              },
              {
                href: '/admin/ecommerce/plans',
                label: 'Ecommerce Plans',
                icon: FileText,
                description: 'Manage ecommerce plans'
              },
              {
                href: '/admin/ecommerce/ratings',
                label: 'Ecommerce Ratings',
                icon: Star,
                description: 'Manage ecommerce ratings'
              }
            ]
          },
          {
            href: '/admin/leads',
            label: 'Leads',
            icon: Users,
            description: 'Manage leads'
          },
          {
            href: '/admin/dietitians',
            label: 'Dietitians',
            icon: Users,
            description: 'Manage dietitians'
          },
          {
            href: '/admin/health-counselors',
            label: 'Health Counselors',
            icon: Users,
            description: 'Manage health counselors'
          },
          {
            href: '/admin/permissions',
            label: 'Permissions',
            icon: Shield,
            description: 'Manage staff permissions'
          },
          {
            href: '/admin/real-time-api',
            label: 'Real-Time API Errors',
            icon: AlertTriangle,
            description: 'Monitor runtime API errors in real time'
          },
          {
            href: '/profile',
            label: 'Profile',
            icon: User,
            description: 'View your profile'
          },
          {
            href: '/settings',
            label: 'Settings',
            icon: Settings,
            description: 'System settings'
          },
        ];
      default:
        return [];
    }
  };

  if (!session?.user) {
    return null;
  }

  const navigationItems = getNavigationItems(session.user.role);

  // Filter out Dashboard from sidebar nav items (it's shown in header)
  const filteredNavItems = navigationItems.filter(item => item.label !== 'Dashboard');

  const dashboardHref = session?.user?.role === UserRole.ADMIN
    ? '/dashboard/admin'
    : session?.user?.role === UserRole.CLIENT
      ? '/client-dashboard'
      : '/dashboard/dietitian';

  return (
    <div className={cn(
      "flex flex-col border-r transition-all duration-300 h-screen",
      isDarkMode ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200",
      isCollapsed ? "w-22" : "w-[15.9rem]",
      className
    )}>
      {/* Header - Always shows Dashboard button */}
      <div className={cn(
        "flex items-center justify-between p-4 border-b",
        isDarkMode ? "border-gray-700" : "border-gray-200"
      )}>
        {!isCollapsed && (
          <Link
            href={dashboardHref}
            className={cn(
              "flex items-center space-x-2 px-3 py-1 rounded-lg border",
              isDarkMode
                ? "bg-green-900/50 text-green-400 border-green-800"
                : "bg-green-100 text-green-700 border-green-200"
            )}
          >
            <BarChart3 className={cn("h-5 w-5", isDarkMode ? "text-green-400" : "text-green-600")} />
            <span className="text-sm font-medium">Dashboard</span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn("h-8 w-8 p-0", isDarkMode && "hover:bg-gray-800 text-gray-400")}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-2 flex flex-col gap-1">
        {filteredNavItems.map((item: any) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          const hasChildren = item.children && item.children.length > 0;
          const isChildActive = hasChildren && item.children.some((child: any) => (
            pathname === child.href || pathname?.startsWith(child.href + '/')
          ));
          const isExpanded = expandedFolders.includes(item.label) || isChildActive;

          // If has children, render as collapsible folder
          if (hasChildren) {
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleFolder(item.label)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isExpanded
                      ? isDarkMode
                        ? "bg-gray-800 text-white"
                        : "bg-gray-100 text-gray-900"
                      : isDarkMode
                        ? "text-gray-300 hover:bg-gray-800 hover:text-white"
                        : "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
                    isCollapsed && "justify-center"
                  )}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={cn("h-5 w-5", isDarkMode ? "text-gray-400" : "text-gray-500")} />
                    {!isCollapsed && <span>{item.label}</span>}
                  </div>
                  {!isCollapsed && (
                    <ChevronDown className={cn(
                      "h-4 w-4 transition-transform",
                      isExpanded && "rotate-180"
                    )} />
                  )}
                </button>
                {/* Children items */}
                {isExpanded && !isCollapsed && (
                  <div className="ml-4 mt-1 space-y-1 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                    {item.children.map((child: any) => {
                      const ChildIcon = child.icon;
                      const isChildActive = pathname === child.href || pathname?.startsWith(child.href + '/');
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "flex items-center space-x-2 px-2 py-1.5 rounded-md text-sm transition-colors",
                            isChildActive
                              ? isDarkMode
                                ? "bg-green-900/50 text-green-400"
                                : "bg-green-100 text-green-700"
                              : isDarkMode
                                ? "text-gray-400 hover:bg-gray-800 hover:text-white"
                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                          )}
                        >
                          <ChildIcon className="h-4 w-4" />
                          <span>{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // Regular link item
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors relative",
                isActive
                  ? isDarkMode
                    ? "bg-green-900/50 text-green-400 border border-green-800"
                    : "bg-green-100 text-green-700 border border-green-200"
                  : isDarkMode
                    ? "text-gray-300 hover:bg-gray-800 hover:text-white"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
                isCollapsed && "justify-center"
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <div className="flex items-center space-x-3">
                <Icon className={cn("h-5 w-5", isActive && (isDarkMode ? "text-green-400" : "text-green-600"))} />
                {!isCollapsed && (
                  <div className="flex flex-col">
                    <span>{item.label}</span>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User Info */}
      <div className={cn("p-4 border-t", isDarkMode ? "border-gray-700" : "border-gray-200")}>
        <div className={cn(
          "flex items-center space-x-3",
          isCollapsed && "justify-center"
        )}>
          <div className="shrink-0">
            <div className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center",
              isDarkMode ? "bg-green-900/50" : "bg-green-100"
            )}>
              <User className={cn("h-4 w-4", isDarkMode ? "text-green-400" : "text-green-600")} />
            </div>
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm font-medium truncate", isDarkMode ? "text-white" : "text-gray-900")}>
                {session.user.name}
              </p>
              <p className={cn("text-xs truncate capitalize", isDarkMode ? "text-gray-500" : "text-gray-500")}>
                {session.user.role}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
