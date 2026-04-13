/**
 * VALIDATION ENGINE - Strict validation for imported data
 * 
 * Validates data against Mongoose schemas with detailed error reporting.
 * Ensures zero dirty data and zero partial inserts.
 */

import { modelRegistry, ModelMatchResult, SchemaFieldInfo } from './modelRegistry';
import { ParsedRow } from './fileParser';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface ValidationError {
  row: number;
  modelName: string;
  field: string;
  message: string;
  value: any;
  errorType: 'required' | 'type' | 'format' | 'enum' | 'range' | 'extra' | 'unknown';
}

export interface FieldMappingInfo {
  originalField: string;
  mappedField: string | null;
  value: any;
  status: 'mapped' | 'unmapped' | 'empty';
}

export interface RowValidationResult {
  rowIndex: number;
  data: Record<string, any>;
  detectedModel: string | null;
  modelConfidence: number;
  isValid: boolean;
  errors: ValidationError[];
  matchResults: ModelMatchResult[];
  fieldMapping: FieldMappingInfo[];
  unmappedFields: string[];
  emptyFields: string[];
}

export interface ModelGroupedData {
  modelName: string;
  displayName: string;
  rows: Array<{
    rowIndex: number;
    data: Record<string, any>;
    isValid: boolean;
    errors: ValidationError[];
    fieldMapping?: FieldMappingInfo[];
    unmappedFields?: string[];
    emptyFields?: string[];
  }>;
  validCount: number;
  invalidCount: number;
  totalCount: number;
}

export interface ValidationResult {
  success: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  unmatchedRows: number;
  modelGroups: ModelGroupedData[];
  unmatchedData: Array<{
    rowIndex: number;
    data: Record<string, any>;
    matchAttempts: ModelMatchResult[];
  }>;
  allErrors: ValidationError[];
  canSave: boolean;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Parse time string to minutes
 * Handles formats like: "15 mins", "25 min", "1 hour", "1.5 hours", "1hr 30min", "90"
 */
function parseTimeToMinutes(value: any): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  // If it's already a valid number, return it
  if (typeof value === 'number' && !isNaN(value) && value >= 0) {
    return Math.round(value);
  }

  const str = String(value).toLowerCase().trim();

  // If it's a plain number string
  const plainNum = parseFloat(str);
  if (!isNaN(plainNum) && /^[\d.]+$/.test(str)) {
    return Math.round(plainNum);
  }

  let totalMinutes = 0;

  // Match hours pattern: "1 hour", "2 hours", "1.5 hr", "1hr"
  const hourMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  if (hourMatch) {
    totalMinutes += parseFloat(hourMatch[1]) * 60;
  }

  // Match minutes pattern: "30 minutes", "15 mins", "45 min", "30m"
  const minMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b/i);
  if (minMatch) {
    totalMinutes += parseFloat(minMatch[1]);
  }

  // If no pattern matched but there's a number at the start, assume minutes
  if (totalMinutes === 0) {
    const numMatch = str.match(/^(\d+(?:\.\d+)?)/);
    if (numMatch) {
      totalMinutes = parseFloat(numMatch[1]);
    }
  }

  return totalMinutes > 0 ? Math.round(totalMinutes) : null;
}

/**
 * Parse JSON string or return as-is if already parsed
 */
function safeJSONParse(value: any, fallback: any = null): any {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  if (typeof value === 'object') {
    return value;
  }
  if (typeof value === 'string') {
    try {
      // Handle single quotes by converting to double quotes
      const normalized = value.replace(/'/g, '"');
      return JSON.parse(normalized);
    } catch (e) {
      return fallback;
    }
  }
  return fallback;
}

/**
 * Parse nutrition data from various formats
 */
function parseNutrition(value: any): { calories: number; protein: number; carbs: number; fat: number; sugar?: number; sodium?: number } | null {
  if (!value) return null;

  // If it's already an object with required fields
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, any>;
    const result: any = {};

    // Map various field name formats
    const fieldMappings: Record<string, string[]> = {
      calories: ['calories', 'cal', 'kcal', 'energy'],
      protein: ['protein', 'proteins', 'prot'],
      carbs: ['carbs', 'carbohydrates', 'carb', 'carbohydrate'],
      fat: ['fat', 'fats', 'totalfat', 'total_fat'],
      sugar: ['sugar', 'sugars', 'total_sugar'],
      sodium: ['sodium', 'salt', 'na']
    };

    for (const [field, aliases] of Object.entries(fieldMappings)) {
      for (const alias of aliases) {
        const key = Object.keys(obj).find(k => k.toLowerCase() === alias);
        if (key && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
          const num = parseFloat(String(obj[key]));
          if (!isNaN(num)) {
            result[field] = num;
            break;
          }
        }
      }
    }

    // Check required fields
    if (result.calories !== undefined && result.protein !== undefined &&
      result.carbs !== undefined && result.fat !== undefined) {
      return result;
    }
  }

  // Try parsing as JSON string
  const parsed = safeJSONParse(value);
  if (parsed) {
    return parseNutrition(parsed);
  }

  return null;
}

/**
 * Reassemble ingredients from flattened CSV format
 * Handles fields like: ingredients[0], ingredients[1], etc.
 * Returns an array of ingredient objects
 */
function reassembleIngredientsFromFlattened(data: Record<string, any>): any[] | null {
  const flatIngredientsPattern = /^ingredients\[(\d+)\]$/;
  const flatIngredients: Record<number, any> = {};

  for (const [key, value] of Object.entries(data)) {
    const match = key.match(flatIngredientsPattern);
    if (match && value !== undefined && value !== null && value !== '') {
      const index = parseInt(match[1]);
      // Try to parse the value as JSON if it's a string
      let parsedValue = value;
      if (typeof value === 'string') {
        try {
          parsedValue = JSON.parse(value);
        } catch (e) {
          // If JSON parsing fails, keep it as string
        }
      }
      flatIngredients[index] = parsedValue;
    }
  }

  // If we found any flattened ingredients, return them as an array
  if (Object.keys(flatIngredients).length > 0) {
    const sorted = Object.keys(flatIngredients)
      .map(Number)
      .sort((a, b) => a - b)
      .map(idx => flatIngredients[idx]);
    return sorted.length > 0 ? sorted : null;
  }

  return null;
}

/**
 * Parse ingredients array from various formats
 */
