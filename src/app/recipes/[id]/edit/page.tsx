'use client';
import { UserRole } from '@/types';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { compressImage, validateImageFile, uploadCompressedImage } from '@/lib/imageCompression';
import {
  AISkeleton,
  AISkeletonInput,
  AISkeletonTextarea,
  AISkeletonBadges,
  AISkeletonIngredientRow,
  AISkeletonInstructionRow,
} from '@/components/ui/ai-skeleton';
import {
  Plus,
  Trash2,
  ChefHat,
  Clock,
  Users,
  Target,
  AlertCircle,
  ArrowLeft,
  Save,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  Loader2
} from 'lucide-react';

interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  remarks?: string;
}

interface Recipe {
  _id: string;
  name: string;
  description: string;
  // category: string;
  prepTime: number;
  cookTime: number;
  servings: number;
  servingSize?: string;
  nutrition?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  ingredients: Ingredient[];
  instructions: string[];
  dietaryRestrictions: string[];
  medicalContraindications?: string[];
  createdBy: {
    _id?: string;
    id?: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt: string;
  image?: string;
}

export default function EditRecipePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams();
  const recipeId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [aiFetching, setAiFetching] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // const [category, setCategory] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [servings, setServings] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [image, setImage] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ name: '', quantity: 0, unit: '', remarks: '' }]);

  const portionSizes = [
    '1 TSP ( 5 gm/ml )',
    '1.5 TSP ( 7.5 gm/ml )',
    '1/2 TSP ( 2.5 gm/ml )',
    '2 TSP ( 10 gm/ml )',
    '2.5 TSP ( 15 gm/ml )',
    '1 TBSP ( 15 gm/ml )',
    '1.5 TBSP ( 22.5 gm/ml )',
    '2 TBSP ( 30 gm/ml )',
    '1/2 SMALL BOWL ( 100 gm/ml )',
    '1 SMALL BOWL ( 200 gm/ml )',
    '1.5 SMALL BOWL ( 300 gm/ml )',
    '2.5 SMALL BOWL ( 500 gm/ml )',
    '1 LARGE BOWL ( 300 gm/ml )',
    '1.5 LARGE BOWL ( 150 gm/ml )',
    '2 LARGE BOWL ( 600 gm/ml )',
    '1/2 GLASS ( 125 ml )',
    '1 GLASS ( 250 ml )',
    '1 LARGE GLASS ( 300 ml )',
    '1/2 CUP ( 75 ml )',
    '1 CUP ( 150 ml )',
    '1 SMALL KATORI ( 100 gm/ml )',
    '1 MEDIUM KATORI ( 180 gm/ml )',
    '1 LARGE KATORI ( 250 gm/ml )',
    '1 PLATE ( 100 gm )',
    '1 MEDIUM PLATE ( 160 gm )',
    '1 LARGE PLATE ( 220 gm )',
    'GRAM',
    'ML',
    'EGG WHOLE ( 50 GM WHOLE )',
    'EGG WHITE ( 33 GM )',
    '1 DATES ( 10 GM )',
    'FIG (ANJEER) ( 15 gm )',
    'SEASONAL FRUIT ( 100 gm )',
    'SEASONAL FRUIT ( 200 gm )',
    'ROTI ( 35 GM )',
    'FULLKA ( 25 GM )',
    'STUFFED ROTI ( 50 GM )',
    'PARATHA ( 45 GM )',
    'STUFFED PARATHA ( 80 GM )',
    'BREAD (SMALL) ( 25 GM )',
    'BREAD (MEDIUM) ( 35 GM )',
    'BREAD (LARGE) ( 45 GM )'
  ];
  const [instructions, setInstructions] = useState<string[]>(['']);
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([]);
  const [medicalContraindications, setMedicalContraindications] = useState<string[]>([]);

  // const categories = [
  //   'Breakfast', 'Lunch', 'Dinner', 'Snack', 'Appetizer', 'Dessert',
  //   'Beverage', 'Salad', 'Soup', 'Main Course', 'Side Dish'
  // ];

