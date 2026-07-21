'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  X,
  ImagePlus,
  Eye,
  EyeOff,
  Star,
  StarOff,
  Search,
  BookOpen,
  Calendar,
  Clock,
  User,
  Tag,
  FileText,
  Bold,
  Italic,
  Underline,
  Heading2,
  Pilcrow,
  List,
  ListOrdered
} from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { compressImage } from '@/lib/imageCompression';
import { useBodyScrollLock } from '@/hooks';
import { useDataRefresh, emitDataChange, DataEventTypes } from '@/lib/events/useDataRefresh';

interface Blog {
  _id: string;
  uuid: string;
  title: string;
  slug: string;
  description: string;
  content: string;
  category: string;
  featuredImage: string;
  thumbnailImage?: string;
  author: string;
  readTime: number;
  tags: string[];
  isFeatured: boolean;
  isActive: boolean;
  displayOrder: number;
  views: number;
  likes: number;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  metaTitle?: string;
  metaDescription?: string;
}

const CATEGORIES = [
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'wellness', label: 'Wellness' },
  { value: 'recipes', label: 'Recipes' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'other', label: 'Other' },
];

const getCategoryColor = (category: string) => {
  switch (category.toLowerCase()) {
    case 'nutrition':
      return 'bg-[#3AB1A0]/10 text-[#3AB1A0] border-[#3AB1A0]/20';
    case 'fitness':
      return 'bg-[#E06A26]/10 text-[#E06A26] border-[#E06A26]/20';
    case 'wellness':
      return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'recipes':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'lifestyle':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
};

// Rich Text Editor Component
interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

function RichTextEditor({ value, onChange, placeholder, rows = 6 }: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertFormat = (tag: string, isBlock: boolean = false) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    let formattedText = '';
    let cursorOffset = 0;

    if (isBlock) {
      // Block-level elements (h2, p, ul, ol)
      if (tag === 'ul') {
        const lines = selectedText ? selectedText.split('\n') : [''];
        formattedText = '<ul>\n' + lines.map(line => `  <li>${line}</li>`).join('\n') + '\n</ul>';
        cursorOffset = formattedText.length;
      } else if (tag === 'ol') {
        const lines = selectedText ? selectedText.split('\n') : [''];
        formattedText = '<ol>\n' + lines.map(line => `  <li>${line}</li>`).join('\n') + '\n</ol>';
        cursorOffset = formattedText.length;
      } else {
        formattedText = `<${tag}>${selectedText}</${tag}>`;
        cursorOffset = selectedText ? formattedText.length : tag.length + 2;
      }
    } else {
      // Inline elements (strong, em, u)
      formattedText = `<${tag}>${selectedText}</${tag}>`;
      cursorOffset = selectedText ? formattedText.length : tag.length + 2;
    }

    const newValue = value.substring(0, start) + formattedText + value.substring(end);
    onChange(newValue);

    // Set cursor position after the change
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + cursorOffset;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const formatButtons = [
    { icon: Bold, label: 'Bold', tag: 'strong', isBlock: false },
    { icon: Italic, label: 'Italic', tag: 'em', isBlock: false },
    { icon: Underline, label: 'Underline', tag: 'u', isBlock: false },
    { icon: Heading2, label: 'Heading 2', tag: 'h2', isBlock: true },
    { icon: Pilcrow, label: 'Paragraph', tag: 'p', isBlock: true },
    { icon: List, label: 'Bullet List', tag: 'ul', isBlock: true },
    { icon: ListOrdered, label: 'Numbered List', tag: 'ol', isBlock: true },
  ];

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 p-2 bg-gray-50 border-b border-gray-200">
        {formatButtons.map((btn) => (
          <button
            key={btn.tag}
            type="button"
            onClick={() => insertFormat(btn.tag, btn.isBlock)}
            className="p-2 rounded hover:bg-gray-200 transition-colors group relative"
            title={btn.label}
          >
            <btn.icon className="h-4 w-4 text-gray-600" />
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              {btn.label}
            </span>
          </button>
        ))}
      </div>
      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 text-sm focus:outline-none focus:ring-0 resize-none"
      />
    </div>
  );
}

