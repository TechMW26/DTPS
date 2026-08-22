import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel deployment — default output (not standalone/Docker)

  // Performance optimizations
  compress: true,
  poweredByHeader: false,

  // Build optimizations
  reactStrictMode: true,

  // Optimize images
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
        pathname: '/**',
      },
      // Retain read compatibility while legacy ImageKit references are migrated.
      {
        protocol: 'https',
        hostname: 'ik.imagekit.io',
        pathname: '/**',
      },
    ],
    formats: ['image/webp', 'image/avif'],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  // Experimental features for better performance
  experimental: {
    // Keep recently visited dynamic route payloads in the browser router cache.
    // Client-page effects still re-run and request live API data; this only
    // avoids downloading and rebuilding the same route shell on every switch.
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
    optimizeCss: true,
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'date-fns',
      '@radix-ui/react-icons',
      '@radix-ui/react-avatar',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-label',
      '@radix-ui/react-progress',
      '@radix-ui/react-switch',
      'firebase',
      'firebase/app',
      'firebase/messaging',
      'emoji-picker-react',
      'html2canvas',
      'jspdf',
      'sonner',
    ],
  } as NextConfig["experimental"],

  // Turbopack configuration for Next.js 16+
  turbopack: {
    root: process.cwd(),
  },

  // Mark firebase-admin as external for server components (prevents Turbopack bundling issues)
  serverExternalPackages: ['firebase-admin'],

  // Webpack optimizations for better build performance (fallback for --webpack flag)
  webpack: (config, { dev, isServer }) => {
    // Optimize for production builds
    if (!dev && !isServer) {
      // Optimize module resolution
      config.resolve.modules = ['node_modules'];
      config.resolve.symlinks = false;
    }

    // Optimize for development builds — use native filesystem events (not polling)
    if (dev) {
      config.watchOptions = {
        ignored: /node_modules/,
        aggregateTimeout: 300,
      };
    }

    return config;
  },

  // Allow embedding in iframes from any origin (app-level)
  headers: async () => {
    return [
      // Service worker: allow updates
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors *; upgrade-insecure-requests" },
        ],
      },
    ];
  },
};

export default nextConfig;
