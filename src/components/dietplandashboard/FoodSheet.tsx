"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  RefreshCw,
} from "lucide-react";
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Debounce hook for search optimization
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Throttle hook to limit how frequently request-driving state changes are emitted.
function useThrottle<T>(value: T, delay: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastExecutedRef = useRef(0);
  const trailingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastExecutedRef.current;

    if (elapsed >= delay) {
      lastExecutedRef.current = now;
      setThrottledValue(value);
      return;
    }

    if (trailingTimerRef.current) {
      clearTimeout(trailingTimerRef.current);
    }

    trailingTimerRef.current = setTimeout(() => {
      lastExecutedRef.current = Date.now();
      setThrottledValue(value);
      trailingTimerRef.current = null;
    }, delay - elapsed);

    return () => {
      if (trailingTimerRef.current) {
        clearTimeout(trailingTimerRef.current);
        trailingTimerRef.current = null;
      }
    };
  }, [value, delay]);

  return throttledValue;
}

type FoodItem = {
  id: string;
  date: string;
  time: string;
  menu: string;
  amount: string;
  cals: number;
  carbs: number;
  protein: number;
  fats: number;
  selected: boolean;
  recipeId?: string;   // Mongo _id
  recipeUuid?: string; // Legacy UUID
};

type FoodDatabasePanelProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelectFood: (foods: FoodItem[]) => void;
  clientDietaryRestrictions?: string; // comma-separated e.g. "Vegetarian, Gluten-Free"
  clientMedicalConditions?: string;   // comma-separated e.g. "Diabetes, hypertension"
  clientAllergies?: string;           // comma-separated e.g. "nuts, dairy"
};