function parseIngredients(value: any): Array<{ name: string; quantity: number; unit: string; remarks?: string }> | null {
  if (!value) return null;

  // If already an array
  if (Array.isArray(value)) {
    const ingredients: Array<{ name: string; quantity: number; unit: string; remarks?: string }> = [];

    for (const item of value) {
      if (typeof item === 'string') {
        // Simple string: "2 cups flour"
        const match = item.match(/^([\d./]+(?:\s*-\s*[\d./]+)?)\s*(\w+)?\s+(.+)$/);
        if (match) {
          ingredients.push({
            name: match[3].trim(),
            quantity: parseFloat(match[1]) || 0,
            unit: match[2] || 'unit',
            remarks: ''
          });
        } else {
          ingredients.push({ name: item, quantity: 1, unit: 'unit', remarks: '' });
        }
      } else if (typeof item === 'object' && item !== null) {
        const ing: any = { name: '', quantity: 1, unit: 'unit', remarks: '' };

        // Map common field names
        if (item.name || item.ingredient || item.ingredientName) {
          ing.name = String(item.name || item.ingredient || item.ingredientName);
        }
        if (item.quantity || item.amount || item.qty) {
          const qty = item.quantity || item.amount || item.qty;
          ing.quantity = typeof qty === 'number' ? qty : parseFloat(String(qty)) || 1;
        }
        if (item.unit || item.measure || item.measurement) {
          ing.unit = String(item.unit || item.measure || item.measurement);
        }
        if (item.remarks || item.notes || item.note) {
          const remarks = item.remarks || item.notes || item.note;
          // Handle remarks as array or string
          if (Array.isArray(remarks)) {
            ing.remarks = remarks.filter((r: any) => r).join(', ');
          } else if (remarks && remarks !== 'null') {
            ing.remarks = String(remarks);
          }
        }

        if (ing.name) {
          ingredients.push(ing);
        }
      }
    }

    return ingredients.length > 0 ? ingredients : null;
  }

  // Try parsing as JSON string
  const parsed = safeJSONParse(value);
  if (parsed) {
    return parseIngredients(parsed);
  }

  // Try parsing as comma/newline separated string
  if (typeof value === 'string') {
    const items = value.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    if (items.length > 0) {
      return items.map(item => ({ name: item, quantity: 1, unit: 'unit', remarks: '' }));
    }
  }

  return null;
}

/**
 * Parse instructions array from various formats
 */
function parseInstructions(value: any): string[] | null {
  if (!value) return null;

  // If already an array
  if (Array.isArray(value)) {
    const instructions: string[] = [];
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) {
        instructions.push(item.trim());
      } else if (typeof item === 'object' && item !== null) {
        // Handle objects with step/instruction/text fields
        const text = item.step || item.instruction || item.text || item.description;
        if (text && typeof text === 'string' && text.trim()) {
          instructions.push(text.trim());
        }
      }
    }
    return instructions.length > 0 ? instructions : null;
  }

  // Try parsing as JSON string
  const parsed = safeJSONParse(value);
  if (parsed) {
    return parseInstructions(parsed);
  }

  // Try parsing as numbered/newline separated string
  if (typeof value === 'string') {
    // Split by newlines or numbered steps (1. 2. etc)
    const items = value.split(/(?:\n|(?<=\.)(?=\s*\d+\.)|\d+\.\s*)/).map(s => s.trim()).filter(Boolean);
    if (items.length > 0) {
      return items;
    }
  }

  return null;
}

// Default system user ID for createdBy when not provided
// This should be a valid ObjectId of an admin user in the system
const DEFAULT_SYSTEM_USER_ID = '000000000000000000000000'; // Placeholder - should be configured

// ============================================
// VALIDATION ENGINE CLASS
// ============================================

export class ValidationEngine {
  private modelConfidenceThreshold: number = 60; // Minimum confidence to assign a model

  /**
   * Validate all parsed rows
   */
  async validateAll(
    rows: ParsedRow[],
    forceModel?: string // Optionally force all rows to a specific model
  ): Promise<ValidationResult> {
    const modelGroups: Map<string, ModelGroupedData> = new Map();
    const unmatchedData: Array<{
      rowIndex: number;
      data: Record<string, any>;
      matchAttempts: ModelMatchResult[];
    }> = [];
    const allErrors: ValidationError[] = [];

    // Initialize model groups
    const importableModels = modelRegistry.getImportable();
    for (const model of importableModels) {
      modelGroups.set(model.name, {
        modelName: model.name,
        displayName: model.displayName,
        rows: [],
        validCount: 0,
        invalidCount: 0,
        totalCount: 0
      });
    }

    // Process each row
    for (const row of rows) {
      const result = await this.validateRow(row, forceModel);

      if (result.detectedModel) {
        const group = modelGroups.get(result.detectedModel);
        if (group) {
          group.rows.push({
            rowIndex: result.rowIndex,
            data: result.data,
            isValid: result.isValid,
            errors: result.errors,
            fieldMapping: result.fieldMapping,
            unmappedFields: result.unmappedFields,
            emptyFields: result.emptyFields
          });
          group.totalCount++;
          if (result.isValid) {
            group.validCount++;
          } else {
            group.invalidCount++;
            allErrors.push(...result.errors);
          }
        }
      } else {
        unmatchedData.push({
          rowIndex: result.rowIndex,
          data: result.data,
          matchAttempts: result.matchResults
        });

        // Add error for unmatched row
        allErrors.push({
          row: result.rowIndex,
          modelName: 'Unknown',
          field: '_model',
          message: 'Row does not match any known model schema',
          value: null,
          errorType: 'unknown'
        });
      }
    }

    // Calculate totals
    const validRows = Array.from(modelGroups.values())
      .reduce((sum, g) => sum + g.validCount, 0);
    const invalidRows = Array.from(modelGroups.values())
      .reduce((sum, g) => sum + g.invalidCount, 0);

    // Filter out empty model groups
    const nonEmptyGroups = Array.from(modelGroups.values())
      .filter(g => g.totalCount > 0);

    return {
      success: allErrors.length === 0 && unmatchedData.length === 0,
      totalRows: rows.length,
      validRows,
      invalidRows,
      unmatchedRows: unmatchedData.length,
      modelGroups: nonEmptyGroups,
      unmatchedData,
      allErrors,
      canSave: allErrors.length === 0 && unmatchedData.length === 0
    };
  }

