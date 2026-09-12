"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

// Colors follow the root theme class, including the client theme provider.
// One host owns placement, safe-area spacing and actions across the application.
const Toaster = (props: ToasterProps) => (
  <Sonner
    {...props}
    position="top-center"
    className="dtps-notifications"
    theme="light"
    closeButton
    duration={5000}
    visibleToasts={3}
    gap={12}
    offset="max(16px, env(safe-area-inset-top))"
    mobileOffset={{ top: "max(12px, env(safe-area-inset-top))", left: 16, right: 16 }}
    toastOptions={{ ...props.toastOptions, className: "dtps-notification" }}
  />
);

export { Toaster };
