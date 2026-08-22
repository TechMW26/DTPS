'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useTheme } from '@/contexts/ThemeContext';
import PageTransition from '@/components/animations/PageTransition';
import { ArrowLeft, Clock, Bookmark, Share2, Heart, User, Calendar, Tag, Eye, ChevronRight, ImageOff } from 'lucide-react';
import UserNavBar from '@/components/client/UserNavBar';
import { ClientPageSkeleton } from '@/components/ui/skeleton';

interface Blog {
  _id: string;
  uuid: string;
  slug: string;
  title: string;
  description: string;
  content: string;
  category: string;
  readTime: number;
  featuredImage: string;
  thumbnailImage?: string;
  publishedAt?: string;
  createdAt: string;
  author: string;
  authorImage?: string;
  isFeatured?: boolean;
  views: number;
  likes: number;
  tags: string[];
}

interface RelatedBlog {
  _id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  thumbnailImage?: string;
  author: string;
  readTime: number;
  publishedAt?: string;
}

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

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-IN', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Kolkata'
  });
};

export default function BlogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const blogId = resolvedParams.id;

  const { isDarkMode } = useTheme();
  const [blog, setBlog] = useState<Blog | null>(null);
  const [relatedBlogs, setRelatedBlogs] = useState<RelatedBlog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    fetchBlog();
  }, [blogId]);

  const fetchBlog = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/client/blogs/${blogId}`);
      if (!response.ok) throw new Error('Blog not found');

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Blog response was not JSON');
      }

      const data = await response.json();
      setBlog(data.blog);
      setRelatedBlogs(data.relatedBlogs || []);
      setLikesCount(data.blog.likes || 0);
    } catch (err) {
      setError('Unable to load this blog right now.');
      console.error('Error fetching blog:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    if (!blog) return;

    try {
      const action = liked ? 'unlike' : 'like';
      const response = await fetch(`/api/client/blogs/${blog._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });

      if (response.ok) {
        const data = await response.json();
        setLiked(!liked);
        setLikesCount(data.likes);
      }
    } catch (err) {
      console.error('Error updating like:', err);
    }
  };

  const handleShare = async () => {
    if (!blog) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title: blog.title,
          text: blog.description,
          url: window.location.href
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert('Link copied to clipboard!');
      }
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  if (loading) {
    return <ClientPageSkeleton variant="grid" showHeader={false} />;
  }

  if (error || !blog) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
          <ImageOff className={`h-10 w-10 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
        </div>
        <p className={`text-lg font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Blog not found</p>
        <Link
          href="/user/blogs"
          className="mt-4 px-6 py-2 bg-[#3AB1A0] text-white rounded-full font-medium hover:bg-[#2D8A7C] transition-colors"
        >
          Back to Blogs
        </Link>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        {/* Header Image */}
        <div className="relative h-72 sm:h-80 bg-gray-200">
          {blog.featuredImage ? (
            <img
              src={blog.featuredImage}
              alt={blog.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${isDarkMode ? 'bg-gray-800' : 'bg-gray-200'}`}>
              <ImageOff className="h-16 w-16 text-gray-400" />
            </div>
          )}
          <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-black/30" />

          {/* Top Navigation */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 pt-8">
            <Link
              href="/user/blogs"
              className="h-10 w-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg"
            >
              <ArrowLeft className="h-5 w-5 text-gray-700" />
            </Link>
            <div className="flex gap-2">
              <button
                onClick={() => setBookmarked(!bookmarked)}
                className={`h-10 w-10 rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm transition-colors ${bookmarked ? 'bg-[#E06A26] text-white' : 'bg-white/90 text-gray-700'
                  }`}
              >
                <Bookmark className={`h-5 w-5 ${bookmarked ? 'fill-current' : ''}`} />
              </button>
              <button
                onClick={handleShare}
                className="h-10 w-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg"
              >
                <Share2 className="h-5 w-5 text-gray-700" />
              </button>
            </div>
          </div>

          {/* Category Badge */}
          <div className="absolute bottom-8 left-4">
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${getCategoryColor(blog.category)}`}>
              {blog.category.charAt(0).toUpperCase() + blog.category.slice(1)}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className={`-mt-6 rounded-t-3xl relative z-10 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
          <div className="px-5 py-6">
            {/* Title */}
            <h1 className={`text-2xl sm:text-3xl font-bold leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {blog.title}
            </h1>

            {/* Meta Info */}
            <div className="flex flex-wrap items-center gap-4 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-[#3AB1A0]/10 flex items-center justify-center">
                  {blog.authorImage ? (
                    <img src={blog.authorImage} alt={blog.author} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <User className="h-5 w-5 text-[#3AB1A0]" />
                  )}
                </div>
                <div>
                  <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{blog.author}</p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    {formatDate(blog.publishedAt || blog.createdAt)}
                  </p>
                </div>
              </div>
              <div className={`flex items-center gap-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {blog.readTime} min read
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  {blog.views} views
                </span>
              </div>
            </div>

            {/* Tags */}
            {blog.tags && blog.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {blog.tags.map((tag, index) => (
                  <span
                    key={index}
                    className={`text-xs px-3 py-1 rounded-full ${isDarkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'}`}
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Blog Content - only show description if no content or different from content */}
            {blog.content ? (
              <div
                className={`mt-6 prose prose-lg max-w-none ${isDarkMode ? 'prose-invert' : ''}`}
                dangerouslySetInnerHTML={{ __html: blog.content }}
                style={{
                  lineHeight: '1.8',
                }}
              />
            ) : blog.description ? (
              <p className={`mt-6 text-base leading-relaxed ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                {blog.description}
              </p>
            ) : null}

            {/* Like Button */}
            <div className="flex items-center justify-center mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={handleLike}
                className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all ${liked
                    ? 'bg-red-500 text-white'
                    : isDarkMode
                      ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                <Heart className={`h-5 w-5 ${liked ? 'fill-current' : ''}`} />
                <span>{likesCount} {likesCount === 1 ? 'Like' : 'Likes'}</span>
              </button>
            </div>

            {/* Related Blogs */}
            {relatedBlogs.length > 0 && (
              <div className="mt-10">
                <h3 className={`text-lg font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Related Articles
                </h3>
                <div className="space-y-3">
                  {relatedBlogs.map((related) => (
                    <Link
                      key={related._id}
                      href={`/user/blogs/${related.slug || related._id}`}
                      className={`flex gap-4 p-3 rounded-xl transition-all ${isDarkMode ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'
                        }`}
                    >
                      <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-gray-200">
                        {related.thumbnailImage ? (
                          <img
                            src={related.thumbnailImage}
                            alt={related.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className={`w-full h-full flex items-center justify-center ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                            <ImageOff className="h-6 w-6 text-gray-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className={`font-semibold text-sm line-clamp-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {related.title}
                        </h4>
                        <div className={`flex items-center gap-2 mt-2 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          <span>{related.author}</span>
                          <span>•</span>
                          <span>{related.readTime} min</span>
                        </div>
                      </div>
                      <ChevronRight className={`h-5 w-5 self-center ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>


      </div>
    </PageTransition>
  );
}
