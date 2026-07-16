'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminEcommerceRatingEditPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState('');
  const [rating, setRating] = useState('5');
  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageKitFileId, setImageKitFileId] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user || (session.user as any).role !== 'admin') {
      router.push('/auth/signin');
      return;
    }
    fetchRating();
  }, [session, status, router, id]);

  const fetchRating = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/ecommerce/ratings/${id}`);
      if (!res.ok) throw new Error('Failed to load rating');
      const data = await res.json();
      const item = data.rating;
      setName(item.name || '');
      setRating(String(item.rating || 5));
      setMessage(item.message || '');
      setImageUrl(item.imageUrl || '');
      setImageKitFileId(item.imageKitFileId || '');
      setIsActive(Boolean(item.isActive));
    } catch {
      toast.error('Failed to load rating');
    } finally {
      setLoading(false);
    }
  };

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
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/ecommerce/ratings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          rating: Number(rating || 5),
          message,
          imageUrl,
          imageKitFileId,
          isActive
        })
      });
      if (!res.ok) throw new Error('Failed to update rating');
      toast.success('Rating updated');
      router.push('/admin/ecommerce/ratings');
    } catch {
      toast.error('Failed to update rating');
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
            <Link href="/admin/ecommerce/ratings">
              <ArrowLeft className="h-4 w-4 mr-2" />Back
            </Link>
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Edit Ecommerce Rating</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="text-sm text-gray-500">Loading...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Rating (1-5)</Label>
                  <Input type="number" min="1" max="5" value={rating} onChange={(e) => setRating(e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Message</Label>
                  <RichTextEditor value={message} onChange={setMessage} placeholder="Write rating message" minHeight="120px" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Image</Label>
                  <Input type="file" accept="image/*" disabled={uploading} onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                  }} />
                  {imageUrl && <div className="text-xs text-gray-500 break-all">{imageUrl}</div>}
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
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
