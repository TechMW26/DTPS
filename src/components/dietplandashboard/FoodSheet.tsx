"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
  recipeUuid?: string; // UUID of the recipe
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

  // Debug: Log dietary restrictions when component opens
  console.log('[FoodDatabasePanel] Filtering with:', {
    dietaryRestrictions: clientDietaryArr,
    medicalConditions: clientMedicalArr,
    allergies: clientAllergyArr
  });

  const [allRecipes, setAllRecipes] = useState<FoodItem[]>([]); // Store all recipes
  const [foodData, setFoodData] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);

  // Debounce search query for optimization
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Optimized search function that ranks results by relevance
  const searchAndRankRecipes = useCallback((recipes: FoodItem[], query: string): FoodItem[] => {
    if (!query.trim()) return recipes;

    const searchLower = query.toLowerCase().trim();
    const searchWords = searchLower.split(/\s+/).filter(Boolean);

    // Score each recipe based on match quality
    const scoredRecipes = recipes.map(recipe => {
      const nameLower = recipe.menu.toLowerCase();
      let score = 0;

      // Exact match - highest priority
      if (nameLower === searchLower) {
        score = 1000;
      }
      // Name starts with search term - very high priority
      else if (nameLower.startsWith(searchLower)) {
        score = 500;
      }
      // Name contains search term as a whole word - high priority
      else if (nameLower.includes(searchLower)) {
        // Bonus if it's at a word boundary
        const wordBoundaryMatch = new RegExp(`\\b${searchLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(nameLower);
        score = wordBoundaryMatch ? 300 : 200;
      }
      // All search words match somewhere in name - medium priority
      else if (searchWords.every(word => nameLower.includes(word))) {
        score = 100;
      }
      // Some search words match - lower priority  
      else {
        const matchCount = searchWords.filter(word => nameLower.includes(word)).length;
        if (matchCount > 0) {
          score = matchCount * 30;
        }
      }

      return { recipe, score };
    });

    // Filter out non-matches and sort by score (highest first)
    return scoredRecipes
      .filter(item => item.score > 0)
      .sort((a, b) => {
        // Sort by score first
        if (b.score !== a.score) return b.score - a.score;
        // Then alphabetically for same score
        return a.recipe.menu.localeCompare(b.recipe.menu);
      })
      .map(item => item.recipe);
  }, []);

  // Fetch recipes from the database (with server-side filtering for dietary restrictions)
  useEffect(() => {
    const fetchRecipes = async () => {
      if (!isOpen) return;

      try {
        setLoading(true);
        const params = new URLSearchParams();
        params.append('limit', '0'); // Fetch ALL recipes (0 = no limit)
        if (categoryFilter && categoryFilter !== 'all') {
          params.append('category', categoryFilter);
        }

        // Pass dietary restrictions to API for server-side filtering
        if (clientDietaryArr.length > 0) {
          params.append('excludeDietaryRestrictions', clientDietaryArr.join(','));
        }

        // Pass allergens to API for server-side filtering
        if (clientAllergyArr.length > 0) {
          params.append('excludeAllergens', clientAllergyArr.join(','));
        }

        const response = await fetch(`/api/recipes?${params.toString()}`);
        if (response.ok) {
          const data = await response.json();
          const recipes = data.recipes || [];

          // Helper to ensure value is an array
          const toArray = (val: any): any[] => {
            if (Array.isArray(val)) return val;
            if (typeof val === 'string' && val.trim()) return [val];
            return [];
          };
          // Additional client-side filtering for edge cases not handled by API
          const filteredRecipes = recipes.filter((recipe: any) => {
            const recipeAllergens: string[] = toArray(recipe.allergens).map((a: string) => String(a).toLowerCase().trim());
            const recipeDietary: string[] = toArray(recipe.dietaryRestrictions).map((d: string) => String(d).toLowerCase().trim());
            const recipeMedical: string[] = toArray(recipe.medicalContraindications).map((m: string) => String(m).toLowerCase().trim());
            const recipeIngredients: string[] = toArray(recipe.ingredients).map((ing: any) => (ing?.name || String(ing) || '').toLowerCase().trim());

            // ===== ALLERGEN CHECKS =====
            // Exclude if recipe contains any allergen the client is allergic to
            const hasClientAllergen = clientAllergyArr.some(allergy =>
              recipeAllergens.some((ra: string) => ra.includes(allergy) || allergy.includes(ra)) ||
              recipe.name?.toLowerCase().includes(allergy) ||
              recipeIngredients.some((ing: string) => ing.includes(allergy))
            );
            if (hasClientAllergen) {
              return false;
            }

            // ===== DIETARY RESTRICTIONS FILTER =====
            // Filter recipes based on selected dietary restrictions
            // Recipes should be COMPATIBLE with the selected restrictions
            if (clientDietaryArr.length > 0) {
              // VEGETARIAN restriction: hide recipes with eggs, chicken, meat, fish
              if (clientDietaryArr.includes('vegetarian')) {
                // Exclude non-vegetarian tagged recipes
                if (recipeDietary.includes('non-vegetarian') || recipeDietary.includes('nonvegetarian')) {
                  return false;
                }
                // Exclude recipes with egg allergen
                if (recipeAllergens.includes('egg') || recipeAllergens.includes('eggs')) {
                  return false;
                }
                // Exclude recipes with egg/chicken/meat/fish in name or ingredients
                const nonVegKeywords = ['egg', 'chicken', 'mutton', 'fish', 'meat', 'prawn', 'shrimp', 'crab', 'lobster', 'lamb', 'pork', 'beef', 'bacon', 'ham', 'sausage', 'keema', 'biryani chicken', 'tandoori chicken'];
                const recipeName = (recipe.name || '').toLowerCase();
                if (nonVegKeywords.some(keyword => recipeName.includes(keyword))) {
                  return false;
                }
                if (recipeIngredients.some((ing: string) => nonVegKeywords.some(keyword => ing.includes(keyword)))) {
                  return false;
                }
              }

              // NON-VEGETARIAN restriction: no filtering needed (they can eat everything)

              // VEGAN restriction: exclude non-vegan recipes (those with dairy, eggs, meat, fish, honey)
              if (clientDietaryArr.includes('vegan')) {
                // Exclude non-vegetarian tagged recipes
                if (recipeDietary.includes('non-vegetarian') || recipeDietary.includes('nonvegetarian')) {
                  return false;
                }
                // Exclude recipes with non-vegan allergens
                const nonVeganAllergens = ['dairy', 'egg', 'eggs', 'milk', 'cheese', 'meat', 'fish', 'seafood', 'honey'];
                if (nonVeganAllergens.some(allergen => recipeAllergens.some((ra: string) => ra.includes(allergen)))) {
                  return false;
                }
                // Exclude recipes with non-vegan keywords in name or ingredients
                const nonVeganKeywords = ['egg', 'chicken', 'mutton', 'fish', 'meat', 'prawn', 'shrimp', 'crab', 'lobster', 'lamb', 'pork', 'beef', 'bacon', 'ham', 'sausage', 'milk', 'cheese', 'paneer', 'curd', 'yogurt', 'butter', 'ghee', 'cream', 'honey', 'raita'];
                const recipeName = (recipe.name || '').toLowerCase();
                if (nonVeganKeywords.some(keyword => recipeName.includes(keyword))) {
                  return false;
                }
                if (recipeIngredients.some((ing: string) => nonVeganKeywords.some(keyword => ing.includes(keyword)))) {
                  return false;
                }
              }
            }

            // ===== EXCLUSION-BASED DIETARY RESTRICTIONS =====

            // If client is Gluten-Free, exclude recipes with gluten
            if (clientDietaryArr.includes('gluten-free') || clientDietaryArr.includes('gluten free')) {
              const hasGluten = recipeAllergens.includes('gluten') ||
                recipeAllergens.includes('wheat') ||
                recipeDietary.some((d: string) => d.includes('gluten') && !d.includes('gluten-free') && !d.includes('gluten free'));
              if (hasGluten) {
                return false;
              }
            }

            // If client is Dairy-Free, exclude recipes with dairy
            if (clientDietaryArr.includes('dairy-free') || clientDietaryArr.includes('dairy free')) {
              const hasDairy = recipeAllergens.includes('dairy') ||
                recipeAllergens.includes('milk') ||
                recipeAllergens.includes('lactose');
              if (hasDairy) {
                return false;
              }
            }

            // If client is Egg-Free, exclude recipes with eggs
            if (clientDietaryArr.includes('egg-free') || clientDietaryArr.includes('egg free')) {
              const hasEgg = recipeAllergens.includes('egg') || recipeAllergens.includes('eggs');
              if (hasEgg) {
                return false;
              }
            }

            // If client is Nut-Free, exclude recipes with nuts
            if (clientDietaryArr.includes('nut-free') || clientDietaryArr.includes('nut free')) {
              const nutAllergens = ['nut', 'nuts', 'peanut', 'peanuts', 'almond', 'almonds', 'cashew', 'cashews', 'walnut', 'walnuts', 'pistachio', 'hazelnut'];
              const hasNuts = nutAllergens.some(nut =>
                recipeAllergens.some((ra: string) => ra.includes(nut)) ||
                recipeIngredients.some((ing: string) => ing.includes(nut))
              );
              if (hasNuts) {
                return false;
              }
            }

            // If client is Soy-Free, exclude recipes with soy
            if (clientDietaryArr.includes('soy-free') || clientDietaryArr.includes('soy free')) {
              const hasSoy = recipeAllergens.includes('soy') || recipeAllergens.includes('soya');
              if (hasSoy) {
                return false;
              }
            }

            // If client has Diabetic Friendly restriction, exclude high-sugar recipes
            if (clientDietaryArr.includes('diabetic friendly') || clientDietaryArr.includes('diabetic-friendly')) {
              // Check if recipe has medical contraindication for diabetes
              const contraindicatedForDiabetes = recipeMedical.some((m: string) =>
                m.includes('diabetes') || m.includes('diabetic') || m.includes('high sugar')
              );
              if (contraindicatedForDiabetes) {
                return false;
              }
            }

            // If client has Low-Carb restriction
            if (clientDietaryArr.includes('low-carb') || clientDietaryArr.includes('low carb')) {
              // Could check carbs value if available, for now rely on tags
            }

            // If client has Paleo restriction, exclude non-paleo foods
            if (clientDietaryArr.includes('paleo')) {
              const nonPaleoAllergens = ['dairy', 'grain', 'grains', 'legume', 'legumes', 'refined sugar'];
              const hasNonPaleo = nonPaleoAllergens.some(item =>
                recipeAllergens.some((ra: string) => ra.includes(item))
              );
              if (hasNonPaleo) {
                return false;
              }
            }

            // If client has Keto restriction
            if (clientDietaryArr.includes('keto')) {
              // For Keto, we could check carb content but for now rely on tags
            }

            // If client has Lactose Intolerance (from medical), exclude dairy recipes
            if (clientMedicalArr.includes('lactose intolerance') && recipeAllergens.includes('dairy')) {
              return false;
            }

            // If client has Celiac Disease (from medical), exclude gluten recipes
            if (clientMedicalArr.includes('celiac disease') && recipeAllergens.includes('gluten')) {
              return false;
            }

            // ===== MEDICAL CONTRAINDICATIONS CHECK =====
            // Exclude recipes that have medical contraindications matching client's conditions
            const hasMedicalConflict = clientMedicalArr.some(clientCondition =>
              recipeMedical.some((recipeContra: string) => {
                // Case-insensitive partial matching
                const match = recipeContra.includes(clientCondition) || clientCondition.includes(recipeContra);
                return match;
              })
            );

            if (hasMedicalConflict) {
              return false;
            }

            // All checks passed - recipe is suitable for client
            return true;
          });

          // Transform filtered recipes to FoodItem format
          const transformedData: FoodItem[] = filteredRecipes.map((recipe: any) => {
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
              selected: false,
              recipeUuid: recipe.uuid || undefined,
            };
          });

          // Debug: Log filtering results
          console.log(`[FoodDatabasePanel] Fetched ${recipes.length} recipes, after filtering: ${transformedData.length}`);

          // Store all recipes for local filtering
          setAllRecipes(transformedData);
          setFoodData(transformedData);
        }
      } catch (error) {
        console.error('Error fetching recipes:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecipes();
  }, [isOpen, categoryFilter, clientDietaryArr.join(','), clientMedicalArr.join(','), clientAllergyArr.join(','), refreshKey]);

  // Apply local search filtering with ranking when search query changes
  useEffect(() => {
    if (!allRecipes.length) return;

    if (debouncedSearchQuery.trim()) {
      const rankedResults = searchAndRankRecipes(allRecipes, debouncedSearchQuery);
      setFoodData(rankedResults);
      setCurrentPage(1); // Reset to first page on search
    } else {
      setFoodData(allRecipes);
    }
  }, [debouncedSearchQuery, allRecipes, searchAndRankRecipes]);

  const handleRefresh = () => {
    setCurrentPage(1);
    setSearchQuery("");
    setRefreshKey(prev => prev + 1);
  };

  const itemsPerPage = 12;

  const totalPages = Math.ceil(foodData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = foodData.slice(startIndex, startIndex + itemsPerPage);

  const toggleSelection = (id: string) => {
    // Update both foodData and allRecipes to maintain selection state
    setFoodData((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item
      )
    );
    setAllRecipes((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const updateFoodItem = (id: string, field: keyof FoodItem, value: any) => {
    setFoodData((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const handleAddSelected = () => {
    // Get selected items from allRecipes to include all selections
    const selectedItems = allRecipes.filter((item) => item.selected);
    if (selectedItems.length > 0) {
      onSelectFood(selectedItems);
      // Clear selections from both arrays
      setFoodData(prev => prev.map(item => ({ ...item, selected: false })));
      setAllRecipes(prev => prev.map(item => ({ ...item, selected: false })));
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
                onChange={(e) => setSearchQuery(e.target.value)}
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
              disabled={!foodData.some((item) => item.selected)}
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
                  {paginatedData.map((item) => (
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
            Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, foodData.length)} of {foodData.length} recipes
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              if (totalPages <= 7) {
                return i + 1;
              } else if (i === 3) {
                return "...";
              } else if (i < 3) {
                return i + 1;
              } else {
                return totalPages - (6 - i);
              }
            }).map((page, i) => (
              <Button
                key={i}
                variant={currentPage === page ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  typeof page === "number" && setCurrentPage(page)
                }
                disabled={page === "..."}
                style={currentPage === page ? { backgroundColor: '#00A63E', color: 'white', borderColor: '#00A63E' } : {}}
                className={`w-9 h-9 p-0 ${currentPage === page
                  ? "hover:opacity-90"
                  : "border-gray-300"
                  }`}
              >
                {page}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setCurrentPage((prev) =>
                  Math.min(prev + 1, totalPages)
                )
              }
              disabled={currentPage === totalPages}
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