  /**
   * Validate a single row
   */
  async validateRow(
    row: ParsedRow,
    forceModel?: string
  ): Promise<RowValidationResult> {
    let detectedModel: string | null = null;
    let modelConfidence: number = 0;
    let matchResults: ModelMatchResult[] = [];

    if (forceModel) {
      // Use the forced model
      const model = modelRegistry.get(forceModel);
      if (model) {
        detectedModel = forceModel;
        modelConfidence = 100;
        matchResults = [{
          modelName: forceModel,
          confidence: 100,
          matchedFields: Object.keys(row.data),
          missingRequired: [],
          extraFields: [],
          isValid: true
        }];
      }
    } else {
      // Detect model automatically
      matchResults = modelRegistry.detectModel(row.data);

      if (matchResults.length > 0 &&
        matchResults[0].confidence >= this.modelConfidenceThreshold) {
        detectedModel = matchResults[0].modelName;
        modelConfidence = matchResults[0].confidence;
      }
    }

    // If no model detected, return with error
    if (!detectedModel) {
      return {
        rowIndex: row.rowIndex,
        data: row.data,
        detectedModel: null,
        modelConfidence: 0,
        isValid: false,
        errors: [],
        matchResults,
        fieldMapping: [],
        unmappedFields: [],
        emptyFields: []
      };
    }

    // Clean the row data (remove fields not in schema) and track field mapping
    const { cleaned: cleanedData, fieldMapping, unmappedFields, emptyFields } = this.cleanRowData(detectedModel, row.data);

    // Transform data (convert values to correct formats/enums)
    const transformedData = this.transformRowData(detectedModel, cleanedData);

    // Validate against detected model
    const validationResult = await modelRegistry.validateRow(
      detectedModel,
      transformedData,
      row.rowIndex
    );

    // Convert errors to ValidationError format
    const errors: ValidationError[] = validationResult.errors.map(e => ({
      row: e.row,
      modelName: detectedModel!,
      field: e.field,
      message: e.message,
      value: e.value,
      errorType: this.categorizeError(e.message)
    }));

    return {
      rowIndex: row.rowIndex,
      data: transformedData,
      detectedModel,
      modelConfidence,
      isValid: validationResult.isValid,
      errors,
      matchResults,
      fieldMapping,
      unmappedFields,
      emptyFields
    };
  }

