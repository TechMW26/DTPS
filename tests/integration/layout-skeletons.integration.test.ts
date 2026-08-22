/// <reference types="jest" />

import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '../..');
const read = (relativePath: string) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

describe('layout-preserving loading states', () => {
  it('provides accessible and reduced-motion-safe skeleton primitives', () => {
    const skeletons = read('src/components/ui/skeleton.tsx');

    expect(skeletons).toContain('motion-reduce:animate-none');
    expect(skeletons).toContain('role="status"');
    expect(skeletons).toContain('aria-hidden="true"');
    expect(skeletons).toContain('min-h-32');
    expect(skeletons).toContain('min-h-64');
  });

  it('uses instant route skeletons for the major staff and client areas', () => {
    const loadingFiles = [
      'src/app/loading.tsx',
      'src/app/dashboard/loading.tsx',
      'src/app/admin/loading.tsx',
      'src/app/dietician/loading.tsx',
      'src/app/health-counselor/loading.tsx',
      'src/app/appointments/loading.tsx',
      'src/app/clients/loading.tsx',
      'src/app/meal-plans/loading.tsx',
      'src/app/meal-plan-templates/loading.tsx',
      'src/app/messages/loading.tsx',
      'src/app/recipes/loading.tsx',
      'src/app/user/loading.tsx',
    ];

    loadingFiles.forEach((file) => {
      expect(fs.existsSync(path.join(projectRoot, file))).toBe(true);
      expect(read(file)).toMatch(/Skeleton/);
    });
  });

  it('does not replace client pages with blocking full-screen loaders', () => {
    const clientPages = [
      'src/app/user/page.tsx',
      'src/app/user/plan/page.tsx',
      'src/app/user/messages/page.tsx',
      'src/app/user/appointments/page.tsx',
      'src/app/user/notifications/page.tsx',
      'src/app/user/recipes/page.tsx',
      'src/app/user/services/page.tsx',
      'src/app/user/billing/page.tsx',
      'src/app/user/progress/page.tsx',
      'src/app/user/tasks/page.tsx',
      'src/app/user/profile/page.tsx',
      'src/app/user/settings/page.tsx',
    ];

    clientPages.forEach((file) => {
      const source = read(file);
      expect(source).toContain('Skeleton');
      expect(source).not.toContain('<FullPageLoader');
      expect(source).not.toContain('<SpoonGifLoader size="lg"');
    });
  });

  it('keeps compact spinners scoped to actions and skeletons for fetched collections', () => {
    expect(read('src/components/clientDashboard/PaymentsSection.tsx'))
      .toContain('<TableSkeleton');
    expect(read('src/components/clientDashboard/BookingsSection.tsx'))
      .toContain('<ListSkeleton');
    expect(read('src/components/clientDashboard/TasksSection.tsx'))
      .toContain('<ListSkeleton');
    expect(read('src/components/messages/BulkMessageModal.tsx'))
      .toContain('<ListSkeleton');
  });
});