export function FoodDatabasePanel({
  isOpen,
  onClose,
  onSelectFood,
  clientDietaryRestrictions = '',
  clientMedicalConditions = '',
  clientAllergies = '',
}: FoodDatabasePanelProps) {
  // Parse client restrictions into arrays for filtering
  const clientDietaryArr = clientDietaryRestrictions.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const clientMedicalArr = clientMedicalConditions.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const clientAllergyArr = clientAllergies.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const [foodData, setFoodData] = useState<FoodItem[]>([]);
  const [selectedFoods, setSelectedFoods] = useState<Record<string, FoodItem>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalRecipes, setTotalRecipes] = useState<number | null>(null);
  const itemsPerPage = 12;
  const selectedFoodsRef = useRef<Record<string, FoodItem>>({});
  const requestCacheRef = useRef<Record<string, { items: FoodItem[]; hasNext: boolean; total: number | null }>>({});
  const activeRequestRef = useRef<AbortController | null>(null);
  const latestRequestIdRef = useRef(0);

  // Debounce search query for optimization
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const throttledSearchQuery = useThrottle(debouncedSearchQuery, 250);

  useEffect(() => {
    selectedFoodsRef.current = selectedFoods;
  }, [selectedFoods]);

  // Fetch only the visible page from the database using server-side search/filtering.
  useEffect(() => {
    const fetchRecipes = async () => {
      if (!isOpen) return;

      try {
        setLoading(true);
        const effectiveSearch = throttledSearchQuery.trim();
        const canUseSearch = effectiveSearch.length >= 1;
        const shouldIncludeTotal = currentPage === 1 || totalRecipes === null;
        const params = new URLSearchParams();
        params.append('view', 'food-database');
        params.append('limit', String(itemsPerPage));
        params.append('page', String(currentPage));
        params.append('includeTotal', shouldIncludeTotal ? 'true' : 'false');
        params.append('sortBy', canUseSearch ? 'relevance' : 'name');
        if (categoryFilter && categoryFilter !== 'all') {
          params.append('category', categoryFilter);
        }
        if (canUseSearch) {
          params.append('search', effectiveSearch);
          params.append('searchMode', 'typing');
        }

        // Pass dietary restrictions to API for server-side filtering
        if (clientDietaryArr.length > 0) {
          params.append('excludeDietaryRestrictions', clientDietaryArr.join(','));
        }

        // Pass allergens to API for server-side filtering
        if (clientAllergyArr.length > 0) {
          params.append('excludeAllergens', clientAllergyArr.join(','));
        }

        if (clientMedicalArr.length > 0) {
          params.append('excludeMedicalConditions', clientMedicalArr.join(','));
        }

        const requestKey = `${refreshKey}:${params.toString()}`;
        const cachedResult = requestCacheRef.current[requestKey];
        if (cachedResult) {
          setFoodData(cachedResult.items);
          setHasNextPage(cachedResult.hasNext);
          setTotalRecipes((prev) => cachedResult.total ?? prev);
          setLoading(false);
          return;
        }

        if (activeRequestRef.current) {
          activeRequestRef.current.abort();
        }
        const controller = new AbortController();
        activeRequestRef.current = controller;
        const requestId = latestRequestIdRef.current + 1;
        latestRequestIdRef.current = requestId;

        const response = await fetch(`/api/recipes?${params.toString()}`, {
          signal: controller.signal,
        });
        if (response.ok) {
          const data = await response.json();
          // Ignore stale responses when a newer request is already in flight/completed.
          if (requestId !== latestRequestIdRef.current) {
            return;
          }
          const recipes = data.recipes || [];
          const transformedData: FoodItem[] = recipes.map((recipe: any) => {
            // Format serving size - use servingSize if available, otherwise show servings count
            const servingSizeDisplay = recipe.servingSize || recipe.portionSize;
            const servingsCount = recipe.servings || 1;
            const amount = servingSizeDisplay
              ? servingSizeDisplay
              : `${servingsCount} serving${servingsCount > 1 ? 's' : ''}`;

            // Get nutrition values - API returns flat values at recipe level
            // Also check nutrition object for backwards compatibility
            const cals = parseFloat(Number(recipe.calories || recipe.nutrition?.calories || recipe.flatNutrition?.calories || 0).toFixed(2));
            const carbsVal = parseFloat(Number(recipe.carbs || recipe.nutrition?.carbs || recipe.flatNutrition?.carbs || 0).toFixed(2));
            const proteinVal = parseFloat(Number(recipe.protein || recipe.nutrition?.protein || recipe.flatNutrition?.protein || 0).toFixed(2));
            const fatsVal = parseFloat(Number(recipe.fat || recipe.nutrition?.fat || recipe.flatNutrition?.fat || 0).toFixed(2));

            return {
              id: recipe._id,
              date: new Date().toISOString().split('T')[0],
              time: '12:00 PM',
              menu: recipe.name,
              amount,
              cals,
              carbs: carbsVal,
              protein: proteinVal,
              fats: fatsVal,
              selected: !!selectedFoodsRef.current[String(recipe._id)],
              recipeId: recipe._id || undefined,
              recipeUuid: recipe.uuid || undefined,
            };
          });
          setFoodData(transformedData);
          setHasNextPage(Boolean(data.pagination?.hasNext));
          const nextTotal = typeof data.pagination?.total === 'number' ? data.pagination.total : null;
          setTotalRecipes((prev) => nextTotal ?? prev);
          // Avoid pinning transient empty-search misses in cache.
          if (transformedData.length > 0 || !canUseSearch) {
            requestCacheRef.current[requestKey] = {
              items: transformedData,
              hasNext: Boolean(data.pagination?.hasNext),
              total: nextTotal,
            };
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
        console.error('Error fetching recipes:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecipes();
  }, [
    isOpen,
    categoryFilter,
    clientDietaryArr.join(','),
    clientMedicalArr.join(','),
    clientAllergyArr.join(','),
    refreshKey,
    currentPage,
    throttledSearchQuery,
    itemsPerPage,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter]);

  const handleRefresh = () => {
    requestCacheRef.current = {};
    if (activeRequestRef.current) {
      activeRequestRef.current.abort();
      activeRequestRef.current = null;
    }
    setCurrentPage(1);
    setSearchQuery("");
    setSelectedFoods({});
    setTotalRecipes(null);
    setRefreshKey(prev => prev + 1);
  };

  const toggleSelection = (id: string) => {
    setFoodData((prev) => {
      const target = prev.find((item) => item.id === id);
      if (!target) return prev;

      const nextSelected = !target.selected;
      setSelectedFoods((current) => {
        const next = { ...current };
        if (nextSelected) {
          next[id] = { ...target, selected: true };
        } else {
          delete next[id];
        }
        return next;
      });

      return prev.map((item) =>
        item.id === id ? { ...item, selected: nextSelected } : item
      );
    });
  };

  const updateFoodItem = (id: string, field: keyof FoodItem, value: any) => {
    setFoodData((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const handleAddSelected = () => {
    const selectedItems = Object.values(selectedFoods);
    if (selectedItems.length > 0) {
      onSelectFood(selectedItems);
      setFoodData(prev => prev.map(item => ({ ...item, selected: false })));
      setSelectedFoods({});
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>

      {/* Backdrop with blur */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-lg z-70 transition-all duration-300"
        onClick={onClose}
      />


      {/* Slide-in Panel - LEFT SIDE */}
      <div className="fixed left-0 top-0 h-full w-1/2 bg-white shadow-2xl z-120 flex flex-col animate-slide-in">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="hover:bg-gray-200"
            >
              <ChevronLeft className="w-5 h-5 mr-1" />
              Back
            </Button>
            <h2 className="text-xl font-semibold text-slate-900">
              Food Database
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="hover:bg-gray-200"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <Search className="w-4 h-4 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setCurrentPage(1);
                  setSearchQuery(e.target.value);
                }}
                placeholder="Search recipes..."
                className="h-10 bg-gray-50 border-gray-300 flex-1"
              />
            </div>
            <Select
              value={categoryFilter}
              onValueChange={setCategoryFilter}
            >
              <SelectTrigger className="w-40 h-10 border-gray-300">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent style={{ zIndex: 130 }}>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="breakfast">Breakfast</SelectItem>
                <SelectItem value="lunch">Lunch</SelectItem>
                <SelectItem value="dinner">Dinner</SelectItem>
                <SelectItem value="snack">Snack</SelectItem>
                <SelectItem value="dessert">Dessert</SelectItem>
                <SelectItem value="beverage">Beverage</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="border-gray-300 bg-white hover:bg-slate-50"
              asChild
            >
              <Link href="/recipes/create" target="_blank" rel="noopener noreferrer">
                <Plus className="w-4 h-4 mr-2" />
                Create Recipe
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-gray-300 bg-white hover:bg-slate-50"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleAddSelected}
              style={{ backgroundColor: '#00A63E', color: 'white' }}
              className="hover:opacity-90 font-medium h-10"
              disabled={Object.keys(selectedFoods).length === 0}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-gray-500">Loading recipes from database...</p>
            </div>
          ) : foodData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <p className="text-gray-500">No recipes found</p>
              <Button variant="outline" asChild>
                <Link href="/recipes/create" target="_blank" rel="noopener noreferrer">
                  <Plus className="w-4 h-4 mr-2" />
                  Create New Recipe
                </Link>
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left p-4 text-xs font-semibold text-gray-600 uppercase tracking-wider w-8"></th>
                    <th className="text-left p-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Menu
                    </th>
                    <th className="text-left p-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="text-left p-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Cals
                    </th>
                    <th className="text-left p-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Carbs
                    </th>
                    <th className="text-left p-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Protein
                    </th>
                    <th className="text-left p-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Fats
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {foodData.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => toggleSelection(item.id)}
                      style={item.selected ? { backgroundColor: '#BCEBCB' } : {}}
                      className={`border-b border-gray-100 cursor-pointer transition-colors ${item.selected
                        ? "hover:brightness-95"
                        : "hover:bg-slate-50"
                        }`}
                      onMouseEnter={(e) => {
                        if (item.selected) {
                          e.currentTarget.style.backgroundColor = '#C2E66E';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (item.selected) {
                          e.currentTarget.style.backgroundColor = '#BCEBCB';
                        }
                      }}
                    >
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={item.selected}
                          onCheckedChange={() => toggleSelection(item.id)}
                          className="border-gray-300"
                        />
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-medium text-slate-900">{item.menu}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm text-slate-700">{item.amount}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-medium text-slate-900">{typeof item.cals === 'number' ? parseFloat(item.cals.toFixed(2)) : item.cals} <span className="text-xs text-slate-500">kcal</span></div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm text-slate-700">{typeof item.carbs === 'number' ? parseFloat(item.carbs.toFixed(2)) : item.carbs} <span className="text-xs text-slate-500">gr</span></div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm text-slate-700">{typeof item.protein === 'number' ? parseFloat(item.protein.toFixed(2)) : item.protein} <span className="text-xs text-slate-500">gr</span></div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm text-slate-700">{typeof item.fats === 'number' ? parseFloat(item.fats.toFixed(2)) : item.fats} <span className="text-xs text-slate-500">gr</span></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer with Pagination */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            Showing page {currentPage}{typeof totalRecipes === 'number' ? ` | Total recipes: ${totalRecipes}` : ''}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="w-9 h-9 p-0 border-gray-300"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => prev + 1)}
              disabled={!hasNextPage}
              className="w-9 h-9 p-0 border-gray-300"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <style>{`
       @keyframes slide-in {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

      `}</style>
    </>
  );
}