"use client";

import { useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  useRouteFade,
  useRouteMotionOwner,
} from "@/components/client/ClientMotion";

export default function PageTransition({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const hasRouteSurface = useRouteMotionOwner();
  useRouteFade(ref, pathname, !hasRouteSurface);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
