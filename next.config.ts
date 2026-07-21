import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker deployment configuration
  output: 'standalone',

  // Performance optimizations
  compress: true,
  poweredByHeader: false,

  // Build optimizations
  reactStrictMode: false,

  // Note: ESLint config moved to eslint.config.mjs (Next.js 16+ no longer supports eslint in next.config.ts)
  // TypeScript errors can be ignored via tsconfig.json if needed
  typescript: {
    ignoreBuildErrors: true,
  },

  // Optimize images
  images: {
    remotePatterns: [
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
  } as any,

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