  const availableDietaryRestrictions = [
    'Vegetarian', 'Vegan', 'Gluten-Free', 'Non-Vegetarian', 'Dairy-Free', 'Keto', 'Low-Carb', 'Low-Fat', 'High-Protein', 'Paleo', 'Mediterranean'
  ];

  const availableMedicalContraindications = [
    'Diabetes',
    'High Blood Pressure',
    'Heart Disease',
    'Kidney Disease',
    'Liver Disease',
    'High Cholesterol',
    'Thyroid Disorders',
    'Gout',
    'Acid Reflux/GERD',
    'IBS (Irritable Bowel Syndrome)',
    'Celiac Disease',
    'Lactose Intolerance',
    'Gallbladder Disease',
    'Osteoporosis',
    'Anemia',
    'Food Allergies',
    'Pregnancy',
    'Breastfeeding'
  ];

  const units = [
    'grams', 'kg', 'ounces', 'pounds', 'ml', 'liters', 'cups',
    'tablespoons', 'teaspoons', 'pieces', 'slices', 'cloves', 'bunches'
  ];

  useEffect(() => {
    if (recipeId) {
      fetchRecipe();
    }
  }, [recipeId]);

  const fetchRecipe = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch(`/api/recipes/${recipeId}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || errorData.message || 'Failed to load recipe';
        console.error('Recipe fetch error:', { status: response.status, error: errorMsg });

        if (response.status === 404) {
          setError('Recipe not found. It may have been deleted.');
        } else if (response.status === 401) {
          setError('You are not authenticated. Please log in again.');
        } else if (response.status === 403) {
          setError('You do not have permission to edit this recipe.');
        } else {
          setError(errorMsg);
        }
        return;
      }

      const data = await response.json();
      if (data.success && data.recipe) {
        const recipeData = data.recipe;
        setRecipe(recipeData);

        // Populate form fields with proper type handling
        setName(recipeData.name || '');
        setDescription(recipeData.description || '');
        setPrepTime(String(recipeData.prepTime || '').trim() || '');
        setCookTime(String(recipeData.cookTime || '').trim() || '');

        // Handle servings - use servingSize if available, otherwise format servings number
        if (recipeData.servingSize) {
          setServings(recipeData.servingSize);
        } else if (recipeData.servings) {
          setServings(String(recipeData.servings));
        } else {
          setServings('');
        }

        // Handle nutrition from nested object or flat fields
        const calories = recipeData.nutrition?.calories || recipeData.calories || '';
        const protein = recipeData.nutrition?.protein || recipeData.protein || '';
        const carbs = recipeData.nutrition?.carbs || recipeData.carbs || '';
        const fat = recipeData.nutrition?.fat || recipeData.fat || '';

        setCalories(String(calories).trim() || '');
        setProtein(String(protein).trim() || '');
        setCarbs(String(carbs).trim() || '');
        setFat(String(fat).trim() || '');

        setImage(recipeData.image || '');
        setImagePreview(recipeData.image || '');
        setIsActive(recipeData.isActive !== false);

        // Set ingredients - ensure proper array structure
        try {
          let ingredientsArray: Ingredient[] = [];

          if (Array.isArray(recipeData.ingredients)) {
            ingredientsArray = recipeData.ingredients
              .filter((ing: any) => ing && typeof ing === 'object')
              .map((ing: any) => ({
                name: String(ing.name || '').trim(),
                quantity: Number(ing.quantity) || 0,
                unit: String(ing.unit || '').trim(),
                remarks: String(ing.remarks || '').trim()
              }));
          }

          if (ingredientsArray.length === 0) {
            ingredientsArray = [{ name: '', quantity: 0, unit: '', remarks: '' }];
          }

          setIngredients(ingredientsArray);
        } catch (err) {
          console.error('Error processing ingredients:', err);
          setIngredients([{ name: '', quantity: 0, unit: '', remarks: '' }]);
        }

        // Set instructions - ensure proper array structure
        if (Array.isArray(recipeData.instructions) && recipeData.instructions.length > 0) {
          setInstructions(recipeData.instructions.filter((i: any) => typeof i === 'string'));
        } else {
          setInstructions(['']);
        }

        // Set dietary restrictions - handle both arrays and strings
        const restrictions = recipeData.dietaryRestrictions;
        if (Array.isArray(restrictions)) {
          setDietaryRestrictions(restrictions.filter((r: any) => typeof r === 'string'));
        } else if (typeof restrictions === 'string') {
          setDietaryRestrictions(restrictions.split(',').map((r: string) => r.trim()).filter(Boolean));
        } else {
          setDietaryRestrictions([]);
        }

        // Set medical contraindications - handle both arrays and strings
        const contraindications = recipeData.medicalContraindications;
        if (Array.isArray(contraindications)) {
          setMedicalContraindications(contraindications.filter((c: any) => typeof c === 'string'));
        } else if (typeof contraindications === 'string') {
          setMedicalContraindications(contraindications.split(',').map((c: string) => c.trim()).filter(Boolean));
        } else {
          setMedicalContraindications([]);
        }
      } else {
        setError('Invalid recipe data received from server');
        console.error('Invalid recipe data:', data);
      }
    } catch (error) {
      console.error('Error fetching recipe:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to load recipe';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };



  const canEditRecipe = () => {
    if (!session?.user || !recipe) {
      console.log('canEditRecipe: session or recipe missing', { hasSession: !!session, hasUser: !!session?.user, hasRecipe: !!recipe });
      return false;
    }

    // Allow any dietitian, health counselor, or admin to edit any recipe
    const userRole = session.user.role;
    const allowedRoles = [UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR, UserRole.ADMIN];
    const canEdit = allowedRoles.includes(userRole);

    if (!canEdit) {
      console.log('canEditRecipe: user role not allowed', { userRole, allowedRoles });
    }

    return canEdit;
  };

  // Ingredient management
  const addIngredient = () => {
    const currentIngredients = Array.isArray(ingredients) ? ingredients : [];
    setIngredients([...currentIngredients, { name: '', quantity: 0, unit: '', remarks: '' }]);
  };

  const removeIngredient = (index: number) => {
    const currentIngredients = Array.isArray(ingredients) ? ingredients : [];
    if (currentIngredients.length > 1) {
      setIngredients(currentIngredients.filter((_, i) => i !== index));
    }
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: string | number) => {
    const currentIngredients = Array.isArray(ingredients) ? [...ingredients] : [];
    if (currentIngredients.length > 0 && index < currentIngredients.length) {
      currentIngredients[index] = { ...currentIngredients[index], [field]: value };
      setIngredients(currentIngredients);
    }
  };

  // Instruction management
  const addInstruction = () => {
    const currentInstructions = Array.isArray(instructions) ? instructions : [];
    setInstructions([...currentInstructions, '']);
  };

  const removeInstruction = (index: number) => {
    const currentInstructions = Array.isArray(instructions) ? instructions : [];
    if (currentInstructions.length > 1) {
      setInstructions(currentInstructions.filter((_, i) => i !== index));
    }
  };

  const updateInstruction = (index: number, value: string) => {
    const currentInstructions = Array.isArray(instructions) ? [...instructions] : [];
    if (currentInstructions.length > 0 && index < currentInstructions.length) {
      currentInstructions[index] = value;
      setInstructions(currentInstructions);
    }
  };

  const toggleDietaryRestriction = (restriction: string) => {
    if (dietaryRestrictions.includes(restriction)) {
      setDietaryRestrictions(dietaryRestrictions.filter(r => r !== restriction));
    } else {
      setDietaryRestrictions([...dietaryRestrictions, restriction]);
    }
  };

  const toggleMedicalContraindication = (condition: string) => {
    if (medicalContraindications.includes(condition)) {
      setMedicalContraindications(medicalContraindications.filter(c => c !== condition));
    } else {
      setMedicalContraindications([...medicalContraindications, condition]);
    }
  };

  // AI Auto-fill: regenerate recipe data from OpenAI
  const fetchAIRecipeData = async () => {
    if (!name || name.trim().length < 2 || aiFetching) return;
    setAiFetching(true);
    try {
      const response = await fetch('/api/recipes/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeName: name.trim() }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch AI data');
      }
      const data = await response.json();
      if (data.description) setDescription(data.description);
      if (data.prepTime) setPrepTime(String(data.prepTime));
      if (data.cookTime) setCookTime(String(data.cookTime));
      if (data.portionSize) setServings(data.portionSize);
      if (data.nutrition) {
        if (data.nutrition.calories) setCalories(String(data.nutrition.calories));
        if (data.nutrition.protein) setProtein(String(data.nutrition.protein));
        if (data.nutrition.carbs) setCarbs(String(data.nutrition.carbs));
        if (data.nutrition.fat) setFat(String(data.nutrition.fat));
      }
      if (data.ingredients?.length > 0) setIngredients(data.ingredients);
      if (data.instructions?.length > 0) setInstructions(data.instructions);
      if (data.dietaryRestrictions?.length > 0) setDietaryRestrictions(data.dietaryRestrictions);
      if (data.medicalContraindications?.length > 0) setMedicalContraindications(data.medicalContraindications);
      toast.success('AI auto-filled recipe data!', { description: 'Review and adjust as needed.' });
    } catch (err: any) {
      toast.error('AI auto-fill failed', { description: err.message || 'Please try again.' });
    } finally {
      setAiFetching(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setError(validation.error || 'Invalid image file');
      return;
    }

    setUploading(true);
    setError('');

    try {
      // Compress image
      const { blob } = await compressImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.8,
      });

      // Show preview while uploading
      if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
      setImagePreview(URL.createObjectURL(blob));

      // Upload to ImageKit
      const uploadedUrl = await uploadCompressedImage(blob, file.name, 'recipes');

      setImage(uploadedUrl);
      toast.success('Image uploaded successfully', {
        description: `Original: ${(file.size / 1024 / 1024).toFixed(2)}MB → Compressed: ${(blob.size / 1024 / 1024).toFixed(2)}MB`,
      });
    } catch (error) {
      console.error('Image upload error:', error);
      setError(error instanceof Error ? error.message : 'Failed to upload image');
      setImagePreview('');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!canEditRecipe()) {
      const msg = 'You do not have permission to edit this recipe';
      setError(msg);
      toast.error(msg);
      return;
    }

    // Validate required fields
    if (!name || !name.trim()) {
      toast.error('Recipe name is required');
      return;
    }

    if (!servings || !servings.trim()) {
      toast.error('Portion size is required');
      return;
    }

    const validIngredients = ingredients.filter(ing => ing.name && ing.name.trim() !== '');
    if (validIngredients.length === 0) {
      toast.error('Please add at least one ingredient with a name');
      return;
    }

    if (ingredients.some(ing => ing.name.trim() !== '' && !ing.unit)) {
      toast.error('All ingredients must have a unit specified');
      return;
    }

    const validInstructions = instructions.filter(inst => inst && inst.trim() !== '');
    if (validInstructions.length === 0) {
      toast.error('Please add at least one cooking instruction');
      return;
    }

    // Validate nutrition fields
    const caloriesNum = parseFloat(calories || '0');
    const proteinNum = parseFloat(protein || '0');
    const carbsNum = parseFloat(carbs || '0');
    const fatNum = parseFloat(fat || '0');

    if (caloriesNum <= 0 || proteinNum < 0 || carbsNum < 0 || fatNum < 0) {
      toast.error('Nutrition values must be valid (calories must be positive, others non-negative)');
      return;
    }

    const prepTimeNum = parseInt(prepTime || '0');
    const cookTimeNum = parseInt(cookTime || '0');

    if (prepTimeNum < 0 || cookTimeNum < 0) {
      toast.error('Prep time and cook time must be non-negative');
      return;
    }

    setSaving(true);

    try {
      toast.loading('Updating recipe...', { id: 'update-recipe' });

      const updatePayload = {
        name: name.trim(),
        description: description.trim(),
        prepTime: prepTimeNum,
        cookTime: cookTimeNum,
        servings: servings.trim(),
        image: image?.trim() || '',
        isActive,
        nutrition: {
          calories: caloriesNum,
          protein: proteinNum,
          carbs: carbsNum,
          fat: fatNum
        },
        ingredients: validIngredients.map(ing => ({
          name: ing.name.trim(),
          quantity: ing.quantity || 0,
          unit: ing.unit || '',
          remarks: (ing.remarks || '').trim()
        })),
        instructions: validInstructions.map(i => i.trim()),
        dietaryRestrictions: dietaryRestrictions.filter(Boolean),
        medicalContraindications: medicalContraindications.filter(Boolean)
      };

      console.log('Submitting recipe update:', updatePayload);

      const response = await fetch(`/api/recipes/${recipeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      });