  /**
   * Clean row data by removing fields not in the schema
   * and properly handling nested objects/arrays
   * Also tracks field mapping for reporting
   */
  private cleanRowData(modelName: string, data: Record<string, any>): {
    cleaned: Record<string, any>;
    fieldMapping: FieldMappingInfo[];
    unmappedFields: string[];
    emptyFields: string[];
  } {
    const model = modelRegistry.get(modelName);
    if (!model) return {
      cleaned: data,
      fieldMapping: [],
      unmappedFields: [],
      emptyFields: []
    };

    // PRE-PROCESS: Reassemble flattened array fields BEFORE field mapping
    // This handles CSV exports like ingredients[0], ingredients[1], etc.
    let processedData = { ...data };

    if (modelName === 'Recipe') {
      // Reassemble flattened ingredients
      const flatIngredientsPattern = /^ingredients\[(\d+)\]$/;
      const flatIngredients: Record<number, any> = {};
      const flatIngredientKeys: string[] = [];

      for (const [key, value] of Object.entries(processedData)) {
        const match = key.match(flatIngredientsPattern);
        if (match && value !== undefined && value !== null && value !== '') {
          const index = parseInt(match[1]);
          let parsedValue = value;
          if (typeof value === 'string') {
            try {
              parsedValue = JSON.parse(value);
            } catch (e) {
              // If JSON parsing fails, keep it as string
            }
          }
          flatIngredients[index] = parsedValue;
          flatIngredientKeys.push(key);
        }
      }

      // If we found flattened ingredients, reassemble them
      if (Object.keys(flatIngredients).length > 0) {
        const sortedIngredients = Object.keys(flatIngredients)
          .map(Number)
          .sort((a, b) => a - b)
          .map(idx => flatIngredients[idx]);

        // Add the reassembled ingredients array
        processedData.ingredients = sortedIngredients;

        // Remove the flattened fields
        for (const key of flatIngredientKeys) {
          delete processedData[key];
        }
      }

      // Similarly handle flattened instructions if needed
      const flatInstructionsPattern = /^instructions\[(\d+)\]$/;
      const flatInstructions: Record<number, any> = {};
      const flatInstructionKeys: string[] = [];

      for (const [key, value] of Object.entries(processedData)) {
        const match = key.match(flatInstructionsPattern);
        if (match && value !== undefined && value !== null && value !== '') {
          const index = parseInt(match[1]);
          flatInstructions[index] = value;
          flatInstructionKeys.push(key);
        }
      }

      if (Object.keys(flatInstructions).length > 0) {
        const sortedInstructions = Object.keys(flatInstructions)
          .map(Number)
          .sort((a, b) => a - b)
          .map(idx => flatInstructions[idx]);

        processedData.instructions = sortedInstructions;

        for (const key of flatInstructionKeys) {
          delete processedData[key];
        }
      }
    }

    const schemaFields = model.fields.map(f => f.path);
    const allowedFields = new Set([
      ...schemaFields,
      '_id',
      'createdAt',
      'updatedAt',
      '__v'
    ]);

    // Common field aliases for better matching
    const fieldAliases: Record<string, string[]> = {
      // User field aliases
      'firstName': ['first_name', 'firstname', 'fname', 'first'],
      'lastName': ['last_name', 'lastname', 'lname', 'last', 'surname'],
      'email': ['email_address', 'emailaddress', 'mail', 'e-mail'],
      'phone': ['phone_number', 'phonenumber', 'mobile', 'mobile_number', 'contact', 'contact_number'],
      'dateOfBirth': ['date_of_birth', 'dob', 'birth_date', 'birthdate', 'birthday'],
      'height': ['height_cm', 'heightcm', 'height_in_cm', 'user_height'],
      'weight': ['weight_kg', 'weightkg', 'weight_in_kg', 'user_weight', 'current_weight'],
      'heightFeet': ['height_feet', 'heightfeet', 'feet', 'height_ft', 'ht_feet'],
      'heightInch': ['height_inch', 'heightinch', 'inch', 'inches', 'height_in', 'ht_inch'],
      'heightCm': ['height_cm_str', 'cm', 'centimeters'],
      'weightKg': ['weight_kg_str', 'wt_kg', 'weight_kgs'],
      'targetWeightKg': ['target_weight_kg', 'targetweight', 'goal_weight_kg'],
      'targetWeightBucket': ['target_weight_bucket', 'weight_bucket', 'target_bucket', 'your_target_weight', 'what_is_your_target_weight'],
      'activityLevel': ['activity_level', 'activitylevel', 'activity', 'physical_activity', 'exercise_level'],
      'activityRate': ['activity_rate', 'activityrate'],

      // Recipe field aliases
      'prepTime': ['prep_time', 'preptime', 'preparation_time', 'prep', 'prep_minutes', 'preparation'],
      'cookTime': ['cook_time', 'cooktime', 'cooking_time', 'cook', 'cook_minutes', 'cooking'],
      'createdBy': ['created_by', 'createdby', 'author', 'author_id', 'user_id', 'chef', 'creator'],
      'servings': ['serving', 'serves', 'portions', 'yield', 'serving_size', 'num_servings'],
      'nutrition': ['nutritional_info', 'nutritional_information', 'nutrients', 'nutrition_info', 'nutrition_facts'],
      'ingredients': ['ingredient', 'ingredient_list', 'recipe_ingredients'],
      'instructions': ['instruction', 'steps', 'directions', 'method', 'recipe_steps', 'preparation_steps', 'cooking_instructions'],
      'category': ['recipe_category', 'meal_type', 'dish_type', 'type'],
      'cuisine': ['cuisine_type', 'recipe_cuisine', 'food_type', 'origin'],
      'difficulty': ['difficulty_level', 'skill_level', 'complexity', 'level'],
      'dietaryRestrictions': ['dietary_restrictions', 'diet_restrictions', 'dietary', 'restrictions', 'diet_type'],
      'allergens': ['allergen', 'allergy_info', 'allergies', 'allergy'],
      'medicalContraindications': ['medical_contraindications', 'contraindications', 'medical_restrictions'],
      'isPublic': ['is_public', 'public', 'published', 'visible'],
      'isPremium': ['is_premium', 'premium', 'paid', 'pro'],
      'image': ['recipe_image', 'main_image', 'photo', 'picture', 'thumbnail'],
      'gender': ['sex'],
      'role': ['user_role', 'userrole', 'account_type'],
      'status': ['user_status', 'userstatus', 'account_status'],
      'clientStatus': ['client_status', 'engagement_status'],
      'healthGoals': ['health_goals', 'goals', 'fitness_goals'],
      'generalGoal': ['general_goal', 'main_goal', 'primary_goal'],
      'bmiCategory': ['bmi_category', 'bmi_status'],
      'bmr': ['basal_metabolic_rate'],
      'bodyFat': ['body_fat', 'bodyfat', 'body_fat_percentage', 'fat_percentage'],
      'idealWeight': ['ideal_weight', 'target_weight', 'goal_weight'],
      'targetBmi': ['target_bmi', 'goal_bmi'],
      'occupation': ['job', 'profession', 'work'],
      'maritalStatus': ['marital_status', 'married'],
      'anniversary': ['wedding_anniversary', 'anniversary_date'],
      'source': ['lead_source', 'how_found', 'referral'],
      'referralSource': ['referral_source', 'referred_by'],
      'alternativePhone': ['alternative_phone', 'alt_phone', 'secondary_phone'],
      'alternativeEmail': ['alternative_email', 'alt_email', 'secondary_email'],
      'dtps_id': ['dtpsid', 'dtps', 'zoconutid', 'zoconut_id'],
      'avatar': ['profile_image', 'profile_picture', 'photo'],
      'bio': ['biography', 'about', 'description'],
      'experience': ['years_experience', 'exp', 'work_experience'],
      'consultationFee': ['consultation_fee', 'fee', 'price'],
      'dietType': ['diet_type', 'dietary_preference', 'food_preference'],
      'onboardingCompleted': ['onboarding_completed', 'onboarded'],
    };

    // Create reverse lookup for aliases
    const aliasToField: Record<string, string> = {};
    for (const [field, aliases] of Object.entries(fieldAliases)) {
      for (const alias of aliases) {
        aliasToField[alias.toLowerCase()] = field;
      }
    }

    // Get root-level schema field names (for nested object matching)
    const rootFields = new Set(
      schemaFields.map(f => f.split('.')[0])
    );

    const normalizeFieldName = (field: string) => {
      return field.toLowerCase().replace(/_/g, '').replace(/-/g, '');
    };

    const cleaned: Record<string, any> = {};
    const fieldMapping: FieldMappingInfo[] = [];
    const unmappedFields: string[] = [];
    const emptyFields: string[] = [];

    for (const [key, value] of Object.entries(processedData)) {
      // Check if value is empty
      const isEmpty = value === null || value === undefined || value === '' ||
        (typeof value === 'string' && value.trim() === '');

      // Track empty fields even if they're valid schema fields
      if (isEmpty) {
        // Check if it maps to a schema field
        const schemaMatch = Array.from(allowedFields).find(af =>
          af.toLowerCase() === key.toLowerCase() || normalizeFieldName(af) === normalizeFieldName(key)
        );
        if (schemaMatch) {
          emptyFields.push(schemaMatch);
          fieldMapping.push({
            originalField: key,
            mappedField: schemaMatch,
            value: value,
            status: 'empty'
          });
        }
        continue; // Skip empty values
      }

      // Try exact match first
      if (allowedFields.has(key)) {
        cleaned[key] = value;
        fieldMapping.push({
          originalField: key,
          mappedField: key,
          value: value,
          status: 'mapped'
        });
        continue;
      }

      // Try case-insensitive match (map to correct field name)
      let matchedField = Array.from(allowedFields).find(af =>
        af.toLowerCase() === key.toLowerCase()
      );
      if (matchedField) {
        cleaned[matchedField] = value;
        fieldMapping.push({
          originalField: key,
          mappedField: matchedField,
          value: value,
          status: 'mapped'
        });
        continue;
      }

      // Try normalized match (ignore underscores, hyphens, and case)
      const keyNormalized = normalizeFieldName(key);
      matchedField = Array.from(allowedFields).find(af =>
        normalizeFieldName(af) === keyNormalized
      );
      if (matchedField) {
        cleaned[matchedField] = value;
        fieldMapping.push({
          originalField: key,
          mappedField: matchedField,
          value: value,
          status: 'mapped'
        });
        continue;
      }

      // Try alias matching
      const aliasMatch = aliasToField[key.toLowerCase()];
      if (aliasMatch && allowedFields.has(aliasMatch)) {
        cleaned[aliasMatch] = value;
        fieldMapping.push({
          originalField: key,
          mappedField: aliasMatch,
          value: value,
          status: 'mapped'
        });
        continue;
      }

      // Check if this is a nested object that matches a root schema field
      if (typeof value === 'object' && !Array.isArray(value) && rootFields.has(key)) {
        cleaned[key] = value;
        fieldMapping.push({
          originalField: key,
          mappedField: key,
          value: value,
          status: 'mapped'
        });
        continue;
      }

      // Check if this is an array field
      if (Array.isArray(value)) {
        const arrayField = schemaFields.find(f =>
          f === key || f.toLowerCase() === key.toLowerCase()
        );
        if (arrayField) {
          cleaned[arrayField] = value;
          fieldMapping.push({
            originalField: key,
            mappedField: arrayField,
            value: value,
            status: 'mapped'
          });
          continue;
        }

        // Also check without case sensitivity
        const matchedArrayField = Array.from(allowedFields).find(af =>
          af.toLowerCase() === key.toLowerCase()
        );
        if (matchedArrayField) {
          cleaned[matchedArrayField] = value;
          fieldMapping.push({
            originalField: key,
            mappedField: matchedArrayField,
            value: value,
            status: 'mapped'
          });
          continue;
        }
      }

      // Check nested fields (dot notation)
      const isNested = Array.from(allowedFields).some(af =>
        key.startsWith(af + '.') || af.startsWith(key + '.')
      );
      if (isNested) {
        cleaned[key] = value;
        fieldMapping.push({
          originalField: key,
          mappedField: key,
          value: value,
          status: 'mapped'
        });
        continue;
      }

      // Field could not be mapped
      unmappedFields.push(key);
      fieldMapping.push({
        originalField: key,
        mappedField: null,
        value: value,
        status: 'unmapped'
      });
    }

    return { cleaned, fieldMapping, unmappedFields, emptyFields };
  }

