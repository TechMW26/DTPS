"use client";

import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  X,
  Home,
  Heart,
  TrendingUp,
  Calendar,
  MessageCircle,
  CreditCard,
  User,
  Settings,
  LogOut,
  BookOpen,
  Package,
  Bell,
  Loader2,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useUnreadCountsSafe } from "@/contexts/UnreadCountContext";
import { useTheme } from "@/contexts/ThemeContext";

export default function UserSidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { counts } = useUnreadCountsSafe();
  const { isDarkMode } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const groups = [
    {
      label: "Your care",
      items: [
        { href: "/user", label: "Home", icon: Home },
        { href: "/user/plan", label: "Meal plan", icon: Heart },
        { href: "/user/progress", label: "Progress", icon: TrendingUp },
        { href: "/user/appointments", label: "Appointments", icon: Calendar },
        {
          href: "/user/messages",
          label: "Messages",
          icon: MessageCircle,
          badge: counts.messages,
        },
      ],
    },
    {
      label: "Explore",
      items: [
        { href: "/user/recipes", label: "Recipes", icon: BookOpen },
        { href: "/user/services", label: "Services", icon: Package },
      ],
    },
    {
      label: "Your account",
      items: [
        {
          href: "/user/notifications",
          label: "Notifications",
          icon: Bell,
          badge: counts.notifications,
        },
        { href: "/user/billing", label: "Billing", icon: CreditCard },
        { href: "/user/profile", label: "Profile", icon: User },
        { href: "/user/settings", label: "Settings", icon: Settings },
        {
          href: "/user/settings/help-center",
          label: "Help & support",
          icon: HelpCircle,
        },
      ],
    },
  ];
  const userName =
    [session?.user?.firstName, session?.user?.lastName]
      .filter(Boolean)
      .join(" ") ||
    session?.user?.name ||
    "Your account";
  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut({
        callbackUrl: `${window.location.origin}/client-auth/signin`,
      });
    } catch {
      toast.error("Could not sign out. Please try again.");
      setSigningOut(false);
    }
  };
  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="client-drawer-overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          className={`client-drawer ${isDarkMode ? "bg-gray-950 text-white" : "bg-white text-gray-900"}`}
          onOpenAutoFocus={() => {
            returnFocus.current = document.activeElement as HTMLElement;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current?.isConnected)
              returnFocus.current.focus({ preventScroll: true });
          }}
        >
          <div
            className={`flex items-center justify-between border-b px-4 py-3 ${isDarkMode ? "border-gray-800" : "border-gray-100"}`}
          >
            <div className="flex items-center gap-2">
              <Image
                src="/images/dtps-logo.png"
                alt=""
                width={32}
                height={32}
              />
              <Dialog.Title className="text-lg font-bold text-[#E06A26]">
                Your DTPS
              </Dialog.Title>
            </div>
            <Dialog.Close
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              aria-label="Close navigation menu"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <p
            className={`px-5 pb-1 pt-4 text-sm font-semibold ${isDarkMode ? "text-gray-200" : "text-gray-700"}`}
          >
            {userName}
          </p>
          <nav
            aria-label="All client pages"
            className="min-h-0 flex-1 overflow-y-auto px-2 pb-4"
          >
            {groups.map((group) => (
              <div key={group.label} className="mt-4">
                <h2
                  className={`px-3 pb-2 text-xs font-semibold ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                >
                  {group.label}
                </h2>
                {group.items.map((item) => {
                  const active =
                    pathname === item.href ||
                    (item.href !== "/user" &&
                      pathname.startsWith(`${item.href}/`) &&
                      item.href !== "/user/settings");
                  const badge = "badge" in item ? Number(item.badge) : 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-12 items-center gap-3 rounded-xl px-3 py-3 text-sm ${active ? "bg-orange-500/10 font-semibold text-[#c45117] dark:text-orange-300" : isDarkMode ? "hover:bg-white/5" : "hover:bg-gray-50"}`}
                    >
                      <item.icon aria-hidden className="h-5 w-5 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {badge > 0 && (
                        <span className="rounded-full bg-red-600 px-2 text-xs leading-5 text-white">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div
            className={`border-t p-3 ${isDarkMode ? "border-gray-800" : "border-gray-100"}`}
          >
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              aria-busy={signingOut}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-red-600 dark:text-red-400"
            >
              {signingOut ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <LogOut className="h-5 w-5" />
              )}
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
