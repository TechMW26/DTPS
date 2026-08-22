'use client';

import { useState, useEffect, Suspense, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import RecipesListMobile from './page-mobile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDebounce } from '@/hooks/useDebounce';
import {
  Search,
  Plus,
  ChefHat,
  Clock,
  Filter,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Sparkles,
  Loader2,
  X
} from 'lucide-react';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface Recipe {
  _id: string;
  uuid?: string;
  name: string;
  description: string;
  flatNutrition?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
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
  tags: string[];
  ingredients: Array<{
    name: string;
    quantity: number;
    unit: string;
    remarks?: string;
  }>;
  instructions: string[];
  image?: string;
  images?: string[];
  createdBy: {
    firstName: string;
    lastName: string;
  };
  createdAt: string;
}

function RecipesPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecipes, setTotalRecipes] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedCuisine, setSelectedCuisine] = useState('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState('all');
  const [selectedDietaryRestrictions, setSelectedDietaryRestrictions] = useState<string[]>([]);
  const [maxCalories, setMaxCalories] = useState('');
  const [minProtein, setMinProtein] = useState('');
  const [maxPrepTime, setMaxPrepTime] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [showSuccess, setShowSuccess] = useState(false);

  // Debounce search term to prevent excessive API calls
  const debouncedSearchTerm = useDebounce(searchTerm, 400);

  // Track if this is the initial load or a search
  const isInitialLoad = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const RECIPES_PER_PAGE = 50;

  // Show searching indicator when user is typing
  useEffect(() => {
    if (searchTerm !== debouncedSearchTerm) {
      setIsSearching(true);
    } else {
      setIsSearching(false);
    }
  }, [searchTerm, debouncedSearchTerm]);

  useEffect(() => {
    // Reset to first page when filters change
    setCurrentPage(1);
    fetchRecipes(1);
  }, [debouncedSearchTerm, selectedCategory, selectedCuisine, selectedDifficulty, selectedDietaryRestrictions, maxCalories, minProtein, maxPrepTime, sortBy]);

  useEffect(() => {
    // Check for success message
    if (searchParams?.get('success') === 'created') {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

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
      if (debouncedSearchTerm) {
        params.append('search', debouncedSearchTerm);
        // When searching, use relevance-based sorting instead of alphabetical
        params.append('sortBy', 'relevance');
      } else if (sortBy) {
        params.append('sortBy', sortBy);
      }
      if (selectedCategory && selectedCategory !== 'all') params.append('category', selectedCategory);
      if (selectedCuisine && selectedCuisine !== 'all') params.append('cuisine', selectedCuisine);
      if (selectedDifficulty && selectedDifficulty !== 'all') params.append('difficulty', selectedDifficulty);
      if (selectedDietaryRestrictions.length > 0) params.append('dietaryRestrictions', selectedDietaryRestrictions.join(','));
      if (maxCalories) params.append('maxCalories', maxCalories);
      if (minProtein) params.append('minProtein', minProtein);
      if (maxPrepTime) params.append('maxPrepTime', maxPrepTime);
      params.append('limit', String(RECIPES_PER_PAGE));
      params.append('page', String(pageNum));
      params.append('includeTotal', 'true');
      params.append('includeInactive', 'true');

      const response = await fetch(`/api/recipes?${params.toString()}`, {
        signal: abortControllerRef.current.signal
      });

      if (response.ok) {
        const data = await response.json();
        const fetchedRecipes: Recipe[] = data.recipes || [];
        const total = data.pagination?.total || 0;

        // Remove duplicates based on _id
        const seenIds = new Set<string>();
        const uniqueRecipes = fetchedRecipes.filter(recipe => {
          if (seenIds.has(recipe._id)) {
            return false;
          }
          seenIds.add(recipe._id);
          return true;
        }).map((recipe) => ({
          ...recipe,
          image: recipe.image || (Array.isArray(recipe.images) ? recipe.images[0] : '') || ''
        }));

        setRecipes(uniqueRecipes);
        setCategories(data.categories || data.tags || []);
        setTotalRecipes(total);
        const pagesFromApi = Number(data.pagination?.pages || 0);
        setTotalPages(Math.max(1, pagesFromApi || Math.ceil(total / RECIPES_PER_PAGE)));
        isInitialLoad.current = false;
      } else {
        console.error('Failed to fetch recipes:', response.status, response.statusText);
        setRecipes([]);
        setCategories([]);
        setTotalRecipes(0);
        setTotalPages(1);
      }
    } catch (error: any) {
      // Ignore abort errors - they're expected when cancelling requests
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Error fetching recipes:', error);
      setRecipes([]);
      setCategories([]);
      setTotalRecipes(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchTerm, selectedCategory, selectedCuisine, selectedDifficulty, selectedDietaryRestrictions, maxCalories, minProtein, maxPrepTime, sortBy]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const goToPage = (pageNum: number) => {
    if (pageNum >= 1 && pageNum <= totalPages && pageNum !== currentPage) {
      setCurrentPage(pageNum);
      fetchRecipes(pageNum);
      // Scroll to top of the page
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Generate page numbers to display
  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage <= 3) {
        // Near start
        for (let i = 2; i <= Math.min(4, totalPages - 1); i++) {
          pages.push(i);
        }
        if (totalPages > 5) pages.push('...');
      } else if (currentPage >= totalPages - 2) {
        // Near end
        if (totalPages > 5) pages.push('...');
        for (let i = Math.max(totalPages - 3, 2); i <= totalPages - 1; i++) {
          pages.push(i);
        }
      } else {
        // In middle
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
      }

      // Always show last page
      if (!pages.includes(totalPages)) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Recipe Database</h1>
            <p className="text-gray-600 mt-1">
              Manage your collection of healthy recipes
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild>
              <Link href="/recipes/create">
                <Plus className="h-4 w-4 mr-2" />
                Add Recipe
              </Link>
            </Button>
          </div>
        </div>

        {/* Success Message */}
        {showSuccess && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Recipe created successfully! 🎉
            </AlertDescription>
          </Alert>
        )}

        {/* Search and Filters */}
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search recipes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-10"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 animate-spin" />
                )}
                {searchTerm && !isSearching && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="All tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tags</SelectItem>
                  {categories && categories.filter((category): category is string => Boolean(category) && category.trim() !== '').map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="number"
                placeholder="Max calories"
                value={maxCalories}
                onChange={(e) => setMaxCalories(e.target.value)}
              />

              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <ChefHat className="h-4 w-4" />
                <span>
                  {totalRecipes > 0
                    ? `Showing ${((currentPage - 1) * RECIPES_PER_PAGE) + 1}-${Math.min(currentPage * RECIPES_PER_PAGE, totalRecipes)} of ${totalRecipes} recipes`
                    : '0 recipes'
                  }
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Pagination Controls */}
        {!loading && totalPages > 1 && (
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="flex items-center gap-2">
              {/* First Page */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(1)}
                disabled={currentPage === 1}
                className="hidden sm:flex"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>

              {/* Previous Page */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Previous</span>
              </Button>

              {/* Page Numbers */}
              <div className="flex items-center gap-1">
                {getPageNumbers().map((pageNum, index) => (
                  pageNum === '...' ? (
                    <span key={`top-ellipsis-${index}`} className="px-2 text-gray-400">...</span>
                  ) : (
                    <Button
                      key={`top-page-${pageNum}`}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => goToPage(pageNum as number)}
                      className="min-w-10"
                    >
                      {pageNum}
                    </Button>
                  )
                ))}
              </div>

              {/* Next Page */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <span className="hidden sm:inline mr-1">Next</span>
                <ChevronRight className="h-4 w-4" />
              </Button>

              {/* Last Page */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(totalPages)}
                disabled={currentPage === totalPages}
                className="hidden sm:flex"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Recipes Grid */}
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <LoadingSpinner />
          </div>
        ) : recipes.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm || (selectedCategory && selectedCategory !== 'all') || maxCalories ? 'No recipes found' : 'No recipes yet'}
              </h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || (selectedCategory && selectedCategory !== 'all') || maxCalories
                  ? 'Try adjusting your search criteria'
                  : 'Start building your recipe database by adding your first recipe'
                }
              </p>
              {!searchTerm && (!selectedCategory || selectedCategory === 'all') && !maxCalories && (
                <Button asChild>
                  <Link href="/recipes/create">Add Your First Recipe</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4  ">
            {recipes && recipes.map((recipe) => (
              <Card key={recipe._id} className="hover:shadow-md transition-shadow border border-gray-200 flex flex-col h-full  ">
                {/* Recipe Image - Smaller front area, full image visible without stretching */}
                <div className="relative w-full aspect-video bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                  {recipe.image && !brokenImages[recipe._id] ? (
                    <img
                      src={recipe.image}
                      alt={recipe.name}
                      loading="lazy"
                      className="w-full h-full object-contain p-2"
                      onError={() => {
                        setBrokenImages((prev) => ({ ...prev, [recipe._id]: true }));
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-linear-to-br from-green-50 to-emerald-100">
                      <ChefHat className="h-14 w-14 text-green-300" />
                    </div>
                  )}
                </div>

                <CardHeader className="pb-1">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-1 mb-1">
                        <CardTitle className="text-base line-clamp-2 font-semibold text-gray-900">{recipe.name}</CardTitle>
                      </div>
                      {recipe.uuid && (
                        <Badge variant="secondary" className="mb-1 text-xs font-mono">
                          ID: {recipe.uuid}
                        </Badge>
                      )}

                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-2 grow flex flex-col">
                  {/* Nutrition Info */}
                  <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <p className="text-sm font-bold text-gray-900">{recipe.calories || recipe.flatNutrition?.calories || 0}</p>
                      <p className="text-xs text-gray-500">Calories</p>
                    </div>
                    <div className="text-center border-x border-gray-200">
                      <p className="text-sm font-bold text-gray-900">{recipe.protein || recipe.flatNutrition?.protein || 0}g</p>
                      <p className="text-xs text-gray-500">Protein</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-gray-900 truncate" title={recipe.servingSize || `${recipe.servings || 1}`}>{recipe.servingSize || recipe.servings || 1}</p>
                      <p className="text-xs text-gray-500">Serving Size</p>
                    </div>
                  </div>

                  {/* Time and Macros */}
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <div className="flex items-center">
                      <Clock className="h-4 w-4 mr-1 text-gray-400" />
                      <span>{(recipe.prepTime || 0) + (recipe.cookTime || 0)} min</span>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">C: {recipe.carbs || recipe.flatNutrition?.carbs || 0}g</span>
                      <span className="px-2 py-1 bg-orange-50 text-orange-700 rounded">F: {recipe.fat || recipe.flatNutrition?.fat || 0}g</span>
                    </div>
                  </div>

                  {/* Tags */}
                  {recipe.tags && recipe.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {recipe.tags.slice(0, 3).map((tag, index) => (
                        <Badge
                          key={index}
                          variant="outline"
                          className="text-xs"
                        >
                          {tag}
                        </Badge>
                      ))}
                      {recipe.tags.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{recipe.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Action Button */}
                  <Button
                    className="w-full mt-auto"
                    asChild
                  >
                    <Link href={`/recipes/${recipe._id}`}>
                      View Recipe
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {!loading && totalPages > 1 && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex items-center gap-2">
              {/* First Page */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(1)}
                disabled={currentPage === 1}
                className="hidden sm:flex"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>

              {/* Previous Page */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Previous</span>
              </Button>

              {/* Page Numbers */}
              <div className="flex items-center gap-1">
                {getPageNumbers().map((pageNum, index) => (
                  pageNum === '...' ? (
                    <span key={`ellipsis-${index}`} className="px-2 text-gray-400">...</span>
                  ) : (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => goToPage(pageNum as number)}
                      className="min-w-10"
                    >
                      {pageNum}
                    </Button>
                  )
                ))}
              </div>

              {/* Next Page */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <span className="hidden sm:inline mr-1">Next</span>
                <ChevronRight className="h-4 w-4" />
              </Button>

              {/* Last Page */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(totalPages)}
                disabled={currentPage === totalPages}
                className="hidden sm:flex"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-sm text-gray-500">
              Page {currentPage} of {totalPages} ({totalRecipes} total recipes)
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function RecipesPage() {
  const [isMobile, setIsMobile] = useState(false);
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    // Check if running as PWA
    const checkPWA = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isIOSPWA = (window.navigator as any).standalone === true;
      setIsPWA(isStandalone || isIOSPWA);
    };

    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkPWA();
    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Always show mobile UI in PWA or on mobile devices
  if (isPWA || isMobile) {
    return <RecipesListMobile />;
  }

  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><LoadingSpinner /></div>}>
      <RecipesPageContent />
    </Suspense>
  );
}
