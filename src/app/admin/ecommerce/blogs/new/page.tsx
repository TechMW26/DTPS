'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminEcommerceBlogNewPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageKitFileId, setImageKitFileId] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user || (session.user as any).role !== 'admin') {
      router.push('/auth/signin');
    }
  }, [session, status, router]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'ecommerce');

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setImageUrl(data.url || '');
      setImageKitFileId(data.imageKitFileId || data.fileId || '');
      toast.success('Image uploaded');
    } catch {
      toast.error('Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/ecommerce/blogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim(),
          summary,
          content,
          imageUrl,
          imageKitFileId,
          isActive
        })
      });
      if (!res.ok) throw new Error('Failed to create blog');
      const data = await res.json();
      toast.success('Blog created');
      router.push(`/admin/ecommerce/blogs/${data.blog._id}/edit`);
    } catch {
      toast.error('Failed to create blog');
    } finally {
      setSaving(false);
    }
  };

  if (!session?.user || (session.user as any).role !== 'admin') {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" asChild>
            <Link href="/admin/ecommerce/blogs">
              <ArrowLeft className="h-4 w-4 mr-2" />Back
            </Link>
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Blog'}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create Ecommerce Blog</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Summary</Label>
                <RichTextEditor value={summary} onChange={setSummary} placeholder="Write a short summary" minHeight="100px" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Content</Label>
                <RichTextEditor value={content} onChange={setContent} placeholder="Write blog content" minHeight="240px" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Image</Label>
                <Input type="file" accept="image/*" disabled={uploading} onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                }} />
                {imageUrl && (
                  <div className="text-xs text-gray-500 break-all">{imageUrl}</div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <select
                  className="border rounded-md h-9 px-2 text-sm"
                  value={isActive ? 'active' : 'inactive'}
                  onChange={(e) => setIsActive(e.target.value === 'active')}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
