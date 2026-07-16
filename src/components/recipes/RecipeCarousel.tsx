'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

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
}

export function RecipeCarousel() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchRecipes();
  }, []);

  const fetchRecipes = async () => {
    try {
      const response = await fetch('/api/recipes?limit=10');
      if (response.ok) {
        const data = await response.json();
        setRecipes(data.recipes || []);
      }
    } catch (error) {
      console.error('Error fetching recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-3xl shadow-md border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Healthy Recipes</h3>
          <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="shrink-0 w-40 h-48 bg-gray-200 rounded-2xl animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  if (recipes.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-3xl shadow-md border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900">Healthy Recipes</h3>
        <Link 
          href="/recipes" 
          className="text-sm font-semibold text-teal-600 hover:text-teal-700 flex items-center"
        >
          View All <ChevronRight className="h-4 w-4 ml-0.5" />
        </Link>
      </div>

      {/* Horizontal Scrollable Recipe Cards - Multiple visible */}
      <div
        ref={scrollContainerRef}
        className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {recipes.map((recipe) => (
          <Link
            key={recipe._id}
            href={`/recipes/${recipe._id}`}
            className="shrink-0 w-64 snap-center active:scale-[0.98] transition-transform"
          >
            {/* Recipe Card - Fixed Width */}
            <div className="bg-linear-to-br from-white to-gray-50 rounded-3xl border border-gray-100 overflow-hidden">
              {/* Recipe Image */}
              <div className="relative h-40 w-full bg-linear-to-br from-orange-50 via-amber-50 to-yellow-50 overflow-hidden">
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
                    <span className="text-6xl">🥗</span>
                  </div>
                )}

                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-linear-to-t from-black/30 to-transparent"></div>
              </div>

              {/* Recipe Info */}
              <div className="p-4">
                <h4 className="text-base font-bold text-gray-900 mb-2 line-clamp-2">
                  {recipe.name}
                </h4>

                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div className="text-center p-2 bg-linear-to-br from-orange-500 to-red-500 rounded-lg shadow-sm">
                    <p className="text-lg font-bold text-white">{recipe.calories || recipe.nutrition?.calories || 0}</p>
                    <p className="text-xs text-orange-100 font-medium">Calories</p>
                  </div>
                  <div className="text-center p-2 bg-linear-to-br from-green-500 to-emerald-500 rounded-lg shadow-sm">
                    <p className="text-sm font-bold text-white truncate" title={recipe.servingSize || `${recipe.servings} serving${Number(recipe.servings) > 1 ? 's' : ''}`}>
                      {recipe.servingSize || `${recipe.servings}`}
                    </p>
                    <p className="text-xs text-green-100 font-medium">Serving Size</p>
                  </div>
                  <div className="text-center p-2 bg-linear-to-br from-purple-500 to-indigo-500 rounded-lg shadow-sm">
                    <p className="text-lg font-bold text-white">{recipe.prepTime + recipe.cookTime}</p>
                    <p className="text-xs text-purple-100 font-medium">Minutes</p>
                  </div>
                </div>

                {/* Macros */}
                <div className="flex items-center justify-around text-sm">
                  <div className="text-center">
                    <p className="font-bold text-blue-600">{recipe.protein || recipe.nutrition?.protein || 0}g</p>
                    <p className="text-xs text-gray-500">Protein</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-yellow-600">{recipe.carbs || recipe.nutrition?.carbs || 0}g</p>
                    <p className="text-xs text-gray-500">Carbs</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-purple-600">{recipe.fat || recipe.nutrition?.fat || 0}g</p>
                    <p className="text-xs text-gray-500">Fat</p>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}

