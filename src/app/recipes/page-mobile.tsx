'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, X } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useDebounce } from '@/hooks/useDebounce';

interface Recipe {
  _id: string;
  name: string;
  image?: string;
  nutrition?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  // Flat nutrition values from API
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  prepTime: number;
  cookTime: number;
  servings: number;
  servingSize?: string;
  description?: string;
}

export default function RecipesListMobile() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecipes, setTotalRecipes] = useState(0);
  const ITEMS_PER_PAGE = 20;

  const debouncedSearchQuery = useDebounce(searchQuery, 350);

  useEffect(() => {
    if (searchQuery !== debouncedSearchQuery) {
      setIsSearching(true);
    } else {
      setIsSearching(false);
    }
  }, [searchQuery, debouncedSearchQuery]);

  useEffect(() => {
    setCurrentPage(1);
    fetchRecipes(1, debouncedSearchQuery);
  }, [debouncedSearchQuery]);

  const fetchRecipes = async (pageNum: number, searchValue: string) => {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      params.append('limit', String(ITEMS_PER_PAGE));
      params.append('page', String(pageNum));
      params.append('includeTotal', 'true');

      if (searchValue.trim()) {
        params.append('search', searchValue.trim());
        params.append('sortBy', 'relevance');
      } else {
        params.append('sortBy', 'name');
      }

      const response = await fetch(`/api/recipes?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setRecipes(data.recipes || []);
        const total = Number(data.pagination?.total || 0);
        const pages = Number(data.pagination?.pages || 1);
        setTotalRecipes(total);
        setTotalPages(Math.max(1, pages));
        setCurrentPage(pageNum);
      }
    } catch (error) {
      console.error('Error fetching recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  const goToPage = (pageNum: number) => {
    if (pageNum < 1 || pageNum > totalPages || pageNum === currentPage) return;
    fetchRecipes(pageNum, debouncedSearchQuery);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center flex-1">
            <button
              onClick={() => router.back()}
              className="h-10 w-10 flex items-center justify-center active:scale-95 transition-transform"
            >
              <ArrowLeft className="h-6 w-6 text-gray-600" />
            </button>

            {showSearch ? (
              <div className="flex-1 flex items-center ml-2 bg-gray-100 rounded-lg px-3">
                <Search className="h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search recipes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 ml-2 py-2 bg-transparent text-gray-900 placeholder-gray-400 focus:outline-none text-sm"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="p-1"
                  >
                    <X className="h-4 w-4 text-gray-400" />
                  </button>
                )}
                {isSearching && (
                  <div className="ml-2 text-xs text-gray-500">Searching...</div>
                )}
              </div>
            ) : (
              <h1 className="text-lg font-medium text-gray-700 ml-3">
                Recipes
              </h1>
            )}
          </div>

          <button
            onClick={() => setShowSearch(!showSearch)}
            className="h-10 w-10 flex items-center justify-center active:scale-95 transition-transform ml-2"
          >
            <Search className="h-5 w-5 text-teal-600" />
          </button>
        </div>
      </div>

      {/* Recipes List */}
      <div className="p-4">
        {recipes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No recipes found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recipes.map((recipe, index) => (
              <button
                key={recipe._id}
                onClick={() => router.push(`/recipes/${recipe._id}`)}
                className="w-full bg-white rounded-2xl overflow-hidden shadow-sm active:scale-[0.98] transition-all duration-200"
              >
                {/* First recipe - Large featured card */}
                {index === 0 ? (
                  <div className="relative">
                    <div className="relative h-56 w-full bg-linear-to-br from-amber-100 to-orange-100">
                      {recipe.image ? (
                        <img
                          src={recipe.image}
                          alt={recipe.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="text-7xl">🍽️</div>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {recipe.name}
                      </h3>
                    </div>
                  </div>
                ) : (
                  /* Other recipes - Horizontal cards */
                  <div className="flex items-center p-3">
                    <div className="flex-1 pr-3">
                      <h3 className="text-base font-medium text-gray-900 text-left">
                        {recipe.name}
                      </h3>
                    </div>
                    <div className="shrink-0">
                      <div className="relative h-20 w-28 bg-linear-to-br from-gray-100 to-gray-200 rounded-xl overflow-hidden">
                        {recipe.image ? (
                          <img
                            src={recipe.image}
                            alt={recipe.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <div className="text-3xl">🍽️</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>

            <div className="text-sm text-gray-600 text-center">
              Page {currentPage} of {totalPages}
              <div className="text-xs text-gray-500">{totalRecipes} total recipes</div>
            </div>

            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Bottom spacing for navigation */}
      <div className="h-20"></div>
    </div>
  );
}

