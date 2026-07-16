'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  ChefHat,
  Clock,
  Eye,
  Filter
} from 'lucide-react';
import Link from 'next/link';

interface Recipe {
  _id: string;
  name: string;
  description: string;
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  prepTime: number;
  cookTime: number;
  servings: string;
  tags: string[];
  image?: string;
  createdBy: {
    firstName: string;
    lastName: string;
  };
  createdAt: string;
}

export default function HealthCounselorRecipesPage() {
  const { data: session, status } = useSession();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [showSuccess, setShowSuccess] = useState(false);

  // Only fetch when session is authenticated
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      fetchRecipes();
    } else if (status === 'unauthenticated') {
      setLoading(false);
    }
  }, [status, session?.user?.id, searchTerm, selectedCategory, sortBy]);

  const fetchRecipes = async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedCategory && selectedCategory !== 'all') params.append('category', selectedCategory);
      if (sortBy) params.append('sortBy', sortBy);

      const response = await fetch(`/api/recipes?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setRecipes(data.recipes || []);
        setCategories(data.categories || []);
      } else {
        console.error('Failed to fetch recipes:', response.status);
        setRecipes([]);
      }
    } catch (error) {
      console.error('Error fetching recipes:', error);
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Recipe Database</h1>
            <p className="text-gray-600 mt-1">
              Browse and view healthy recipes
            </p>
          </div>
          
          <div className="flex items-center space-x-2 px-4 py-2 bg-orange-50 rounded-lg border border-orange-200">
            <ChefHat className="h-5 w-5 text-orange-600" />
            <span className="text-orange-900 font-semibold">{recipes.length} Recipes</span>
          </div>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search recipes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-45">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Array.from(new Set(
                    categories
                      .filter(c => c && typeof c === 'string' && c.trim())
                      .map(c => c.trim())
                  )).map((category) => (
                    <SelectItem key={`cat-${category.toLowerCase()}`} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-45">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="name">Name A-Z</SelectItem>
                  <SelectItem value="calories-low">Calories (Low)</SelectItem>
                  <SelectItem value="calories-high">Calories (High)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Recipes Grid */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <LoadingSpinner />
          </div>
        ) : recipes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ChefHat className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No recipes found</h3>
              <p className="text-gray-600">Try adjusting your search or filters</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recipes.map((recipe) => (
              <Card key={recipe._id} className="overflow-hidden hover:shadow-lg transition-shadow">
                {recipe.image && (
                  <div className="aspect-video relative overflow-hidden">
                    <img
                      src={recipe.image}
                      alt={recipe.name}
                      className="object-cover w-full h-full"
                    />
                  </div>
                )}
                <CardContent className="p-4">
                  <h3 className="font-semibold text-lg mb-2 line-clamp-1">{recipe.name}</h3>
                  {recipe.description && (
                    <p className="text-gray-600 text-sm mb-3 line-clamp-2">{recipe.description}</p>
                  )}
                  
                  {/* Nutrition info */}
                  <div className="grid grid-cols-4 gap-2 text-center text-xs mb-3">
                    <div className="bg-gray-50 rounded p-1.5">
                      <div className="font-semibold text-gray-900">{recipe.nutrition?.calories || 0}</div>
                      <div className="text-gray-500">Cal</div>
                    </div>
                    <div className="bg-gray-50 rounded p-1.5">
                      <div className="font-semibold text-gray-900">{recipe.nutrition?.protein || 0}g</div>
                      <div className="text-gray-500">Protein</div>
                    </div>
                    <div className="bg-gray-50 rounded p-1.5">
                      <div className="font-semibold text-gray-900">{recipe.nutrition?.carbs || 0}g</div>
                      <div className="text-gray-500">Carbs</div>
                    </div>
                    <div className="bg-gray-50 rounded p-1.5">
                      <div className="font-semibold text-gray-900">{recipe.nutrition?.fat || 0}g</div>
                      <div className="text-gray-500">Fat</div>
                    </div>
                  </div>

                  {/* Prep time and portion */}
                  <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>{(recipe.prepTime || 0) + (recipe.cookTime || 0)} min</span>
                    </div>
                    {recipe.servings && (
                      <div className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                        {recipe.servings}
                      </div>
                    )}
                  </div>

                  {/* Tags */}
                  {recipe.tags && recipe.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {recipe.tags.slice(0, 3).map((tag, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
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

                  {/* View button */}
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/recipes/${recipe._id}`}>
                      <Eye className="h-4 w-4 mr-2" />
                      View Recipe
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
