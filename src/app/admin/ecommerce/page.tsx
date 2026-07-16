'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, Wallet, BookOpen, Sparkles, FileText, Star } from 'lucide-react';

const tiles = [
  { href: '/admin/ecommerce/orders', title: 'Ecommerce Orders', description: 'Manage ecommerce orders', icon: Package },
  { href: '/admin/ecommerce/payments', title: 'Ecommerce Payments', description: 'View ecommerce payments', icon: Wallet },
  { href: '/admin/ecommerce/blogs', title: 'Ecommerce Blogs', description: 'Manage ecommerce blogs', icon: BookOpen },
  { href: '/admin/ecommerce/transformations', title: 'Ecommerce Transformations', description: 'Manage ecommerce transformations', icon: Sparkles },
  { href: '/admin/ecommerce/plans', title: 'Ecommerce Plans', description: 'Manage ecommerce plans', icon: FileText },
  { href: '/admin/ecommerce/ratings', title: 'Ecommerce Ratings', description: 'Manage ecommerce ratings', icon: Star }
];

export default function AdminEcommerceHomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user || (session.user as any).role !== 'admin') {
      router.push('/auth/signin');
    }
  }, [session, status, router]);

  if (!session?.user || (session.user as any).role !== 'admin') {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">DTPSecommerce</h1>
          <p className="text-sm text-gray-500">Manage ecommerce orders, payments, and related content.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tiles.map(({ href, title, description, icon: Icon }) => (
            <Link key={href} href={href}>
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-5 w-5 text-emerald-600" />
                    {title}
                  </CardTitle>
                  <CardDescription className="text-xs">{description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-gray-500">Open</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
