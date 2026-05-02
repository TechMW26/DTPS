'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import RecipeDetailMobile from './page-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Clock,
  Users,
  ChefHat,
  Star,
  Edit,
  Trash2,
  AlertTriangle,
  AlertCircle,
  Utensils,
  Timer,
  BookOpen,
  Award,
  Globe,
  Shield,
  X,
  ZoomIn
} from 'lucide-react';
import Link from 'next/link';

interface Recipe {
  _id: string;
  name: string;
  description: string;
  ingredients: {
    name: string;
    quantity: number;
    unit: string;
    remarks?: string;
  }[];
  instructions: string[];
  prepTime: number;
  cookTime: number;
  servings: number;
  servingSize?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  nutrition?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    sugar?: number;
    sodium?: number;
  };
  tags: string[];
  cuisine: string;
  dietaryRestrictions: string | string[] | null | undefined;
  allergens: string | string[] | null | undefined;
  medicalContraindications?: string | string[] | null | undefined;
  difficulty: string;
  image?: string;
  images?: {
    url: string;
    caption: string;
    isMain: boolean;
  }[];
  video?: {
    url: string;
    thumbnail: string;
    duration: number;
  };
  rating: {
    average: number;
    count: number;
  };
  reviews: {
    userId: string;
    userName: string;
    rating: number;
    comment: string;
    images: string[];
    helpful: number;
    createdAt: string;
  }[];
  nutritionNotes?: string;
  tips: string[];
  variations: {
    name: string;
    description: string;
    ingredientChanges: string[];
    nutritionImpact: string;
  }[];
  equipment: string[];
  storage: {
    refrigerator: string;
    freezer: string;
    instructions: string;
  };
  source: {
    type: string;
    url: string;
    author: string;
  };
  isPublic: boolean;
  isPremium: boolean;
  usageCount: number;
  createdBy: {
    _id?: string;
    id?: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export default function RecipeViewPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const recipeId = params?.id as string;

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPWA, setIsPWA] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [backUrl, setBackUrl] = useState('/recipes');

  // Detect mobile device and PWA
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

  // Confirmation dialog hook
  const { showConfirmation, setLoading: setDialogLoading, ConfirmationDialog } = useConfirmationDialog();

  // Set back URL based on user role
  useEffect(() => {
    if (session?.user?.role === 'admin') {
      setBackUrl('/admin/recipes');
    } else {
      setBackUrl('/recipes');
    }
  }, [session?.user?.role]);

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
      setError('');
      setRecipe(null);
      setLoading(true);
      const response = await fetch(`/api/recipes/${targetRecipeId}`, {
        cache: 'no-store',
        signal,
      });

      if (!response.ok) {
        if (response.status === 404) {
          setError('Recipe not found');
        } else {
          setError('Failed to load recipe');
        }
        return;
      }

      const data = await response.json();
      if (data.success && data.recipe && String(data.recipe._id) === String(targetRecipeId)) {
        setRecipe(data.recipe);
      } else {
        setError('Recipe data mismatch. Please refresh and try again.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      console.error('Error fetching recipe:', error);
      setError('Failed to load recipe');
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'hard': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getDietaryRestrictionColor = (restriction: string) => {
    const colors: { [key: string]: string } = {
      'vegetarian': 'bg-green-100 text-green-800',
      'vegan': 'bg-green-100 text-green-800',
      'gluten-free': 'bg-blue-100 text-blue-800',
      'dairy-free': 'bg-purple-100 text-purple-800',
      'keto': 'bg-orange-100 text-orange-800',
      'paleo': 'bg-amber-100 text-amber-800',
      'low-carb': 'bg-indigo-100 text-indigo-800',
      'diabetic-friendly': 'bg-teal-100 text-teal-800'
    };
    return colors[restriction] || 'bg-gray-100 text-gray-800';
  };

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const canEditRecipe = () => {
    if (!session?.user) return false;

    // Allow dietitians, health counselors, and admins to edit/delete recipes
    const normalizedRole = (session.user.role || '').toLowerCase().replace(/[\s-]+/g, '_');
    const isAdminRole = normalizedRole.includes('admin');
    return isAdminRole || normalizedRole === 'dietitian' || normalizedRole === 'health_counselor';
  };

  const handleDeleteRecipe = () => {
    if (!recipe || !canEditRecipe()) return;

    showConfirmation({
      title: 'Delete Recipe',
      description: `Are you sure you want to delete "${recipe.name}"? This action cannot be undone and will permanently remove the recipe from your collection.`,
      confirmText: 'Delete Recipe',
      cancelText: 'Keep Recipe',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          setDialogLoading(true);
          setIsDeleting(true);
          toast.loading('Deleting recipe...', { id: 'delete-recipe' });

          const response = await fetch(`/api/recipes/${recipe._id}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to delete recipe');
          }

          // Show success message and redirect
          toast.success('Recipe deleted successfully!', { id: 'delete-recipe' });
          router.push('/recipes');
        } catch (error) {
          console.error('Error deleting recipe:', error);
          toast.error(error instanceof Error ? error.message : 'Failed to delete recipe', { id: 'delete-recipe' });
          setDialogLoading(false);
        } finally {
          setIsDeleting(false);
        }
      }
    });
  };



  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
          <LoadingSpinner size="lg" />
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900">Loading Recipe</h3>
            <p className="text-gray-600">Please wait while we fetch the recipe details...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !recipe) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-screen p-6">
          <div className="text-center space-y-6 max-w-md">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Oops! Something went wrong</h3>
              <p className="text-gray-600">{error || 'Recipe not found'}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Try Again
              </Button>
              <Button
                onClick={() => router.push(backUrl)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Recipes
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Show mobile version on mobile devices or in PWA
  if (isPWA || isMobile) {
    return <RecipeDetailMobile params={Promise.resolve({ id: recipeId })} />;
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => router.push(backUrl)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Recipes
          </Button>

          {canEditRecipe() && (
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/recipes/${recipe._id}/edit`}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Link>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteRecipe}
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          )}
        </div>

        {/* Recipe Header */}
        <Card>
          <CardHeader>
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between space-y-4 lg:space-y-0">
              <div className="flex-1">
                <CardTitle className="text-3xl font-bold mb-2">{recipe.name}</CardTitle>
                <p className="text-gray-600 text-lg mb-4">{recipe.description}</p>

                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center space-x-1">
                    <Users className="h-4 w-4" />
                    <span>By Dt. {recipe.createdBy.firstName} {recipe.createdBy.lastName}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Clock className="h-4 w-4" />
                    <span>Created {new Date(recipe.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Star className="h-4 w-4 text-yellow-500" />
                    <span>{(recipe.rating?.average || 0).toFixed(1)} ({recipe.rating?.count || 0} reviews)</span>
                  </div>
                  {/* <div className="flex items-center space-x-1">
                    <BookOpen className="h-4 w-4" />
                    <span>{recipe.usageCount} uses</span>
                  </div> */}
                </div>
              </div>

              {recipe.image && (
                <div
                  className="lg:w-80 lg:h-60 w-full h-48 rounded-lg overflow-hidden cursor-pointer relative group"
                  onClick={() => setShowImageModal(true)}
                >
                  <img
                    src={recipe.image}
                    alt={recipe.name}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
        </Card>

        {/* Recipe Info Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Timer className="h-5 w-5 mr-2" />
                Quick Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <Clock className="h-5 w-5 mx-auto mb-1 text-gray-600" />
                  <p className="text-sm text-gray-600">Prep Time</p>
                  <p className="font-semibold">{formatTime(recipe.prepTime)}</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <ChefHat className="h-5 w-5 mx-auto mb-1 text-gray-600" />
                  <p className="text-sm text-gray-600">Cook Time</p>
                  <p className="font-semibold">{formatTime(recipe.cookTime)}</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <Users className="h-5 w-5 mx-auto mb-1 text-gray-600" />
                  <p className="text-sm text-gray-600">Serving Size</p>
                  <p className="font-semibold">{recipe.servingSize || `${recipe.servings} serving${Number(recipe.servings) > 1 ? 's' : ''}`}</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <Award className="h-5 w-5 mx-auto mb-1 text-gray-600" />
                  <p className="text-sm text-gray-600">Difficulty</p>
                  <Badge className={getDifficultyColor(recipe.difficulty)}>
                    {recipe.difficulty}
                  </Badge>
                </div>
              </div>

              <Separator />

              {recipe.cuisine && (
                <div>
                  <p className="text-sm font-medium mb-2">Cuisine</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{recipe.cuisine}</Badge>
                  </div>
                </div>
              )}

              {recipe.dietaryRestrictions && (Array.isArray(recipe.dietaryRestrictions) ? recipe.dietaryRestrictions : [recipe.dietaryRestrictions]).filter(Boolean).length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Dietary Restrictions</p>
                  <div className="flex flex-wrap gap-1">
                    {(() => {
                      const restrictions = Array.isArray(recipe.dietaryRestrictions)
                        ? recipe.dietaryRestrictions
                        : typeof recipe.dietaryRestrictions === 'string'
                          ? (recipe.dietaryRestrictions as string).split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean)
                          : [];
                      return (restrictions as string[]).map((restriction: string, index: number) => (
                        <Badge
                          key={index}
                          className={getDietaryRestrictionColor(restriction)}
                        >
                          {restriction}
                        </Badge>
                      ));
                    })()}
                  </div>
                </div>
              )}

              {recipe.allergens && (Array.isArray(recipe.allergens) ? recipe.allergens : [recipe.allergens]).filter(Boolean).length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center">
                    <Shield className="h-4 w-4 mr-1" />
                    Allergens
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {(() => {
                      const allergens = Array.isArray(recipe.allergens)
                        ? recipe.allergens
                        : typeof recipe.allergens === 'string'
                          ? (recipe.allergens as string).split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean)
                          : [];
                      return (allergens as string[]).map((allergen: string, index: number) => (
                        <Badge key={index} variant="destructive" className="text-xs">
                          {allergen}
                        </Badge>
                      ));
                    })()}
                  </div>
                </div>
              )}

              {recipe.medicalContraindications && (Array.isArray(recipe.medicalContraindications) ? recipe.medicalContraindications : [recipe.medicalContraindications]).filter(Boolean).length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center">
                    <AlertCircle className="h-4 w-4 mr-1 text-red-500" />
                    Medical Contraindications
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {(() => {
                      const contraindications = Array.isArray(recipe.medicalContraindications)
                        ? recipe.medicalContraindications
                        : typeof recipe.medicalContraindications === 'string'
                          ? (recipe.medicalContraindications as string).split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean)
                          : [];
                      return (contraindications as string[]).map((condition: string, index: number) => (
                        <Badge key={index} variant="outline" className="text-xs border-red-200 text-red-700 bg-red-50">
                          {String(condition).replace('-', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                        </Badge>
                      ));
                    })()}
                  </div>
                  <p className="text-xs text-red-600 mt-1">
                    ⚠️ Not recommended for individuals with these conditions
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Nutrition Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Utensils className="h-5 w-5 mr-2" />
                Nutrition (per serving)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">{(recipe.calories || recipe.nutrition?.calories || 0) * servingMultiplier}</p>
                  <p className="text-sm text-gray-600">Calories</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{(recipe.protein || recipe.nutrition?.protein || 0) * servingMultiplier}g</p>
                  <p className="text-sm text-gray-600">Protein</p>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-600">{(recipe.carbs || recipe.nutrition?.carbs || 0) * servingMultiplier}g</p>
                  <p className="text-sm text-gray-600">Carbs</p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{(recipe.fat || recipe.nutrition?.fat || 0) * servingMultiplier}g</p>
                  <p className="text-sm text-gray-600">Fat</p>
                </div>
              </div>

              {(recipe.nutrition?.sugar || recipe.nutrition?.sodium) && (
                <>
                  <Separator className="my-4" />
                  <div className="space-y-2 text-sm">
                    {recipe.nutrition?.sugar && (
                      <div className="flex justify-between">
                        <span>Sugar:</span>
                        <span className="font-medium">{recipe.nutrition.sugar * servingMultiplier}g</span>
                      </div>
                    )}
                    {recipe.nutrition?.sodium && (
                      <div className="flex justify-between">
                        <span>Sodium:</span>
                        <span className="font-medium">{recipe.nutrition.sodium * servingMultiplier}mg</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {recipe.nutritionNotes && (
                <>
                  <Separator className="my-4" />
                  <p className="text-sm text-gray-600">{recipe.nutritionNotes}</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Equipment & Storage */}
          <Card>
            <CardHeader>
              <CardTitle>Additional Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {recipe.equipment && recipe.equipment.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Equipment Needed</p>
                  <ul className="text-sm space-y-1">
                    {recipe.equipment.map((item, index) => (
                      <li key={index} className="flex items-center">
                        <span className="w-2 h-2 bg-gray-400 rounded-full mr-2"></span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {recipe.storage && (recipe.storage.refrigerator || recipe.storage.freezer) && (
                <div>
                  <p className="text-sm font-medium mb-2">Storage</p>
                  <div className="text-sm space-y-1">
                    {recipe.storage.refrigerator && (
                      <p><span className="font-medium">Refrigerator:</span> {recipe.storage.refrigerator}</p>
                    )}
                    {recipe.storage.freezer && (
                      <p><span className="font-medium">Freezer:</span> {recipe.storage.freezer}</p>
                    )}
                    {recipe.storage.instructions && (
                      <p className="text-gray-600 mt-2">{recipe.storage.instructions}</p>
                    )}
                  </div>
                </div>
              )}

              {recipe.source && recipe.source.author && (
                <div>
                  <p className="text-sm font-medium mb-2">Source</p>
                  <div className="text-sm">
                    <p><span className="font-medium">Author:</span> {recipe.source.author}</p>
                    {recipe.source.url && (
                      <a
                        href={recipe.source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        View Original Recipe
                      </a>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center space-x-4 text-sm text-gray-600">
                {recipe.isPublic && (
                  <div className="flex items-center">
                    <Globe className="h-4 w-4 mr-1" />
                    Public
                  </div>
                )}
                {recipe.isPremium && (
                  <div className="flex items-center">
                    <Star className="h-4 w-4 mr-1 text-yellow-500" />
                    Premium
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Ingredients & Instructions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ingredients */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <Utensils className="h-5 w-5 mr-2" />
                  Ingredients
                </CardTitle>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">Multiplier:</span>
                  <div className="flex items-center space-x-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setServingMultiplier(Math.max(0.5, servingMultiplier - 0.5))}
                    >
                      -
                    </Button>
                    <span className="w-12 text-center">{servingMultiplier}x</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setServingMultiplier(servingMultiplier + 0.5)}
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {recipe.ingredients && Array.isArray(recipe.ingredients) && recipe.ingredients.map((ingredient, index) => (
                  <li key={index} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                    />
                    <span className="flex-1">
                      <span className="font-medium">
                        {(ingredient.quantity * servingMultiplier).toFixed(ingredient.quantity < 1 ? 2 : 1)} {ingredient.unit}
                      </span>
                      {' '}
                      <span>{ingredient.name}</span>
                      {ingredient.remarks && (
                        <span className="text-sm text-gray-500 italic ml-2">({ingredient.remarks})</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <BookOpen className="h-5 w-5 mr-2" />
                Instructions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {recipe.instructions && Array.isArray(recipe.instructions) && recipe.instructions.map((instruction, index) => (
                  <li key={index} className="flex space-x-3">
                    <div className="shrink-0 w-8 h-8 bg-green-100 text-green-800 rounded-full flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-900">{instruction}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        {/* Tips & Variations */}
        {(recipe.tips && recipe.tips.length > 0) || (recipe.variations && recipe.variations.length > 0) ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tips */}
            {recipe.tips && recipe.tips.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Award className="h-5 w-5 mr-2" />
                    Chef's Tips
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {recipe.tips && Array.isArray(recipe.tips) && recipe.tips.map((tip, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <span className="w-2 h-2 bg-yellow-400 rounded-full mt-2 shrink-0"></span>
                        <span className="text-gray-700">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Variations */}
            {recipe.variations && recipe.variations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <ChefHat className="h-5 w-5 mr-2" />
                    Variations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {recipe.variations && Array.isArray(recipe.variations) && recipe.variations.map((variation, index) => (
                      <div key={index} className="border-l-4 border-blue-200 pl-4">
                        <h4 className="font-medium text-gray-900">{variation.name}</h4>
                        <p className="text-sm text-gray-600 mt-1">{variation.description}</p>
                        {variation.ingredientChanges && variation.ingredientChanges.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-gray-700">Changes:</p>
                            <ul className="text-xs text-gray-600 mt-1">
                              {variation.ingredientChanges && Array.isArray(variation.ingredientChanges) && variation.ingredientChanges.map((change, idx) => (
                                <li key={idx}>• {change}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {variation.nutritionImpact && (
                          <p className="text-xs text-blue-600 mt-2">
                            <span className="font-medium">Nutrition Impact:</span> {variation.nutritionImpact}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : null}

        {/* Tags */}
        {recipe.tags && recipe.tags.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {recipe.tags && Array.isArray(recipe.tags) && recipe.tags.map((tag, index) => (
                  <Badge key={index} variant="outline" className="text-sm">
                    #{tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Image Modal/Lightbox */}
      {showImageModal && recipe?.image && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setShowImageModal(false)}
        >
          <button
            onClick={() => setShowImageModal(false)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-50"
          >
            <X className="h-8 w-8" />
          </button>
          <div
            className="relative max-w-4xl max-h-[90vh] w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={recipe.image}
              alt={recipe.name}
              className="w-full h-full object-contain rounded-lg"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/70 to-transparent p-4 rounded-b-lg">
              <h3 className="text-white text-lg font-semibold">{recipe.name}</h3>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmationDialog />
    </DashboardLayout>
  );
}
