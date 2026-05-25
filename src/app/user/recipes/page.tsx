'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import PageTransition from '@/components/animations/PageTransition';
import { useTheme } from '@/contexts/ThemeContext';
import { ArrowLeft, Clock, Users, Flame, Search, X, Loader2 } from 'lucide-react';
import SpoonGifLoader from '@/components/ui/SpoonGifLoader';
import { useRouter } from 'next/navigation';
import { useDebounce } from '@/hooks/useDebounce';

interface Recipe {
  _id: string;
  name: string;
  description?: string;
  category?: string;
  servings?: number;
  servingSize?: string;
  cookTime?: string;
  prepTime?: string;
  calories?: number;
  difficulty?: string;
  image?: string;
  ingredients?: string[];
  instructions?: string[];
}

export default function RecipesPage() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalRecipes, setTotalRecipes] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const ITEMS_PER_PAGE = 25;

  // Debounce search term to prevent excessive API calls (400ms delay)
  const debouncedSearchTerm = useDebounce(searchTerm, 400);

  // Track abort controller for cancelling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Show searching indicator when user is typing
  useEffect(() => {
    if (searchTerm !== debouncedSearchTerm) {
      setIsSearching(true);
    } else {
      setIsSearching(false);
    }
  }, [searchTerm, debouncedSearchTerm]);

  // Fetch recipes when debounced search or category changes
  useEffect(() => {
    setRecipes([]);
    setPage(1);
    fetchRecipes(1);
  }, [debouncedSearchTerm]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const fetchRecipes = useCallback(async (pageNum: number) => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);

      const params = new URLSearchParams();
      params.append('page', pageNum.toString());
      params.append('limit', ITEMS_PER_PAGE.toString());
      params.append('includeTotal', 'true');

      if (debouncedSearchTerm) {
        params.append('search', debouncedSearchTerm);
        // When searching, use relevance-based sorting
        params.append('sortBy', 'relevance');
      } else {
        params.append('sortBy', 'name');
      }

      const response = await fetch(`/api/recipes?${params.toString()}`, {
        signal: abortControllerRef.current.signal
      });

      if (response.ok) {
        const data = await response.json();
        const newRecipes = data.recipes || [];

        setRecipes(newRecipes);

        const total = Number(data.pagination?.total ?? 0);
        const pages = Number(data.pagination?.pages ?? 1);
        setTotalRecipes(total);
        setTotalPages(Math.max(1, pages));
        setPage(pageNum);
      }
    } catch (error: any) {
      // Ignore abort errors - they're expected when cancelling requests
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Error fetching recipes:', error);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchTerm]);

  // Show full-page loading only on initial load, not during searches
  if (loading && recipes.length === 0 && !searchTerm) {
    return (
      <div className={`fixed inset-0 flex items-center justify-center z-100 ${isDarkMode ? 'bg-gray-950' : 'bg-white'}`}>
        <SpoonGifLoader size="lg" />
      </div>
    );
  }

  const effectiveTotalRecipes = totalRecipes > 0 ? totalRecipes : recipes.length;

  const paginationButtonClass = (disabled: boolean) => `px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${disabled
      ? isDarkMode
        ? 'bg-gray-900 text-gray-500 border-gray-800 cursor-not-allowed'
        : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
      : isDarkMode
        ? 'bg-gray-800 text-white border-gray-700 hover:bg-gray-700'
        : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50'
    }`;

  const renderPagination = (className: string) => {
    if (recipes.length === 0 || totalPages <= 1) return null;
    return (
      <div className={className}>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => fetchRecipes(Math.max(1, page - 1))}
            disabled={page <= 1}
            className={paginationButtonClass(page <= 1)}
          >
            Prev
          </button>
          <div className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
            Page {page} of {totalPages}
          </div>
          <button
            onClick={() => fetchRecipes(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className={paginationButtonClass(page >= totalPages)}
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  return (
    <PageTransition>
      <div className={`min-h-screen pb-24 transition-colors duration-300 ${isDarkMode ? 'bg-linear-to-b from-gray-900 to-gray-900' : 'bg-linear-to-b from-white to-gray-50'}`}>
        {/* Header */}
        <div className={`sticky top-0 z-40 transition-colors duration-300 border-b ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
          <div className="relative flex items-center justify-center px-4 py-4">
            <button
              onClick={() => router.back()}
              className="absolute left-4 flex items-center justify-center w-10 h-10 rounded-full hover:bg-[#3AB1A0]/10 transition-colors"
            >
              <ArrowLeft className={`w-5 h-5 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`} />
            </button>
            <h1 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-black'}`}>Recipes</h1>
          </div>
        </div>

        <div className="px-4 py-6 max-w-5xl mx-auto">
          {/* Search Bar */}
          <div className="mb-6 relative">
            <Search className={`absolute left-4 top-3.5 w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`} />
            <input
              type="text"
              placeholder="Search recipes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-12 pr-12 py-3 rounded-xl focus:outline-none focus:border-[#3AB1A0] focus:ring-1 focus:ring-[#3AB1A0]/20 transition-all ${isDarkMode
                ? 'bg-gray-900 border border-gray-700 text-white placeholder:text-gray-400'
                : 'bg-white border border-gray-200 text-gray-900'
                }`}
            />
            {isSearching && (
              <Loader2 className={`absolute right-4 top-3.5 w-5 h-5 animate-spin ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`} />
            )}
            {searchTerm && !isSearching && (
              <button
                onClick={() => setSearchTerm('')}
                className={`absolute right-4 top-3.5 ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Top Pagination */}
          {renderPagination('mb-6')}

          {/* Recipes Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {recipes.map((recipe) => (
              <Link
                key={recipe._id}
                href={`/user/recipes/${recipe._id}`}
                className={`rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all hover:scale-105 border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
                  }`}
              >
                {/* Recipe Image with Lazy Loading & Skeleton */}
                <div className="relative h-44 bg-linear-to-br from-gray-200 to-gray-300 overflow-hidden">
                  {recipe.image && !brokenImages[recipe._id] ? (
                    <img
                      src={recipe.image}
                      alt={recipe.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                      onError={() => {
                        setBrokenImages((prev) => ({ ...prev, [recipe._id]: true }));
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Flame className="w-10 h-10 text-gray-400" />
                    </div>
                  )}

                  {recipe.difficulty && (
                    <div
                      className={`absolute top-3 right-3 px-2 py-1 rounded-lg text-xs font-bold text-[#E06A26] ${isDarkMode ? 'bg-gray-900/80' : 'bg-white/95'
                        }`}
                    >
                      {recipe.difficulty}
                    </div>
                  )}
                </div>

                {/* Recipe Info */}
                <div className="p-4">
                  <div className="mb-2">
                    <span className="inline-block px-2 py-1 rounded-md text-xs font-bold bg-[#3AB1A0]/10 text-[#3AB1A0]">
                      {recipe.category || 'Recipe'}
                    </span>
                  </div>
                  <h3 className={`font-bold mb-2 line-clamp-2 text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{recipe.name}</h3>
                  <p className={`text-xs mb-4 line-clamp-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{recipe.description}</p>

                  {/* Meta Info */}
                  <div
                    className={`flex flex-wrap gap-2 text-xs border-t pt-3 ${isDarkMode ? 'text-gray-300 border-gray-700' : 'text-gray-500 border-gray-100'
                      }`}
                  >
                    {recipe.prepTime && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-[#3AB1A0]" />
                        <span>{recipe.prepTime}</span>
                      </div>
                    )}
                    {(recipe.servings || recipe.servingSize) && (
                      <div className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-[#3AB1A0]" />
                        <span>{recipe.servingSize || `${recipe.servings} serving${Number(recipe.servings) > 1 ? 's' : ''}`}</span>
                      </div>
                    )}
                    {recipe.calories && (
                      <div className="flex items-center gap-1">
                        <Flame className="w-3.5 h-3.5 text-[#E06A26]" />
                        <span>{recipe.calories} kcal</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {recipes.length === 0 && !loading && (
            <div className="py-20 text-center">
              <Flame className={`w-12 h-12 mx-auto mb-4 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
              <p className={`${isDarkMode ? 'text-gray-300' : 'text-gray-500'} font-medium`}>No recipes found</p>
            </div>
          )}

          {/* Bottom Pagination */}
          {renderPagination('mt-8')}

          {/* Showing Results Info */}
          {recipes.length > 0 && (
            <div className={`mt-6 text-center text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Showing {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min((page - 1) * ITEMS_PER_PAGE + recipes.length, effectiveTotalRecipes)} of {effectiveTotalRecipes} recipes
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
