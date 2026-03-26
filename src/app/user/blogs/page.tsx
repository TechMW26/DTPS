'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import PageTransition from '@/components/animations/PageTransition';
import { useTheme } from '@/contexts/ThemeContext';
import { ArrowLeft, Clock, Bookmark, Search, BookOpen, TrendingUp, Heart, Sparkles, User, ImageOff } from 'lucide-react';
import UserNavBar from '@/components/client/UserNavBar';
import SpoonGifLoader from '@/components/ui/SpoonGifLoader';

interface Blog {
  _id: string;
  uuid: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  readTime: number;
  featuredImage: string;
  thumbnailImage?: string;
  publishedAt?: string;
  createdAt: string;
  author: string;
  isFeatured?: boolean;
  views: number;
  likes: number;
  tags: string[];
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

const getCategoryIcon = (category: string) => {
  switch (category.toLowerCase()) {
    case 'nutrition':
      return '🥗';
    case 'fitness':
      return '💪';
    case 'wellness':
      return '🧘';
    case 'recipes':
      return '🍳';
    case 'lifestyle':
      return '🌟';
    default:
      return '📖';
  }
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Kolkata'
  });
};

export default function BlogsPage() {
  const { isDarkMode } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [categories, setCategories] = useState<string[]>(['All']);
  const [bookmarkedBlogs, setBookmarkedBlogs] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    fetchBlogs();
  }, []);

  const fetchBlogs = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/client/blogs');
      if (!response.ok) {
        throw new Error(`Failed to fetch blogs (${response.status})`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Blogs response was not JSON');
      }

      const data = await response.json();
      setBlogs(data.blogs || []);
      const uniqueCategories = ['All', ...(data.categories || []).map((c: string) =>
        c.charAt(0).toUpperCase() + c.slice(1)
      )];
      setCategories(uniqueCategories);
    } catch (error) {
      console.error('Error fetching blogs:', error);
      setError('Unable to load blogs right now.');
    } finally {
      setLoading(false);
    }
  };

  const toggleBookmark = (e: React.MouseEvent, blogId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setBookmarkedBlogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(blogId)) {
        newSet.delete(blogId);
      } else {
        newSet.add(blogId);
      }
      return newSet;
    });
  };

  const filteredBlogs = blogs.filter((blog) => {
    const matchesCategory = selectedCategory === 'All' ||
      blog.category.toLowerCase() === selectedCategory.toLowerCase();
    const matchesSearch = blog.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      blog.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      blog.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const featuredBlogs = filteredBlogs.filter(blog => blog.isFeatured);
  const regularBlogs = filteredBlogs.filter(blog => !blog.isFeatured);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-100 bg-white dark:bg-gray-950">
        <SpoonGifLoader size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <PageTransition>
        <div className={`min-h-screen pb-24 transition-colors duration-300 ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
          <div className="px-4 pt-10">
            <Link href="/user" className="inline-flex items-center gap-2 text-[#3AB1A0] font-semibold">
              <ArrowLeft className="h-5 w-5" />
              Back
            </Link>
            <div className={`mt-6 rounded-2xl p-6 ${isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white shadow-md'}`}>
              <p className={`${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{error}</p>
              <button
                type="button"
                onClick={fetchBlogs}
                className="mt-4 inline-flex items-center justify-center px-4 py-2 rounded-full bg-[#3AB1A0] text-white text-sm font-semibold"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className={`min-h-screen pb-24 transition-colors duration-300 ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        {/* Header */}
        <div className={`sticky top-0 z-40 backdrop-blur-sm border-b transition-colors duration-300 ${isDarkMode ? 'bg-gray-800/95 border-gray-700' : 'bg-white/95 border-gray-100'}`}>
          <div className="px-4 py-4">
            <div className="flex items-center gap-3">
              <Link
                href="/user"
                className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-[#3AB1A0]/10 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-[#3AB1A0]" />
              </Link>
              <div className="flex-1">
                <h1 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Health Blogs</h1>
                <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Tips & insights for your wellness journey</p>
              </div>
              <div className="p-2 bg-linear-to-br from-[#3AB1A0] to-[#2D8A7C] rounded-xl shadow-md">
                <BookOpen className="h-5 w-5 text-white" />
              </div>
            </div>

            {/* Search */}
            <div className="mt-4 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search articles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full h-12 pl-12 pr-4 rounded-xl placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3AB1A0] transition-all ${isDarkMode
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-100 text-gray-900'
                  }`}
              />
            </div>

            {/* Category Filter */}
            <div className="flex gap-2 mt-4 overflow-x-auto pb-2 scrollbar-hide">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${selectedCategory === category
                      ? 'bg-linear-to-r from-[#3AB1A0] to-[#2D8A7C] text-white shadow-md'
                      : isDarkMode
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                    }`}
                >
                  {category !== 'All' && <span className="mr-1">{getCategoryIcon(category)}</span>}
                  {category}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Featured Blogs */}
        {featuredBlogs.length > 0 && (
          <div className="px-4 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-[#E06A26]/10 rounded-lg">
                <Sparkles className="h-4 w-4 text-[#E06A26]" />
              </div>
              <h2 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Featured</h2>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4">
              {featuredBlogs.map((blog) => (
                <Link
                  key={blog._id}
                  href={`/user/blogs/${blog.slug || blog._id}`}
                  className={`block w-72 shrink-0 rounded-2xl shadow-sm overflow-hidden hover:shadow-lg transition-all hover:-translate-y-1 ${isDarkMode ? 'bg-gray-800' : 'bg-white'
                    }`}
                >
                  <div className="h-36 relative bg-gray-100 overflow-hidden">
                    {blog.thumbnailImage || blog.featuredImage ? (
                      <img
                        src={blog.thumbnailImage || blog.featuredImage}
                        alt={blog.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                        <ImageOff className="h-8 w-8 text-gray-400" />
                      </div>
                    )}
                    <span className={`absolute top-3 left-3 text-xs font-bold px-2.5 py-1 rounded-full border ${getCategoryColor(blog.category)}`}>
                      {getCategoryIcon(blog.category)} {blog.category.charAt(0).toUpperCase() + blog.category.slice(1)}
                    </span>
                    <button
                      className={`absolute top-3 right-3 h-8 w-8 rounded-full flex items-center justify-center transition-all ${bookmarkedBlogs.has(blog._id)
                          ? 'bg-[#E06A26] text-white'
                          : 'bg-white/90 text-gray-600 hover:bg-white'
                        }`}
                      onClick={(e) => toggleBookmark(e, blog._id)}
                    >
                      <Bookmark className={`h-4 w-4 ${bookmarkedBlogs.has(blog._id) ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                  <div className="p-4">
                    <h3 className={`font-bold text-base line-clamp-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{blog.title}</h3>
                    <p className={`text-sm mt-1 line-clamp-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{blog.description}</p>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#3AB1A0]/10 flex items-center justify-center">
                          <User className="h-3 w-3 text-[#3AB1A0]" />
                        </div>
                        <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{blog.author}</span>
                      </div>
                      <div className={`flex items-center gap-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        <Clock className="h-3 w-3" />
                        {blog.readTime} min
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* All Articles */}
        <div className="px-4 pt-2 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-[#3AB1A0]/10 rounded-lg">
              <TrendingUp className="h-4 w-4 text-[#3AB1A0]" />
            </div>
            <h2 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Latest Articles</h2>
          </div>
          <div className="space-y-3">
            {regularBlogs.map((blog) => (
              <Link
                key={blog._id}
                href={`/user/blogs/${blog.slug || blog._id}`}
                className={`flex gap-4 rounded-2xl p-3 shadow-sm hover:shadow-md transition-all group ${isDarkMode ? 'bg-gray-800' : 'bg-white'
                  }`}
              >
                <div className="w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-gray-100">
                  {blog.thumbnailImage || blog.featuredImage ? (
                    <img
                      src={blog.thumbnailImage || blog.featuredImage}
                      alt={blog.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center text-3xl ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                      {getCategoryIcon(blog.category)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 py-1">
                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${getCategoryColor(blog.category)} mb-1`}>
                    {blog.category.charAt(0).toUpperCase() + blog.category.slice(1)}
                  </span>
                  <h3 className={`font-bold text-sm line-clamp-2 group-hover:text-[#3AB1A0] transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>{blog.title}</h3>
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      {formatDate(blog.publishedAt || blog.createdAt)}
                    </span>
                    <div className={`flex items-center gap-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      <Clock className="h-3 w-3" />
                      {blog.readTime} min
                    </div>
                    <div className={`flex items-center gap-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      <Heart className="h-3 w-3" />
                      {blog.likes}
                    </div>
                  </div>
                </div>
                <button
                  className={`self-start p-2 rounded-full transition-all ${bookmarkedBlogs.has(blog._id)
                      ? 'text-[#E06A26]'
                      : isDarkMode ? 'text-gray-600 hover:text-gray-400' : 'text-gray-300 hover:text-gray-500'
                    }`}
                  onClick={(e) => toggleBookmark(e, blog._id)}
                >
                  <Bookmark className={`h-4 w-4 ${bookmarkedBlogs.has(blog._id) ? 'fill-current' : ''}`} />
                </button>
              </Link>
            ))}
          </div>

          {filteredBlogs.length === 0 && !loading && (
            <div className="text-center py-16">
              <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                <BookOpen className={`h-10 w-10 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
              </div>
              <p className={`font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>No articles found</p>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Try adjusting your search or filters</p>
            </div>
          )}
        </div>


      </div>
    </PageTransition>
  );
}
