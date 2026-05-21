'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowLeft, Clock, Users } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { toast } from 'sonner';

interface Recipe {
  _id: string;
  name: string;
  description?: string;
  image?: string;
  ingredients?: Array<{
    name: string;
    quantity: number;
    unit: string;
    remarks?: string;
  }>;
  instructions?: string[];
  prepTime?: number;
  cookTime?: number;
  servings?: number;
  servingSize?: string;
  nutrition?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
  category?: string;
  cuisine?: string;
  difficulty?: string;
  tags?: string[];
  dietaryRestrictions?: string[];
}

export default function RecipeDetailMobile({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [recipeId, setRecipeId] = useState<string>('');

  useEffect(() => {
    params.then(p => setRecipeId(p.id));
  }, [params]);

  useEffect(() => {
    if (!recipeId) return;

    const controller = new AbortController();
    fetchRecipe(recipeId, controller.signal);

    return () => {
      controller.abort();
    };
  }, [recipeId]);

  const fetchRecipe = async (targetRecipeId: string, signal?: AbortSignal) => {
    try {
      setRecipe(null);
      setLoading(true);
      const response = await fetch(`/api/recipes/${targetRecipeId}`, {
        cache: 'no-store',
        signal,
      });
      if (response.ok) {
        const data = await response.json();
        if (data?.recipe) {
          setRecipe(data.recipe);

          // Normalize legacy UUID routes (e.g. /recipes/2453) to canonical ObjectId routes.
          const resolvedId = String(data.recipe._id || '');
          if (resolvedId && resolvedId !== String(targetRecipeId)) {
            router.replace(`/recipes/${resolvedId}`);
          }
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

  const canEditRecipe = () => {
    if (!session?.user) return false;
    const normalizedRole = (session.user.role || '').toLowerCase().replace(/[\s-]+/g, '_');
    const isAdminRole = normalizedRole.includes('admin');
    return isAdminRole || normalizedRole === 'dietitian' || normalizedRole === 'health_counselor';
  };

  const handleDuplicateRecipe = async () => {
    if (!recipe || !canEditRecipe()) return;

    try {
      toast.loading('Duplicating recipe...', { id: 'duplicate-recipe-mobile' });
      const response = await fetch(`/api/recipes/${recipe._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to duplicate recipe');
      }

      toast.success('Recipe duplicated successfully', { id: 'duplicate-recipe-mobile' });
      if (data?.recipe?._id) {
        router.replace(`/recipes/${data.recipe._id}`);
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error('Error duplicating recipe:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to duplicate recipe', { id: 'duplicate-recipe-mobile' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Recipe not found</p>
          <button
            onClick={() => router.back()}
            className="px-6 py-2 bg-gray-900 text-white rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Header with Back Button */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => router.back()}
            className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center active:scale-95 transition-transform"
          >
            <ArrowLeft className="h-5 w-5 text-gray-700" />
          </button>
          {canEditRecipe() && (
            <button
              onClick={handleDuplicateRecipe}
              className="px-4 h-10 rounded-full bg-gray-900 text-white text-sm font-medium active:scale-95 transition-transform"
            >
              Duplicate
            </button>
          )}
        </div>
      </div>

      {/* Recipe Image */}
      <div className="px-4 mb-6">
        <div className="relative h-64 w-full bg-linear-to-br from-orange-50 via-amber-50 to-yellow-50 rounded-3xl overflow-hidden shadow-lg">
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
              <span className="text-8xl">🥗</span>
            </div>
          )}
        </div>
      </div>

      {/* Recipe Name */}
      <div className="px-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {recipe.name}
        </h1>
        {recipe.description && (
          <p className="text-gray-600 text-sm leading-relaxed">
            {recipe.description}
          </p>
        )}
      </div>

      {/* Quick Stats */}
      <div className="px-6 mb-8">
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>{(recipe.prepTime || 0) + (recipe.cookTime || 0)} min</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>{recipe.servingSize || `${recipe.servings || 1} serving${Number(recipe.servings || 1) > 1 ? 's' : ''}`}</span>
          </div>
        </div>
      </div>

      {/* Ingredients Section */}
      <div className="px-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Ingredients:
        </h2>
        <ul className="space-y-3">
          {(recipe.ingredients || []).map((ingredient, index) => (
            <li key={index} className="flex items-start text-gray-700">
              <span className="mr-3 mt-1.5 h-1.5 w-1.5 rounded-full bg-gray-900 shrink-0"></span>
              <span className="text-base leading-relaxed">
                {ingredient.quantity} {ingredient.unit} {ingredient.name}
                {ingredient.remarks && (
                  <span className="text-sm text-gray-500 italic ml-2">({ingredient.remarks})</span>
                )}
              </span>
            </li>
          ))}
        </ul>
        {(!recipe.ingredients || recipe.ingredients.length === 0) && (
          <p className="text-sm text-gray-500">Ingredients are not available for this recipe yet.</p>
        )}
      </div>

      {/* Instructions Section */}
      <div className="px-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Instructions:
        </h2>
        <ol className="space-y-4">
          {(recipe.instructions || []).map((instruction, index) => (
            <li key={index} className="flex items-start text-gray-700">
              <span className="mr-3 font-bold text-gray-900 shrink-0">
                {index + 1}.
              </span>
              <span className="text-base leading-relaxed flex-1">
                {instruction}
              </span>
            </li>
          ))}
        </ol>
        {(!recipe.instructions || recipe.instructions.length === 0) && (
          <p className="text-sm text-gray-500">Instructions are not available for this recipe yet.</p>
        )}
      </div>

      {/* Nutrition Info */}
      <div className="px-6 ">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Nutrition (per serving):
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{recipe.nutrition?.calories || 0}</p>
            <p className="text-sm text-blue-700 mt-1">Calories</p>
          </div>
          <div className="bg-green-50 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{recipe.nutrition?.protein || 0}g</p>
            <p className="text-sm text-green-700 mt-1">Protein</p>
          </div>
          <div className="bg-yellow-50 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{recipe.nutrition?.carbs || 0}g</p>
            <p className="text-sm text-yellow-700 mt-1">Carbs</p>
          </div>
          <div className="bg-purple-50 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">{recipe.nutrition?.fat || 0}g</p>
            <p className="text-sm text-purple-700 mt-1">Fat</p>
          </div>
        </div>
      </div>

      {/* Dietary Restrictions */}
      {recipe.dietaryRestrictions && recipe.dietaryRestrictions.length > 0 && (
        <div className="px-6 mt-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Dietary Restrictions
          </h2>
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

      {/* Bottom Navigation Placeholder */}

    </div>
  );
}