      const responseData = await response.json();

      if (!response.ok) {
        const errorMsg = responseData.message || responseData.error || 'Failed to update recipe';
        console.error('Recipe update error:', { status: response.status, error: errorMsg, data: responseData });
        throw new Error(errorMsg);
      }

      toast.success('Recipe updated successfully!', { id: 'update-recipe' });
      router.push(`/recipes/${recipeId}`);
    } catch (error) {
      console.error('Error updating recipe:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to update recipe. Please try again.';
      setError(errorMsg);
      toast.error(errorMsg, { id: 'update-recipe' });
    } finally {
      setSaving(false);
    }
  };

  // Render ingredients list
  const renderIngredients = () => {
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return (
        <div className="text-gray-500 text-sm py-4">
          No ingredients added. Click "Add Ingredient" to get started.
        </div>
      );
    }

    return ingredients.map((ingredient, index) => (
      <div key={index} className="space-y-3">
        <div className="flex items-end space-x-4">
          <div className="flex-1">
            <Label>Ingredient Name</Label>
            <Input
              placeholder="e.g., Chicken breast"
              value={ingredient.name}
              onChange={(e) => updateIngredient(index, 'name', e.target.value)}
              required
            />
          </div>
          <div className="w-24">
            <Label>Quantity</Label>
            <Input
              type="number"
              step="0.1"
              placeholder="2"
              value={ingredient.quantity || ''}
              onChange={(e) => updateIngredient(index, 'quantity', parseFloat(e.target.value) || 0)}
              required
            />
          </div>
          <div className="w-24">
            <Label>Unit</Label>
            <Select
              value={ingredient.unit}
              onValueChange={(value) => updateIngredient(index, 'unit', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cups">cups</SelectItem>
                <SelectItem value="tbsp">tbsp</SelectItem>
                <SelectItem value="tsp">tsp</SelectItem>
                <SelectItem value="oz">oz</SelectItem>
                <SelectItem value="lbs">lbs</SelectItem>
                <SelectItem value="g">g</SelectItem>
                <SelectItem value="kg">kg</SelectItem>
                <SelectItem value="ml">ml</SelectItem>
                <SelectItem value="l">l</SelectItem>
                <SelectItem value="pieces">pieces</SelectItem>
                <SelectItem value="slices">slices</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-32">
            <Label>Remarks</Label>
            <Input
              placeholder="Optional notes"
              value={ingredient.remarks || ''}
              onChange={(e) => updateIngredient(index, 'remarks', e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => removeIngredient(index)}
            disabled={ingredients.length === 1}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    ));
  };

  // Render instructions list
  const renderInstructions = () => {
    if (!Array.isArray(instructions) || instructions.length === 0) {
      return (
        <div className="text-gray-500 text-sm py-4">
          No instructions added. Click "Add Step" to get started.
        </div>
      );
    }

    return instructions.map((instruction, index) => (
      <div key={index} className="flex items-start space-x-4">
        <div className="shrink-0 w-8 h-8 bg-green-100 text-green-800 rounded-full flex items-center justify-center text-sm font-medium">
          {index + 1}
        </div>
        <div className="flex-1">
          <Textarea
            placeholder={`Step ${index + 1} instructions...`}
            value={instruction || ''}
            onChange={(e) => updateInstruction(index, e.target.value)}
            rows={2}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => removeInstruction(index)}
          disabled={instructions.length === 1}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    ));
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <LoadingSpinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !recipe) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error || 'Recipe not found'}</AlertDescription>
          </Alert>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push('/recipes')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Recipes
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  if (!canEditRecipe()) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>You do not have permission to edit this recipe.</AlertDescription>
          </Alert>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push(`/recipes/${recipeId}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Recipe
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Edit Recipe</h1>
            <p className="text-gray-600 mt-1">Update your recipe details</p>
            {recipe && (
              <p className="text-sm text-gray-500 mt-2">
                Created by Dt. {recipe.createdBy.firstName} {recipe.createdBy.lastName} on {new Date(recipe.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => router.push(`/recipes/${recipeId}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Recipe
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Basic Information</CardTitle>
                  <button
                    type="button"
                    onClick={() => setIsActive(!isActive)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${isActive
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                  >
                    {isActive ? (
                      <>
                        <ToggleRight className="w-5 h-5" />
                        Active
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="w-5 h-5" />
                        Inactive
                      </>
                    )}
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="name">Recipe Name *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Paneer Butter Masala"
                      required
                      className="flex-1"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Description </Label>
                  {aiFetching ? (
                    <AISkeletonTextarea rows={3} />
                  ) : (
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description of the recipe..."
                      rows={3}

                    />
                  )}
                </div>

                <div>
                  <Label htmlFor="image">Recipe Image</Label>
                  <div className="space-y-3">
                    {imagePreview && (
                      <div className="relative w-full h-48 rounded-lg overflow-hidden border border-gray-200">
                        <img
                          src={imagePreview}
                          alt="Recipe preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setImage('');
                            setImagePreview('');
                          }}
                          className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    <Input
                      id="image"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageUpload}
                      disabled={uploading}
                      className="cursor-pointer"
                    />
                    {uploading && (
                      <div className="text-sm text-gray-500 flex items-center gap-2">
                        <LoadingSpinner className="h-4 w-4" />
                        Uploading and compressing image...
                      </div>
                    )}
                    <div className="text-xs text-gray-500">
                      Upload an image for your recipe (max 10MB, JPG/PNG/WebP) - automatically compressed
                    </div>
                  </div>
                </div>
                {/* 
                <div>
                  <Label htmlFor="category">Category *</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="breakfast">Breakfast</SelectItem>
                      <SelectItem value="lunch">Lunch</SelectItem>
                      <SelectItem value="dinner">Dinner</SelectItem>
                      <SelectItem value="snack">Snack</SelectItem>
                      <SelectItem value="dessert">Dessert</SelectItem>
                      <SelectItem value="beverage">Beverage</SelectItem>
                    </SelectContent>
                  </Select>
                </div> */}
              </CardContent>
            </Card>

            {/* Timing & Servings */}
            <Card>
              <CardHeader>
                <CardTitle>Timing & Serving Size</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {aiFetching ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div><Label>Prep Time (min) *</Label><AISkeletonInput /></div>
                      <div><Label>Cook Time (min) *</Label><AISkeletonInput /></div>
                    </div>
                    <div><Label>Serving Size *</Label><AISkeletonInput /></div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="prepTime">Prep Time (min) *</Label>
                        <Input
                          id="prepTime"
                          type="number"
                          value={prepTime}
                          onChange={(e) => setPrepTime(e.target.value)}
                          placeholder="30"
                          min="0"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="cookTime">Cook Time (min) *</Label>
                        <Input
                          id="cookTime"
                          type="number"
                          value={cookTime}
                          onChange={(e) => setCookTime(e.target.value)}
                          placeholder="45"
                          min="0"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="servings">Serving Size *</Label>
                      <Select
                        value={servings}
                        onValueChange={(value) => setServings(value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select serving size" />
                        </SelectTrigger>
                        <SelectContent>
                          {portionSizes.map((size) => (
                            <SelectItem key={size} value={size}>
                              {size}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Nutrition Information */}
          <Card>
            <CardHeader>
              <CardTitle>Nutrition Information (per serving) *</CardTitle>
              <CardDescription>Required - helps users track their nutritional goals</CardDescription>
            </CardHeader>
            <CardContent>
              {aiFetching ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><Label>Calories *</Label><AISkeletonInput /></div>
                  <div><Label>Protein (g) *</Label><AISkeletonInput /></div>
                  <div><Label>Carbs (g) *</Label><AISkeletonInput /></div>
                  <div><Label>Fat (g) *</Label><AISkeletonInput /></div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label htmlFor="calories">Calories *</Label>
                    <Input
                      id="calories"
                      type="number"
                      step="any"
                      value={calories}
                      onChange={(e) => setCalories(e.target.value)}
                      placeholder="350.5"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="protein">Protein (g) *</Label>
                    <Input
                      id="protein"
                      type="number"
                      step="any"
                      value={protein}
                      onChange={(e) => setProtein(e.target.value)}
                      placeholder="25.5"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="carbs">Carbs (g) *</Label>
                    <Input
                      id="carbs"
                      type="number"
                      step="any"
                      value={carbs}
                      onChange={(e) => setCarbs(e.target.value)}
                      placeholder="30.2"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="fat">Fat (g) *</Label>
                    <Input
                      id="fat"
                      type="number"
                      step="any"
                      value={fat}
                      onChange={(e) => setFat(e.target.value)}
                      placeholder="12.8"
                      required
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ingredients */}
          <Card>
            <CardHeader>
              <CardTitle>Ingredients *</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiFetching ? (
                <>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="space-y-3">
                      <div className="flex items-end space-x-4">
                        <div className="flex-1"><AISkeleton className="h-10 w-full" /></div>
                        <div className="w-24"><AISkeleton className="h-10 w-full" /></div>
                        <div className="w-24"><AISkeleton className="h-10 w-full" /></div>
                        <div className="w-32"><AISkeleton className="h-10 w-full" /></div>
                        <AISkeleton className="h-8 w-8" />
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {renderIngredients()}
                  <Button type="button" variant="outline" onClick={addIngredient}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Ingredient
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>Instructions *</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiFetching ? (
                <>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <AISkeletonInstructionRow key={i} step={i + 1} />
                  ))}
                </>
              ) : (
                <>
                  {renderInstructions()}
                  <Button type="button" variant="outline" onClick={addInstruction}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Step
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Dietary Restrictions and Medical Contraindications */}
          <Card>
            <CardHeader>
              <CardTitle>Dietary Restrictions & Medical Contraindications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {aiFetching ? (
                <>
                  <div>
                    <Label>Dietary Restrictions</Label>
                    <div className="mt-2"><AISkeletonBadges count={5} /></div>
                  </div>
                  <div>
                    <Label>Medical Contraindications</Label>
                    <p className="text-sm text-gray-600 mb-2">
                      Select medical conditions for which this recipe should NOT be recommended
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <AISkeleton key={i} className="h-10 w-full rounded-lg" />
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label>Dietary Restrictions</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {availableDietaryRestrictions.map((restriction) => (
                        <Badge
                          key={restriction}
                          variant={dietaryRestrictions.includes(restriction) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleDietaryRestriction(restriction)}
                        >
                          {restriction}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label>Medical Contraindications</Label>
                    <p className="text-sm text-gray-600 mb-2">
                      Select medical conditions for which this recipe should NOT be recommended
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {availableMedicalContraindications.map((condition) => (
                        <div
                          key={condition}
                          className={`p-2 rounded-lg border cursor-pointer transition-colors ${medicalContraindications.includes(condition)
                            ? 'bg-red-50 border-red-200 text-red-800'
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                            }`}
                          onClick={() => toggleMedicalContraindication(condition)}
                        >
                          <div className="flex items-center space-x-2">
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${medicalContraindications.includes(condition)
                              ? 'bg-red-500 border-red-500'
                              : 'border-gray-300'
                              }`}>
                              {medicalContraindications.includes(condition) && (
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                            <span className="text-sm font-medium">{condition}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/recipes/${recipeId}`)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || aiFetching}>
              {saving ? (
                <>
                  <LoadingSpinner className="mr-2 h-4 w-4" />
                  Updating...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Update Recipe
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
