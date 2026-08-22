'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Clock, Users, Flame, ChefHat, Bookmark, Lightbulb } from 'lucide-react';
import { ClientPageSkeleton } from '@/components/ui/skeleton';
import { useTheme } from '@/contexts/ThemeContext';

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
  ingredients?: Array<{ name: string; quantity: string; unit: string }>;
  instructions?: string[];
  tips?: string[];
  nutrition?: {
    protein?: number;
    carbs?: number;
    fat?: number;
  };
  dietaryRestrictions?: string[];
}

export default function RecipeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [servingMultiplier, setServingMultiplier] = useState(1);

  useEffect(() => {
    const recipeId = String(params?.id || '').trim();
    if (!recipeId) return;

    const controller = new AbortController();
    fetchRecipeDetail(recipeId, controller.signal);

    return () => {
      controller.abort();
    };
  }, [params.id]);

  const fetchRecipeDetail = async (recipeId: string, signal?: AbortSignal) => {
    try {
      setRecipe(null);
      setLoading(true);
      const response = await fetch(`/api/recipes/${recipeId}`, {
        cache: 'no-store',
        signal,
      });
      if (response.ok) {
        const data = await response.json();
        if (data?.recipe && String(data.recipe._id) === recipeId) {
          setRecipe(data.recipe);
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      console.error('Error fetching recipe:', error);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  if (loading) {
    return <ClientPageSkeleton variant="grid" showHeader={false} />;
  }

  if (!recipe) {
    return (
      <div className={`flex items-center justify-center min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
        <div className="text-center">
          <p className={`${isDarkMode ? 'text-gray-300' : 'text-gray-500'} mb-4`}>Recipe not found</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-[#3AB1A0] text-white rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-linear-to-b from-white to-gray-50'}`}>
      {/* Header */}
      <div className={`sticky top-0 z-40 backdrop-blur-sm border-b ${isDarkMode ? 'bg-gray-900/80 border-gray-800' : 'bg-white/95 border-gray-100'}`}>
        <div className="flex items-center justify-between px-4 py-4 max-w-4xl mx-auto w-full">
          <button
            onClick={() => router.back()}
            className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-[#3AB1A0]/10'}`}
          >
            <ArrowLeft className="w-5 h-5 text-[#3AB1A0]" />
          </button>
          <h1 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Recipe Details</h1>
          <button
            onClick={() => setIsSaved(!isSaved)}
            className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors ${isSaved ? 'bg-[#E06A26]/10' : isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
              }`}
          >
            <Bookmark className={`w-5 h-5 ${isSaved ? 'fill-[#E06A26] text-[#E06A26]' : isDarkMode ? 'text-gray-300' : 'text-gray-400'}`} />
          </button>
        </div>
      </div>

      <div className="px-4 py-6 max-w-4xl mx-auto">
        {/* Recipe Hero Image */}
        {recipe.image && (
          <div className="relative w-full h-64 sm:h-80 rounded-2xl overflow-hidden mb-6 shadow-md">
            <img
              src={recipe.image}
              alt={recipe.name}
              loading="lazy"
              className="w-full h-full object-cover"
            />
            {recipe.difficulty && (
              <div className={`absolute top-4 right-4 px-3 py-1 rounded-lg font-semibold text-xs ${isDarkMode ? 'bg-gray-900/80 text-[#E06A26]' : 'bg-white/95 text-[#E06A26]'}`}>
                {recipe.difficulty.toUpperCase()}
              </div>
            )}
          </div>
        )}

        {/* Recipe Title & Description */}
        <div className="mb-6">
          <div className="mb-3">
            <span className="inline-block px-3 py-1 rounded-full bg-[#3AB1A0]/10 text-[#3AB1A0] text-xs font-bold">
              {recipe.category || 'Recipe'}
            </span>
          </div>
          <h2 className={`text-3xl sm:text-4xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{recipe.name}</h2>
          <p className={`${isDarkMode ? 'text-gray-300' : 'text-gray-600'} text-base leading-relaxed`}>{recipe.description}</p>
        </div>

        {/* Meta Info Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {recipe.prepTime && (
            <div className={`rounded-xl p-4 shadow-sm border text-center ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
              <Clock className="w-5 h-5 text-[#3AB1A0] mx-auto mb-2" />
              <p className={`text-xs mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Prep Time</p>
              <p className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{recipe.prepTime}</p>
            </div>
          )}
          {recipe.cookTime && (
            <div className={`rounded-xl p-4 shadow-sm border text-center ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
              <ChefHat className="w-5 h-5 text-[#DB9C6E] mx-auto mb-2" />
              <p className={`text-xs mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Cook Time</p>
              <p className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{recipe.cookTime}</p>
            </div>
          )}
          {(recipe.servings || recipe.servingSize) && (
            <div className={`rounded-xl p-4 shadow-sm border text-center ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
              <Users className="w-5 h-5 text-[#3AB1A0] mx-auto mb-2" />
              <p className={`text-xs mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Serving Size</p>
              <p className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{recipe.servingSize || `${recipe.servings} serving${Number(recipe.servings) > 1 ? 's' : ''}`}</p>
            </div>
          )}
          {recipe.calories && (
            <div className={`rounded-xl p-4 shadow-sm border text-center ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
              <Flame className="w-5 h-5 text-[#E06A26] mx-auto mb-2" />
              <p className={`text-xs mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Calories</p>
              <p className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{recipe.calories}</p>
            </div>
          )}
        </div>

        {/* Serving Multiplier */}
        {recipe.servings && (
          <div className={`mb-8 rounded-2xl p-6 shadow-sm border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
            <p className={`text-sm font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Adjust Servings</p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setServingMultiplier(Math.max(0.5, servingMultiplier - 0.5))}
                className="w-12 h-12 rounded-lg bg-[#3AB1A0]/10 text-[#3AB1A0] font-bold hover:bg-[#3AB1A0] hover:text-white transition-colors text-xl"
              >
                −
              </button>
              <span className="flex-1 text-center">
                <p className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{servingMultiplier}×</p>
                <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>{Math.round(recipe.servings * servingMultiplier)} servings</p>
              </span>
              <button
                onClick={() => setServingMultiplier(servingMultiplier + 0.5)}
                className="w-12 h-12 rounded-lg bg-[#3AB1A0]/10 text-[#3AB1A0] font-bold hover:bg-[#3AB1A0] hover:text-white transition-colors text-xl"
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* Ingredients */}
        {recipe.ingredients && recipe.ingredients.length > 0 && (
          <div className={`rounded-2xl p-6 shadow-sm border mb-8 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
            <h3 className={`text-xl font-bold mb-5 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Ingredients</h3>
            <ul className="space-y-3">
              {recipe.ingredients.map((ingredient, index) => (
                <li
                  key={index}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-linear-to-r from-[#3AB1A0]/5 to-transparent border-[#3AB1A0]/10'}`}
                >
                  <input type="checkbox" className="w-5 h-5 text-[#3AB1A0] rounded cursor-pointer accent-[#3AB1A0]" />
                  <span className="flex-1">
                    <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{ingredient.name}</span>
                    <span className={`${isDarkMode ? 'text-gray-300' : 'text-gray-500'} text-sm ml-1`}>
                      {Math.round(parseFloat(ingredient.quantity) * servingMultiplier * 100) / 100} {ingredient.unit}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Instructions */}
        {recipe.instructions && recipe.instructions.length > 0 && (
          <div className={`rounded-2xl p-6 shadow-sm border mb-8 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
            <h3 className={`text-xl font-bold mb-5 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Instructions</h3>
            <ol className="space-y-4">
              {recipe.instructions.map((instruction, index) => (
                <li key={index} className="flex gap-4">
                  <span className="shrink-0 w-8 h-8 rounded-full bg-[#3AB1A0] text-white flex items-center justify-center font-bold text-sm">
                    {index + 1}
                  </span>
                  <span className={`${isDarkMode ? 'text-gray-200' : 'text-gray-700'} pt-0.5 text-sm leading-relaxed`}>{instruction}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Tips */}
        {recipe.tips && recipe.tips.length > 0 && (
          <div className="bg-[#DB9C6E]/10 rounded-2xl p-6 shadow-sm border border-[#DB9C6E]/20 mb-8">
            <div className="flex items-start gap-3 mb-4">
              <Lightbulb className="w-5 h-5 text-[#DB9C6E] shrink-0 mt-0.5" />
              <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Cooking Tips</h3>
            </div>
            <ul className="space-y-2">
              {recipe.tips.map((tip, index) => (
                <li key={index} className={`${isDarkMode ? 'text-gray-200' : 'text-gray-700'} text-sm`}>
                  • {tip}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Nutrition Info */}
        {recipe.nutrition && (
          <div className={`rounded-2xl p-6 shadow-sm border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
            <h3 className={`text-xl font-bold mb-5 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Nutrition Information</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {recipe.nutrition.protein && (
                <div className="p-4 bg-[#3AB1A0]/10 rounded-xl border border-[#3AB1A0]">
                  <p className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-700'}`}>PROTEIN</p>
                  <p className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-700'}`}>{recipe.nutrition.protein}g</p>
                </div>
              )}
              {recipe.nutrition.carbs && (
                <div className="p-4 bg-[#3AB1A0]/10 rounded-xl border border-[#3AB1A0]">
                  <p className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-700'}`}>CARBS</p>
                  <p className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-700'}`}>{recipe.nutrition.carbs}g</p>
                </div>
              )}
              {recipe.nutrition.fat && (
                <div className="p-4 bg-[#3AB1A0]/10 rounded-xl border border-[#3AB1A0]">
                  <p className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-700'}`}>FAT</p>
                  <p className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-700'}`}>{recipe.nutrition.fat}g</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dietary Restrictions */}
        {recipe.dietaryRestrictions && recipe.dietaryRestrictions.length > 0 && (
          <div className={`rounded-2xl p-6 shadow-sm border mt-8 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
            <h3 className={`text-xl font-bold mb-5 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Dietary Restrictions</h3>
            <div className="flex flex-wrap gap-2">
              {recipe.dietaryRestrictions.map((restriction, index) => (
                <span
                  key={index}
                  className="px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-sm font-medium"
                >
                  {restriction}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