export default function BlogsManagement() {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBlog, setEditingBlog] = useState<Blog | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'nutrition',
    author: '',
    readTime: '5',
    tags: '',
    isFeatured: false,
    isActive: true,
    displayOrder: 0,
    featuredImage: '',
    metaTitle: '',
    metaDescription: '',
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [featuredImageFile, setFeaturedImageFile] = useState<File | null>(null);

  // Prevent body scroll when dialog is open
  useBodyScrollLock(isDialogOpen);

  const fetchBlogs = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      params.set('showInactive', showInactive.toString());
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (searchQuery) params.set('search', searchQuery);

      const response = await fetch(`/api/admin/blogs?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch blogs');
      }
      const data = await response.json();
      setBlogs(data.blogs || []);
    } catch (error) {
      console.error('Error fetching blogs:', error);
      toast.error('Failed to load blogs');
    } finally {
      setIsLoading(false);
    }
  }, [showInactive, categoryFilter, searchQuery]);

  useEffect(() => {
    fetchBlogs();
  }, [fetchBlogs]);

  // Subscribe to real-time blog updates
  useDataRefresh(DataEventTypes.BLOGS_UPDATED, fetchBlogs, [fetchBlogs]);

  const handleOpenDialog = (blog?: Blog) => {
    setFeaturedImageFile(null);
    if (blog) {
      setEditingBlog(blog);
      setFormData({
        title: blog.title,
        description: blog.description,
        category: blog.category,
        author: blog.author,
        readTime: blog.readTime.toString(),
        tags: blog.tags.join(', '),
        isFeatured: blog.isFeatured,
        isActive: blog.isActive,
        displayOrder: blog.displayOrder,
        featuredImage: blog.featuredImage,
        metaTitle: blog.metaTitle || '',
        metaDescription: blog.metaDescription || '',
      });
      setImagePreview(blog.featuredImage);
    } else {
      setEditingBlog(null);
      setFormData({
        title: '',
        description: '',
        category: 'nutrition',
        author: '',
        readTime: '5',
        tags: '',
        isFeatured: false,
        isActive: true,
        displayOrder: blogs.length,
        featuredImage: '',
        metaTitle: '',
        metaDescription: '',
      });
      setImagePreview(null);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    setIsDialogOpen(false);
    setEditingBlog(null);
    setImagePreview(null);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImage(file, {
        maxWidth: 1920,
        maxHeight: 1080,
        quality: 0.85,
        format: 'image/jpeg'
      });

      if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
      const compressedFile = new File(
        [compressed.blob],
        file.name.replace(/\.[^.]+$/, '.jpg'),
        { type: 'image/jpeg' },
      );
      setFeaturedImageFile(compressedFile);
      setImagePreview(URL.createObjectURL(compressedFile));

      const savedPercent = Math.round((1 - compressed.compressedSize / compressed.originalSize) * 100);
      toast.success(`Image compressed: ${savedPercent}% smaller`);
    } catch (error) {
      console.error('Image compression failed:', error);
      toast.error('Failed to process image');
    }
  };

  const handleSaveBlog = async () => {
    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!formData.description.trim()) {
      toast.error('Description is required');
      return;
    }
    if (!formData.author.trim()) {
      toast.error('Author is required');
      return;
    }
    if (!editingBlog && !featuredImageFile) {
      toast.error('Featured image is required');
      return;
    }

    try {
      setIsSaving(true);

      const submitData = new FormData();
      submitData.append('title', formData.title);
      submitData.append('description', formData.description);
      submitData.append('content', formData.description);
      submitData.append('category', formData.category);
      submitData.append('author', formData.author);
      submitData.append('readTime', formData.readTime);
      submitData.append('tags', formData.tags);
      submitData.append('isFeatured', formData.isFeatured.toString());
      submitData.append('isActive', formData.isActive.toString());
      submitData.append('displayOrder', formData.displayOrder.toString());
      submitData.append('metaTitle', formData.metaTitle);
      submitData.append('metaDescription', formData.metaDescription);

      if (editingBlog) {
        // For editing, only append image if a new one was uploaded
        if (featuredImageFile) submitData.append('featuredImage', featuredImageFile);

        const response = await fetch(`/api/admin/blogs/${editingBlog._id}`, {
          method: 'PUT',
          body: submitData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update blog');
        }

        toast.success('Blog updated successfully');
        emitDataChange(DataEventTypes.BLOGS_UPDATED);
      } else {
        // For new blog, always append the image
        submitData.append('featuredImage', featuredImageFile!);

        const response = await fetch('/api/admin/blogs', {
          method: 'POST',
          body: submitData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create blog');
        }

        toast.success('Blog created successfully');
        emitDataChange(DataEventTypes.BLOGS_UPDATED);
      }

      handleCloseDialog();
      fetchBlogs();
    } catch (error: any) {
      console.error('Error saving blog:', error);
      toast.error(error.message || (editingBlog ? 'Failed to update blog' : 'Failed to create blog'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBlog = async (id: string) => {
    if (!confirm('Are you sure you want to delete this blog?')) return;

    try {
      const response = await fetch(`/api/admin/blogs/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete blog');
      }

      toast.success('Blog deleted successfully');
      emitDataChange(DataEventTypes.BLOGS_UPDATED);
      fetchBlogs();
    } catch (error) {
      console.error('Error deleting blog:', error);
      toast.error('Failed to delete blog');
    }
  };

  const handleToggleActive = async (blog: Blog) => {
    try {
      const newStatus = !blog.isActive;

      const response = await fetch(`/api/admin/blogs/${blog._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newStatus })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to toggle blog status');
      }

      const updatedBlog = await response.json();

      // Update local state immediately for fast UI feedback
      setBlogs(prev => prev.map(b => b._id === blog._id ? updatedBlog.blog || updatedBlog : b));

      toast.success(`Blog ${newStatus ? 'activated' : 'deactivated'} successfully`);

      // Emit event for real-time updates
      emitDataChange(DataEventTypes.BLOGS_UPDATED);
    } catch (error: any) {
      console.error('Error toggling blog status:', error);
      toast.error(error.message || 'Failed to toggle blog status');
    }
  };

  const handleToggleFeatured = async (blog: Blog) => {
    try {
      const submitData = new FormData();
      submitData.append('title', blog.title);
      submitData.append('description', blog.description);
      submitData.append('content', blog.content);
      submitData.append('category', blog.category);
      submitData.append('author', blog.author);
      submitData.append('isFeatured', (!blog.isFeatured).toString());
      submitData.append('isActive', blog.isActive.toString());
      submitData.append('displayOrder', blog.displayOrder.toString());

      const response = await fetch(`/api/admin/blogs/${blog._id}`, {
        method: 'PUT',
        body: submitData,
      });

      if (!response.ok) {
        throw new Error('Failed to update blog');
      }

      toast.success(`Blog ${blog.isFeatured ? 'unfeatured' : 'featured'}`);
      emitDataChange(DataEventTypes.BLOGS_UPDATED);
      fetchBlogs();
    } catch (error) {
      console.error('Error toggling featured:', error);
      toast.error('Failed to update blog');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Blog Management</h1>
            <p className="text-gray-500 mt-1">Create and manage blog posts</p>
          </div>
          <Button onClick={() => handleOpenDialog()} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Blog
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search blogs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInactive(!showInactive)}
            className="gap-2"
          >
            {showInactive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showInactive ? 'Hide Inactive' : 'Show Inactive'}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#3AB1A0]" />
          </div>
        ) : blogs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <BookOpen className="h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-500 text-lg">No blogs yet</p>
              <Button onClick={() => handleOpenDialog()} className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Create Your First Blog
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {blogs.map((blog) => (
              <Card key={blog._id} className={`overflow-hidden ${!blog.isActive ? 'opacity-60' : ''}`}>
                <div className="relative aspect-video bg-gray-100">
                  {blog.thumbnailImage || blog.featuredImage ? (
                    <img
                      src={blog.thumbnailImage || blog.featuredImage}
                      alt={blog.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImagePlus className="h-8 w-8 text-gray-300" />
                    </div>
                  )}
                  <div className="absolute top-2 left-2 flex gap-2">
                    <Badge className={getCategoryColor(blog.category)}>
                      {blog.category}
                    </Badge>
                    {blog.isFeatured && (
                      <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
                        <Star className="h-3 w-3 mr-1 fill-yellow-500" />
                        Featured
                      </Badge>
                    )}
                  </div>
                  {!blog.isActive && (
                    <Badge className="absolute top-2 right-2 bg-red-100 text-red-700">
                      Inactive
                    </Badge>
                  )}
                </div>
                <CardContent className="p-4">
                  <h3 className="font-semibold text-gray-900 line-clamp-2 mb-2">
                    {blog.title}
                  </h3>
                  <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                    {blog.description}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {blog.author}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {blog.readTime} min
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {blog.views}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t">
                    <span className="text-xs text-gray-400">
                      {blog.publishedAt ? formatDate(blog.publishedAt) : formatDate(blog.createdAt)}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleFeatured(blog)}
                        className="h-8 w-8 p-0"
                      >
                        {blog.isFeatured ? (
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        ) : (
                          <StarOff className="h-4 w-4 text-gray-400" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(blog)}
                        className="h-8 w-8 p-0"
                      >
                        {blog.isActive ? (
                          <Eye className="h-4 w-4 text-green-500" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-gray-400" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(blog)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit2 className="h-4 w-4 text-blue-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteBlog(blog._id)}
                        className="h-8 w-8 p-0"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-4xl w-[90vw] max-h-[90vh] overflow-y-auto mx-auto">
            <DialogHeader>
              <DialogTitle className="dark:text-white">
                {editingBlog ? 'Edit Blog' : 'Create New Blog'}
              </DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
              {/* Left Column */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter blog title"
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description * (with formatting)</Label>
                  <RichTextEditor
                    value={formData.description}
                    onChange={(value) => setFormData(prev => ({ ...prev, description: value }))}
                    placeholder="Write your blog description here. Use the toolbar for formatting: Bold, Italic, Underline, Headings, Paragraphs, Bullet & Number lists"
                    rows={10}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="category">Category *</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(cat => (
                          <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="readTime">Read Time (min)</Label>
                    <Input
                      id="readTime"
                      type="number"
                      min="1"
                      value={formData.readTime}
                      onChange={(e) => setFormData(prev => ({ ...prev, readTime: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="author">Author *</Label>
                  <Input
                    id="author"
                    value={formData.author}
                    onChange={(e) => setFormData(prev => ({ ...prev, author: e.target.value }))}
                    placeholder="Author name"
                  />
                </div>

                <div>
                  <Label htmlFor="tags">Tags (comma separated)</Label>
                  <Input
                    id="tags"
                    value={formData.tags}
                    onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                    placeholder="nutrition, health, tips"
                  />
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-4">
                <div>
                  <Label>Featured Image *</Label>
                  <div className="mt-2">
                    {imagePreview ? (
                      <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => {
                            if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
                            setImagePreview(null);
                            setFeaturedImageFile(null);
                            setFormData(prev => ({ ...prev, featuredImage: '' }));
                          }}
                          className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center aspect-video bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                        <ImagePlus className="h-8 w-8 text-gray-400 mb-2" />
                        <span className="text-sm text-gray-500">Click to upload image</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleImageChange}
                        />
                      </label>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="isFeatured"
                      checked={formData.isFeatured}
                      onChange={(e) => setFormData(prev => ({ ...prev, isFeatured: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300 text-[#3AB1A0] focus:ring-[#3AB1A0]"
                    />
                    <Label htmlFor="isFeatured" className="font-normal">Featured Blog</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={formData.isActive}
                      onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300 text-[#3AB1A0] focus:ring-[#3AB1A0]"
                    />
                    <Label htmlFor="isActive" className="font-normal">Active (Published)</Label>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-medium text-sm text-gray-700 mb-3">SEO Settings (Optional)</h4>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="metaTitle">Meta Title</Label>
                      <Input
                        id="metaTitle"
                        value={formData.metaTitle}
                        onChange={(e) => setFormData(prev => ({ ...prev, metaTitle: e.target.value }))}
                        placeholder="SEO title (max 60 chars)"
                        maxLength={60}
                      />
                    </div>
                    <div>
                      <Label htmlFor="metaDescription">Meta Description</Label>
                      <Textarea
                        id="metaDescription"
                        value={formData.metaDescription}
                        onChange={(e) => setFormData(prev => ({ ...prev, metaDescription: e.target.value }))}
                        placeholder="SEO description (max 160 chars)"
                        maxLength={160}
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button onClick={handleSaveBlog} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  editingBlog ? 'Update Blog' : 'Create Blog'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
