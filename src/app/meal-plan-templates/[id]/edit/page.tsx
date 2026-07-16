'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading-spinner';
import { ArrowLeft, Save, ChefHat } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { UserRole } from '@/types';

const categories = [
  { value: 'weight-loss', label: 'Weight Loss' },
  { value: 'weight-gain', label: 'Weight Gain' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'muscle-gain', label: 'Muscle Gain' },
  { value: 'diabetes', label: 'Diabetes Friendly' },
  { value: 'heart-healthy', label: 'Heart Healthy' },
  { value: 'keto', label: 'Keto' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'custom', label: 'Custom' }
];

interface MealPlanTemplate {
  _id: string;
  templateType: 'plan' | 'diet';
  name: string;
  description: string;
  category: string;
  duration: number;
  targetCalories: { min: number; max: number };
  targetMacros: {
    protein: { min: number; max: number };
    carbs: { min: number; max: number };
    fat: { min: number; max: number };
  };
  dietaryRestrictions: string[];
  tags: string[];
  isPublic: boolean;
  difficulty: string;
}

export default function EditTemplatePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams();
  const templateId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isOwner, setIsOwner] = useState(false);

  // Form state
  const [template, setTemplate] = useState<MealPlanTemplate | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [duration, setDuration] = useState(7);
  const [difficulty, setDifficulty] = useState('intermediate');
  const [isPublic, setIsPublic] = useState(false);

  useEffect(() => {
    if (!session) return;
    if (session.user.role !== UserRole.ADMIN && session.user.role !== UserRole.DIETITIAN) {
      router.push('/dashboard');
    }
  }, [session, router]);

  useEffect(() => {
    if (templateId) {
      fetchTemplate();
    }
  }, [templateId]);

  const fetchTemplate = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch(`/api/meal-plan-templates/${templateId}`);
      if (response.ok) {
        const data = await response.json();
        const t = data.template;

        // All dietitians can edit any template
        setIsOwner(true);

        setTemplate(t);
        setName(t.name || '');
        setDescription(t.description || '');
        setCategory(t.category || '');
        setDuration(t.duration || 7);
        setDifficulty(t.difficulty || 'intermediate');
        setIsPublic(t.isPublic || false);
      } else {
        setError('Template not found');
      }
    } catch (err) {
      setError('Failed to load template');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name || !category) {
      setError('Please fill in name and category');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const updateData = {
        name: name.trim(),
        description: description.trim(),
        category,
        duration: Number(duration),
        difficulty,
        isPublic
      };

      const response = await fetch(`/api/meal-plan-templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (response.ok) {
        toast.success('Template updated successfully');
        router.push('/meal-plan-templates');
      } else {
        const data = await response.json();
        const errorMsg = data.error || 'Failed to update template';
        setError(errorMsg);
        toast.error('Failed to update template', { description: errorMsg });
      }
    } catch (err) {
      setError('Failed to update template');
      toast.error('Failed to update template', { description: 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return <LoadingPage />;
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <LoadingSpinner />
        </div>
      </DashboardLayout>
    );
  }

  if (!template) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertDescription>Template not found</AlertDescription>
          </Alert>
          <Button className="mt-4" onClick={() => router.push('/meal-plan-templates')}>
            Back to Templates
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/meal-plan-templates">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Templates
            </Link>
          </Button>
          <Badge variant="outline" className="capitalize">
            {template.templateType || 'plan'} template
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ChefHat className="h-5 w-5" />
              Edit Template
            </CardTitle>
            <CardDescription>Update your meal plan template details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Template Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., 7-Day Weight Loss Plan"
                />
              </div>
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Difficulty Level</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger><SelectValue placeholder="Select difficulty" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Short summary of the template..."
              />
            </div>

            {/* Public toggle */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isPublic"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="h-4 w-4 text-blue-600 rounded border-gray-300"
              />
              <Label htmlFor="isPublic" className="cursor-pointer">
                Make this template public (visible to all users)
              </Label>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || !name || !category}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