  /**
   * Transform row data - convert values to correct formats and enum values
   */
  private transformRowData(modelName: string, data: Record<string, any>): Record<string, any> {
    const transformed = { ...data };

    // User-specific transformations
    if (modelName === 'User') {
      // Ignore password from import files and use backend default.
      // Final hashing is handled at save time in dataImportService.
      transformed.password = '123456';

      // Normalize role to enum values expected by the schema.
      if (transformed.role && typeof transformed.role === 'string') {
        const roleRaw = transformed.role.toLowerCase().trim().replace(/[\s-]+/g, '_');
        if (['admin'].includes(roleRaw)) {
          transformed.role = 'admin';
        } else if (['dietitian', 'dietician', 'nutritionist'].includes(roleRaw)) {
          transformed.role = 'dietitian';
        } else if (['health_counselor', 'health_counsellor', 'healthcoach', 'health_coach', 'counselor', 'counsellor'].includes(roleRaw)) {
          transformed.role = 'health_counselor';
        } else if (['client', 'user', 'customer', 'patient'].includes(roleRaw)) {
          transformed.role = 'client';
        }
      }

      // Normalize account status.
      if (transformed.status && typeof transformed.status === 'string') {
        const statusRaw = transformed.status.toLowerCase().trim().replace(/[\s-]+/g, '_');
        if (['active', 'enabled', 'enable'].includes(statusRaw)) {
          transformed.status = 'active';
        } else if (['inactive', 'disabled', 'disable'].includes(statusRaw)) {
          transformed.status = 'inactive';
        } else if (['suspended', 'suspend', 'blocked'].includes(statusRaw)) {
          transformed.status = 'suspended';
        }
      }

      // Normalize client engagement status.
      if (transformed.clientStatus && typeof transformed.clientStatus === 'string') {
        const clientStatusRaw = transformed.clientStatus.toLowerCase().trim().replace(/[\s-]+/g, '_');
        if (['lead', 'leading'].includes(clientStatusRaw)) {
          transformed.clientStatus = 'lead';
        } else if (['active', 'current'].includes(clientStatusRaw)) {
          transformed.clientStatus = 'active';
        } else if (['inactive', 'paused', 'pause'].includes(clientStatusRaw)) {
          transformed.clientStatus = 'inactive';
        } else if (['onboarding', 'on_boarding'].includes(clientStatusRaw)) {
          transformed.clientStatus = 'onboarding';
        }
      }

      // Fix dateOfBirth format (remove malformed timestamps)
      if (transformed.dateOfBirth) {
        let dateStr = String(transformed.dateOfBirth);
        // Fix malformed ISO strings like "2001-05-16T00:00:0000Z"
        dateStr = dateStr.replace(/T00:00:0000Z/, 'T00:00:00Z');
        dateStr = dateStr.replace(/T00:00:0+Z/, 'T00:00:00Z');
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          transformed.dateOfBirth = date;
        } else {
          delete transformed.dateOfBirth; // Invalid date, remove it
        }
      }

      // Convert BMI number to category
      if (transformed.bmiCategory && typeof transformed.bmiCategory === 'number') {
        const bmi = transformed.bmiCategory;
        if (bmi < 18.5) {
          transformed.bmiCategory = 'Underweight';
        } else if (bmi < 25) {
          transformed.bmiCategory = 'Normal';
        } else if (bmi < 30) {
          transformed.bmiCategory = 'Overweight';
        } else {
          transformed.bmiCategory = 'Obese';
        }
      }

      // Convert general goal descriptions to enum values
      if (transformed.generalGoal && typeof transformed.generalGoal === 'string') {
        const goal = transformed.generalGoal.toLowerCase().trim();
        let mappedGoal = 'not-specified';

        if (goal.includes('weight loss') || goal.includes('weight-loss') ||
          goal.includes('lose') || goal.includes('kgs') ||
          goal.includes('kg loss') || goal.includes('reduce')) {
          mappedGoal = 'weight-loss';
        } else if (goal.includes('weight gain') || goal.includes('weight-gain') ||
          goal.includes('gain') || goal.includes('increase')) {
          mappedGoal = 'weight-gain';
        } else if (goal.includes('disease') || goal.includes('medical') ||
          goal.includes('condition') || goal.includes('management')) {
          mappedGoal = 'disease-management';
        } else if (goal.includes('muscle') || goal.includes('build')) {
          mappedGoal = 'muscle-gain';
        } else if (goal.includes('maintain') || goal.includes('keep') ||
          goal.includes('same')) {
          mappedGoal = 'maintain-weight';
        }

        transformed.generalGoal = mappedGoal;
      }

      // Convert activity level to enum values
      if (transformed.activityLevel && typeof transformed.activityLevel === 'string') {
        const activity = transformed.activityLevel.toLowerCase().trim().replace(/\s+/g, '_');
        let mappedActivity = '';

        // Map common variations to enum values
        if (activity.includes('sedentary') || activity.includes('inactive') || activity.includes('none')) {
          mappedActivity = 'sedentary';
        } else if (activity.includes('lightly') || activity.includes('light') || activity.includes('low')) {
          mappedActivity = 'lightly_active';
        } else if (activity.includes('moderately') || activity.includes('moderate') || activity.includes('medium')) {
          mappedActivity = 'moderately_active';
        } else if (activity.includes('very') || activity.includes('high') || activity.includes('intense')) {
          mappedActivity = 'very_active';
        } else if (activity.includes('extremely') || activity.includes('athlete') || activity.includes('professional')) {
          mappedActivity = 'extremely_active';
        } else if (['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extremely_active'].includes(activity)) {
          mappedActivity = activity;
        }

        transformed.activityLevel = mappedActivity;
      }

      // Ensure heightFeet and heightInch are strings
      if (transformed.heightFeet !== undefined && transformed.heightFeet !== null) {
        transformed.heightFeet = String(transformed.heightFeet);
      }
      if (transformed.heightInch !== undefined && transformed.heightInch !== null) {
        transformed.heightInch = String(transformed.heightInch);
      }
      if (transformed.heightCm !== undefined && transformed.heightCm !== null) {
        transformed.heightCm = String(transformed.heightCm);
      }
      if (transformed.weightKg !== undefined && transformed.weightKg !== null) {
        transformed.weightKg = String(transformed.weightKg);
      }
      if (transformed.targetWeightKg !== undefined && transformed.targetWeightKg !== null) {
        transformed.targetWeightKg = String(transformed.targetWeightKg);
      }

      // Handle healthGoals - must be array of strings
      if (transformed.healthGoals !== undefined) {
        let goals = transformed.healthGoals;

        // If it's a string that looks like JSON, try to parse it
        if (typeof goals === 'string') {
          try {
            // Try to parse as JSON
            const parsed = JSON.parse(goals.replace(/'/g, '"'));
            if (Array.isArray(parsed)) {
              // If it's an array of objects (like goals with calories, protein, etc.), skip it
              if (parsed.length > 0 && typeof parsed[0] === 'object') {
                // This is probably a "goals" object, not healthGoals strings
                // Move to the goals field if it exists, otherwise remove
                if (!transformed.goals) {
                  transformed.goals = parsed[0];
                }
                delete transformed.healthGoals;
              } else {
                // It's an array of strings/primitives, convert to strings
                transformed.healthGoals = parsed.map((g: any) => String(g));
              }
            } else if (typeof parsed === 'object') {
              // Single object - move to goals
              if (!transformed.goals) {
                transformed.goals = parsed;
              }
              delete transformed.healthGoals;
            } else {
              // Single value - wrap in array
              transformed.healthGoals = [String(parsed)];
            }
          } catch (e) {
            // Not valid JSON - could be comma-separated string
            if (goals.includes(',')) {
              transformed.healthGoals = goals.split(',').map((g: string) => g.trim()).filter(Boolean);
            } else if (goals.trim()) {
              transformed.healthGoals = [goals.trim()];
            } else {
              delete transformed.healthGoals;
            }
          }
        } else if (Array.isArray(goals)) {
          // Filter out objects (like {calories: 1800, ...}) and keep only strings
          const stringGoals = goals.filter((g: any) => typeof g === 'string' || typeof g === 'number');
          if (stringGoals.length > 0) {
            transformed.healthGoals = stringGoals.map((g: any) => String(g));
          } else if (goals.length > 0 && typeof goals[0] === 'object') {
            // Array of goal objects - move first one to goals
            if (!transformed.goals) {
              transformed.goals = goals[0];
            }
            delete transformed.healthGoals;
          } else {
            delete transformed.healthGoals;
          }
        } else if (typeof goals === 'object' && goals !== null) {
          // Single object - move to goals
          if (!transformed.goals) {
            transformed.goals = goals;
          }
          delete transformed.healthGoals;
        }
      }

      // Handle assignedDietitians - validate ObjectIds
      if (transformed.assignedDietitians !== undefined) {
        let dietitians = transformed.assignedDietitians;

        // Helper function to validate ObjectId format (24 hex chars)
        const isValidObjectId = (id: string): boolean => {
          if (typeof id !== 'string') return false;
          // Remove any ObjectId wrapper text
          const cleanId = id.replace(/new ObjectId\(['"]?|['"]?\)/g, '').trim();
          return /^[0-9a-fA-F]{24}$/.test(cleanId);
        };

        // Helper to clean ObjectId string
        const cleanObjectId = (id: string): string => {
          if (typeof id !== 'string') return '';
          return id.replace(/new ObjectId\(['"]?|['"]?\)/g, '').trim();
        };

        if (typeof dietitians === 'string') {
          try {
            // Try to parse as JSON
            const parsed = JSON.parse(dietitians.replace(/'/g, '"').replace(/new ObjectId\(/g, '"').replace(/\)/g, '"'));
            if (Array.isArray(parsed)) {
              dietitians = parsed;
            } else {
              dietitians = [parsed];
            }
          } catch (e) {
            // Could be comma-separated
            if (dietitians.includes(',')) {
              dietitians = dietitians.split(',').map((d: string) => d.trim());
            } else if (dietitians.trim()) {
              dietitians = [dietitians.trim()];
            } else {
              dietitians = [];
            }
          }
        }

        if (Array.isArray(dietitians)) {
          // Filter to only valid ObjectIds
          const validIds = dietitians
            .map((d: any) => {
              if (typeof d === 'object' && d !== null) {
                // Could be ObjectId object
                return d.toString ? d.toString() : String(d);
              }
              return cleanObjectId(String(d));
            })
            .filter((id: string) => isValidObjectId(id));

          if (validIds.length > 0) {
            transformed.assignedDietitians = validIds;
          } else {
            delete transformed.assignedDietitians;
          }
        } else {
          delete transformed.assignedDietitians;
        }
      }

      // Handle assignedHealthCounselors - same logic as dietitians
      if (transformed.assignedHealthCounselors !== undefined) {
        let counselors = transformed.assignedHealthCounselors;

        const isValidObjectId = (id: string): boolean => {
          if (typeof id !== 'string') return false;
          const cleanId = id.replace(/new ObjectId\(['"]?|['"]?\)/g, '').trim();
          return /^[0-9a-fA-F]{24}$/.test(cleanId);
        };

        const cleanObjectId = (id: string): string => {
          if (typeof id !== 'string') return '';
          return id.replace(/new ObjectId\(['"]?|['"]?\)/g, '').trim();
        };

        if (typeof counselors === 'string') {
          try {
            const parsed = JSON.parse(counselors.replace(/'/g, '"').replace(/new ObjectId\(/g, '"').replace(/\)/g, '"'));
            if (Array.isArray(parsed)) {
              counselors = parsed;
            } else {
              counselors = [parsed];
            }
          } catch (e) {
            if (counselors.includes(',')) {
              counselors = counselors.split(',').map((c: string) => c.trim());
            } else if (counselors.trim()) {
              counselors = [counselors.trim()];
            } else {
              counselors = [];
            }
          }
        }

        if (Array.isArray(counselors)) {
          const validIds = counselors
            .map((c: any) => {
              if (typeof c === 'object' && c !== null) {
                return c.toString ? c.toString() : String(c);
              }
              return cleanObjectId(String(c));
            })
            .filter((id: string) => isValidObjectId(id));

          if (validIds.length > 0) {
            transformed.assignedHealthCounselors = validIds;
          } else {
            delete transformed.assignedHealthCounselors;
          }
        } else {
          delete transformed.assignedHealthCounselors;
        }
      }

      // Handle tags - validate ObjectIds
      if (transformed.tags !== undefined) {
        let tags = transformed.tags;

        const isValidObjectId = (id: string): boolean => {
          if (typeof id !== 'string') return false;
          const cleanId = id.replace(/new ObjectId\(['"]?|['"]?\)/g, '').trim();
          return /^[0-9a-fA-F]{24}$/.test(cleanId);
        };

        const cleanObjectId = (id: string): string => {
          if (typeof id !== 'string') return '';
          return id.replace(/new ObjectId\(['"]?|['"]?\)/g, '').trim();
        };

        if (typeof tags === 'string') {
          try {
            const parsed = JSON.parse(tags.replace(/'/g, '"').replace(/new ObjectId\(/g, '"').replace(/\)/g, '"'));
            if (Array.isArray(parsed)) {
              tags = parsed;
            } else {
              tags = [parsed];
            }
          } catch (e) {
            if (tags.includes(',')) {
              tags = tags.split(',').map((t: string) => t.trim());
            } else if (tags.trim()) {
              tags = [tags.trim()];
            } else {
              tags = [];
            }
          }
        }

        if (Array.isArray(tags)) {
          const validIds = tags
            .map((t: any) => {
              if (typeof t === 'object' && t !== null) {
                return t.toString ? t.toString() : String(t);
              }
              return cleanObjectId(String(t));
            })
            .filter((id: string) => isValidObjectId(id));

          if (validIds.length > 0) {
            transformed.tags = validIds;
          } else {
            delete transformed.tags;
          }
        } else {
          delete transformed.tags;
        }
      }
    }

    // Recipe-specific transformations
    if (modelName === 'Recipe') {
      // Transform prepTime - parse string formats like "15 mins", "1 hour", etc.
      if (transformed.prepTime !== undefined) {
        const parsedPrepTime = parseTimeToMinutes(transformed.prepTime);
        if (parsedPrepTime !== null) {
          transformed.prepTime = parsedPrepTime;
        } else {
          // If it can't be parsed, set to 0 and let validation catch if invalid
          const numVal = parseFloat(String(transformed.prepTime));
          transformed.prepTime = !isNaN(numVal) ? Math.round(numVal) : 0;
        }
      }

      // Transform cookTime - parse string formats like "25 mins", "1.5 hours", etc.
      if (transformed.cookTime !== undefined) {
        const parsedCookTime = parseTimeToMinutes(transformed.cookTime);
        if (parsedCookTime !== null) {
          transformed.cookTime = parsedCookTime;
        } else {
          // If it can't be parsed, set to 0 and let validation catch if invalid
          const numVal = parseFloat(String(transformed.cookTime));
          transformed.cookTime = !isNaN(numVal) ? Math.round(numVal) : 0;
        }
      }

      // Auto-inject createdBy if missing
      if (!transformed.createdBy || transformed.createdBy === '') {
        // Use DEFAULT_SYSTEM_USER_ID as fallback
        // In production, this should be configured to a real admin user ID
        transformed.createdBy = DEFAULT_SYSTEM_USER_ID;
      } else {
        // Clean existing createdBy value
        const cleanObjectId = (id: string): string => {
          if (typeof id !== 'string') return '';
          return id.replace(/new ObjectId\(['"]?|['"]?\)/g, '').trim();
        };
        const isValidObjectId = (id: string): boolean => {
          if (typeof id !== 'string') return false;
          const cleanId = cleanObjectId(id);
          return /^[0-9a-fA-F]{24}$/.test(cleanId);
        };

        const cleanedId = cleanObjectId(String(transformed.createdBy));
        if (isValidObjectId(cleanedId)) {
          transformed.createdBy = cleanedId;
        } else {
          // Invalid ID provided, use default
          transformed.createdBy = DEFAULT_SYSTEM_USER_ID;
        }
      }

      // Parse and transform nutrition object
      if (transformed.nutrition !== undefined) {
        const parsedNutrition = parseNutrition(transformed.nutrition);
        if (parsedNutrition) {
          transformed.nutrition = parsedNutrition;
        }
      }

      // Parse and transform ingredients array
      // First, try to reassemble from flattened CSV format (ingredients[0], ingredients[1], etc.)
      let ingredientsToProcess = transformed.ingredients;
      const reassembled = reassembleIngredientsFromFlattened(transformed);
      if (reassembled) {
        ingredientsToProcess = reassembled;
        // Remove the flattened fields so they don't show as unmapped
        for (const [key] of Object.entries(transformed)) {
          if (key.match(/^ingredients\[\d+\]$/)) {
            delete transformed[key];
          }
        }
      }

      if (ingredientsToProcess !== undefined) {
        const parsedIngredients = parseIngredients(ingredientsToProcess);
        if (parsedIngredients) {
          transformed.ingredients = parsedIngredients;
        }
      }

      // Parse and transform instructions array
      if (transformed.instructions !== undefined) {
        const parsedInstructions = parseInstructions(transformed.instructions);
        if (parsedInstructions) {
          transformed.instructions = parsedInstructions;
        }
      }

      // Handle servings - convert to number if possible
      if (transformed.servings !== undefined) {
        const servings = transformed.servings;
        if (typeof servings === 'string') {
          // Extract number from strings like "4 servings", "2-4", "4"
          const numMatch = servings.match(/^(\d+(?:\.\d+)?)/);
          if (numMatch) {
            transformed.servings = parseFloat(numMatch[1]);
          }
        } else if (typeof servings === 'number') {
          transformed.servings = servings;
        }
      }

      // Handle tags - for Recipe, tags are strings, not ObjectIds
      if (transformed.tags !== undefined) {
        let recipeTags = transformed.tags;

        if (typeof recipeTags === 'string') {
          try {
            const parsed = JSON.parse(recipeTags.replace(/'/g, '"'));
            if (Array.isArray(parsed)) {
              recipeTags = parsed;
            } else {
              recipeTags = [parsed];
            }
          } catch (e) {
            if (recipeTags.includes(',')) {
              recipeTags = recipeTags.split(',').map((t: string) => t.trim().toLowerCase());
            } else if (recipeTags.trim()) {
              recipeTags = [recipeTags.trim().toLowerCase()];
            } else {
              recipeTags = [];
            }
          }
        }

        if (Array.isArray(recipeTags)) {
          transformed.tags = recipeTags
            .map((t: any) => String(t).trim().toLowerCase())
            .filter((t: string) => t.length > 0);
        }
      }

      // Handle difficulty - normalize to enum values
      if (transformed.difficulty !== undefined && typeof transformed.difficulty === 'string') {
        const difficulty = transformed.difficulty.toLowerCase().trim();
        if (difficulty.includes('easy') || difficulty.includes('simple') || difficulty.includes('beginner')) {
          transformed.difficulty = 'easy';
        } else if (difficulty.includes('hard') || difficulty.includes('difficult') || difficulty.includes('advanced')) {
          transformed.difficulty = 'hard';
        } else {
          transformed.difficulty = 'medium';
        }
      }

      // Handle dietaryRestrictions - ensure it's an array of strings
      if (transformed.dietaryRestrictions !== undefined) {
        let restrictions = transformed.dietaryRestrictions;

        if (typeof restrictions === 'string') {
          try {
            const parsed = JSON.parse(restrictions.replace(/'/g, '"'));
            if (Array.isArray(parsed)) {
              restrictions = parsed;
            } else {
              restrictions = [parsed];
            }
          } catch (e) {
            if (restrictions.includes(',')) {
              restrictions = restrictions.split(',').map((r: string) => r.trim());
            } else if (restrictions.trim()) {
              restrictions = [restrictions.trim()];
            } else {
              restrictions = [];
            }
          }
        }

        if (Array.isArray(restrictions)) {
          transformed.dietaryRestrictions = restrictions
            .map((r: any) => String(r).trim())
            .filter((r: string) => r.length > 0);
        }
      }

      // Handle allergens - normalize to enum values
      if (transformed.allergens !== undefined) {
        let allergens = transformed.allergens;
        const validAllergens = ['nuts', 'dairy', 'eggs', 'soy', 'gluten', 'shellfish', 'fish', 'sesame'];

        if (typeof allergens === 'string') {
          try {
            const parsed = JSON.parse(allergens.replace(/'/g, '"'));
            if (Array.isArray(parsed)) {
              allergens = parsed;
            } else {
              allergens = [parsed];
            }
          } catch (e) {
            if (allergens.includes(',')) {
              allergens = allergens.split(',').map((a: string) => a.trim().toLowerCase());
            } else if (allergens.trim()) {
              allergens = [allergens.trim().toLowerCase()];
            } else {
              allergens = [];
            }
          }
        }

        if (Array.isArray(allergens)) {
          transformed.allergens = allergens
            .map((a: any) => String(a).trim().toLowerCase())
            .filter((a: string) => validAllergens.includes(a));
        }
      }

      // Handle category - ensure proper capitalization
      if (transformed.category && typeof transformed.category === 'string') {
        transformed.category = transformed.category.trim();
      }

      // Handle cuisine - ensure proper formatting
      if (transformed.cuisine && typeof transformed.cuisine === 'string') {
        transformed.cuisine = transformed.cuisine.trim();
      }

      // Handle boolean fields
      const booleanFields = ['isPublic', 'isPremium'];
      for (const field of booleanFields) {
        if (transformed[field] !== undefined) {
          const val = transformed[field];
          if (typeof val === 'string') {
            const lower = val.toLowerCase().trim();
            transformed[field] = lower === 'true' || lower === '1' || lower === 'yes';
          } else if (typeof val === 'number') {
            transformed[field] = val === 1;
          }
        }
      }
    }

    return transformed;
  }

  /**
   * Re-validate specific model group data
   */
  async revalidateModelGroup(
    modelName: string,
    rows: Array<{ rowIndex: number; data: Record<string, any> }>
  ): Promise<{
    validRows: Array<{ rowIndex: number; data: Record<string, any> }>;
    invalidRows: Array<{
      rowIndex: number;
      data: Record<string, any>;
      errors: ValidationError[];
    }>;
    allValid: boolean;
  }> {
    const validRows: Array<{ rowIndex: number; data: Record<string, any> }> = [];
    const invalidRows: Array<{
      rowIndex: number;
      data: Record<string, any>;
      errors: ValidationError[];
    }> = [];

    for (const row of rows) {
      const result = await modelRegistry.validateRow(
        modelName,
        row.data,
        row.rowIndex
      );

      if (result.isValid) {
        validRows.push(row);
      } else {
        invalidRows.push({
          ...row,
          errors: result.errors.map(e => ({
            row: e.row,
            modelName,
            field: e.field,
            message: e.message,
            value: e.value,
            errorType: this.categorizeError(e.message)
          }))
        });
      }
    }

    return {
      validRows,
      invalidRows,
      allValid: invalidRows.length === 0
    };
  }

  /**
   * Validate data before final save (backend safety check)
   */
  async validateForSave(
    modelGroups: Array<{
      modelName: string;
      rows: Array<{ data: Record<string, any> }>;
    }>
  ): Promise<{
    isValid: boolean;
    errors: ValidationError[];
    validatedGroups: Array<{
      modelName: string;
      rows: Array<Record<string, any>>;
    }>;
  }> {
    const errors: ValidationError[] = [];
    const validatedGroups: Array<{
      modelName: string;
      rows: Array<Record<string, any>>;
    }> = [];

    for (const group of modelGroups) {
      const validatedRows: Array<Record<string, any>> = [];

      for (let i = 0; i < group.rows.length; i++) {
        const row = group.rows[i];
        const result = await modelRegistry.validateRow(
          group.modelName,
          row.data,
          i + 1
        );

        if (!result.isValid) {
          errors.push(...result.errors.map(e => ({
            row: e.row,
            modelName: group.modelName,
            field: e.field,
            message: e.message,
            value: e.value,
            errorType: this.categorizeError(e.message)
          })));
        } else {
          validatedRows.push(row.data);
        }
      }

      if (validatedRows.length > 0) {
        validatedGroups.push({
          modelName: group.modelName,
          rows: validatedRows
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      validatedGroups
    };
  }

  /**
   * Categorize error type from message
   */
  private categorizeError(message: string): ValidationError['errorType'] {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('required') || lowerMessage.includes('cannot be empty')) {
      return 'required';
    }
    if (lowerMessage.includes('type') || lowerMessage.includes('cast')) {
      return 'type';
    }
    if (lowerMessage.includes('format') || lowerMessage.includes('invalid')) {
      return 'format';
    }
    if (lowerMessage.includes('enum') || lowerMessage.includes('allowed')) {
      return 'enum';
    }
    if (lowerMessage.includes('min') || lowerMessage.includes('max') ||
      lowerMessage.includes('range') || lowerMessage.includes('length')) {
      return 'range';
    }
    if (lowerMessage.includes('not defined') || lowerMessage.includes('extra')) {
      return 'extra';
    }

    return 'unknown';
  }

  /**
   * Get field suggestions for fixing errors
   */
  getFieldSuggestions(
    modelName: string,
    field: string,
    errorType: ValidationError['errorType']
  ): {
    expectedType: string;
    allowedValues?: string[];
    example?: any;
    hint: string;
  } | null {
    const model = modelRegistry.get(modelName);
    if (!model) return null;

    const fieldInfo = model.fields.find(f => f.path === field);
    if (!fieldInfo) return null;

    const result: any = {
      expectedType: fieldInfo.type,
      hint: ''
    };

    if (fieldInfo.enum) {
      result.allowedValues = fieldInfo.enum;
      result.hint = `Must be one of: ${fieldInfo.enum.join(', ')}`;
    }

    if (fieldInfo.type === 'String') {
      result.example = 'example text';
      if (fieldInfo.minLength || fieldInfo.maxLength) {
        result.hint = `Length must be between ${fieldInfo.minLength || 0} and ${fieldInfo.maxLength || 'unlimited'}`;
      }
    } else if (fieldInfo.type === 'Number') {
      result.example = 123;
      if (fieldInfo.min !== undefined || fieldInfo.max !== undefined) {
        result.hint = `Value must be between ${fieldInfo.min ?? '-∞'} and ${fieldInfo.max ?? '∞'}`;
      }
    } else if (fieldInfo.type === 'Boolean') {
      result.example = true;
      result.allowedValues = ['true', 'false'];
      result.hint = 'Use true or false';
    } else if (fieldInfo.type === 'Date') {
      result.example = '2024-01-15';
      result.hint = 'Use ISO date format (YYYY-MM-DD)';
    } else if (fieldInfo.type === 'ObjectId' || fieldInfo.ref) {
      result.example = '507f1f77bcf86cd799439011';
      result.hint = `Reference to ${fieldInfo.ref || 'another document'}`;
    }

    return result;
  }
}

// Export singleton instance
export const validationEngine = new ValidationEngine();
