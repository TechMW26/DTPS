import {z} from 'zod';
export const nativeRecipeSchema = z.object({
  name: z.string().trim().min(1, "Recipe name is required").max(500),
  category:z.string().max(200).optional(),cuisine:z.string().max(200).optional(),difficulty:z.string().max(100).optional(),servingSize:z.string().max(300).optional(),allergens:z.array(z.string().max(200)).max(100).optional(),dietTypes:z.array(z.string().max(200)).max(100).optional(),mealType:z.string().max(100).optional(),isPublic:z.boolean().optional(),isPremium:z.boolean().optional(),isTemplate:z.boolean().optional(),
  description: z.string().optional(),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1, "Ingredient name is required"),
        quantity: z.number().min(0, "Quantity must be positive"),
        unit: z.string().min(1, "Unit is required"),
        remarks: z.string().optional(),
      }),
    )
    .max(1000),
  instructions: z
    .array(z.string().min(1, "Instruction cannot be empty"))
    .max(1000),
  prepTime: z.number().min(0, "Prep time must be positive"),
  cookTime: z.number().min(0, "Cook time must be positive"),
  servings: z.union([
    z.number().min(1, "Servings must be at least 1"),
    z.string().min(1, "Portion size is required"),
  ]),

  // Support both old and new nutrition formats
  nutrition: z
    .object({
      calories: z.number().min(0, "Calories must be positive"),
      protein: z.number().min(0, "Protein must be positive"),
      carbs: z.number().min(0, "Carbs must be positive"),
      fat: z.number().min(0, "Fat must be positive"),
      sugar: z.number().min(0).optional(),
      sodium: z.number().min(0).optional(),
    })
    .optional(),

  // Legacy format support
  calories: z.number().min(0).optional(),
  macros: z
    .object({
      protein: z.number().min(0).optional(),
      carbs: z.number().min(0).optional(),
      fat: z.number().min(0).optional(),
    })
    .optional(),

  // Support both tags and dietaryRestrictions
  tags: z.array(z.string()).optional(),
  dietaryRestrictions: z.array(z.string()).optional(),
  medicalContraindications: z.array(z.string()).optional(),

  // Active status
  isActive: z.boolean().optional(),

  // Allow any string for image URL
  image: z.string().optional().or(z.literal("")),

  // Force-create even if a similar recipe exists
  forceCreate: z.boolean().optional(),
});
