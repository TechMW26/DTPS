/**
 * MODEL REGISTRY - Central registry for all Mongoose models
 * 
 * This provides automatic model detection and validation
 * for the data import system.
 */

import mongoose, { Model, Schema } from 'mongoose';
import User from '@/lib/db/models/User';
import Appointment from '@/lib/db/models/Appointment';
import Recipe from '@/lib/db/models/Recipe';
import MealPlan from '@/lib/db/models/MealPlan';
import ProgressEntry from '@/lib/db/models/ProgressEntry';
import FoodLog from '@/lib/db/models/FoodLog';
import Task from '@/lib/db/models/Task';
import Tag from '@/lib/db/models/Tag';
import Lead from '@/lib/db/models/Lead';
import ServicePlan from '@/lib/db/models/ServicePlan';
import Notification from '@/lib/db/models/Notification';
import DietTemplate from '@/lib/db/models/DietTemplate';
import Transformation from '@/lib/db/models/Transformation';
import ActivityAssignment from '@/lib/db/models/ActivityAssignment';
import ActivityLog from '@/lib/db/models/ActivityLog';
import Blog from '@/lib/db/models/Blog';
import ClientDocuments from '@/lib/db/models/ClientDocuments';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import ClientSubscription from '@/lib/db/models/ClientSubscription';
import DailyTracking from '@/lib/db/models/DailyTracking';
import DietaryRecall from '@/lib/db/models/DietaryRecall';
import EcommerceBlog from '@/lib/db/models/EcommerceBlog';
import EcommerceOrder from '@/lib/db/models/EcommerceOrder';
import EcommercePayment from '@/lib/db/models/EcommercePayment';
import EcommercePlan from '@/lib/db/models/EcommercePlan';
import EcommerceRating from '@/lib/db/models/EcommerceRating';
import EcommerceTransformation from '@/lib/db/models/EcommerceTransformation';
import File from '@/lib/db/models/File';
import GoalCategory from '@/lib/db/models/GoalCategory';
import History from '@/lib/db/models/History';
import JournalTracking from '@/lib/db/models/JournalTracking';
import LifestyleInfo from '@/lib/db/models/LifestyleInfo';
import MealPlanTemplate from '@/lib/db/models/MealPlanTemplate';
import MedicalInfo from '@/lib/db/models/MedicalInfo';
import Message from '@/lib/db/models/Message';
import OtherPlatformPayment from '@/lib/db/models/OtherPlatformPayment';
import PaymentLink from '@/lib/db/models/PaymentLink';
import SubscriptionPlan from '@/lib/db/models/SubscriptionPlan';
import SystemAlert from '@/lib/db/models/SystemAlert';
import WatiContact from '@/lib/db/models/WatiContact';
import WooCommerceClient from '@/lib/db/models/WooCommerceClient';
// Additional missing models
import Payment from '@/lib/db/models/Payment';
import AdminAuditLog from '@/lib/db/models/AdminAuditLog';
import { AppointmentType, AppointmentMode, ProviderAvailability } from '@/lib/db/models/AppointmentConfig';
import Counter from '@/lib/db/models/Counter';
import GroupMessage from '@/lib/db/models/GroupMessage';
import MessageGroup from '@/lib/db/models/MessageGroup';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface SchemaFieldInfo {
  path: string;
  type: string;
  required: boolean;
  enum?: string[];
  default?: any;
  ref?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  isArray: boolean;
  isNested: boolean;
  nestedFields?: SchemaFieldInfo[];
}

export interface RegisteredModel {
  name: string;
  model: Model<any>;
  schema: Schema;
  fields: SchemaFieldInfo[];
  requiredFields: string[];
  uniqueIdentifiers: string[]; // Fields that can uniquely identify this model
  importable: boolean; // Whether this model supports bulk import
  displayName: string;
  description: string;
}

export interface ModelMatchResult {
  modelName: string;
  confidence: number; // 0-100
  matchedFields: string[];
  missingRequired: string[];
  extraFields: string[];
  isValid: boolean;
}

// ============================================
// MODEL REGISTRY CLASS
// ============================================

class ModelRegistry {
  private models: Map<string, RegisteredModel> = new Map();
  private initialized: boolean = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize the registry with all importable models
   */
  private initialize(): void {
    if (this.initialized) return;

    // Register all importable models
    this.registerModel({
      name: 'User',
      model: User,
      importable: true,
      displayName: 'Users',
      description: 'User accounts (clients, dietitians, admins)',
      uniqueIdentifiers: ['email', 'phone']
    });

    this.registerModel({
      name: 'Lead',
      model: Lead,
      importable: true,
      displayName: 'Leads',
      description: 'Potential clients/leads',
      uniqueIdentifiers: ['email', 'phone']
    });

    this.registerModel({
      name: 'Appointment',
      model: Appointment,
      importable: true,
      displayName: 'Appointments',
      description: 'Scheduled appointments',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'Recipe',
      model: Recipe,
      importable: true,
      displayName: 'Recipes',
      description: 'Food recipes',
      uniqueIdentifiers: ['name']
    });

    this.registerModel({
      name: 'MealPlan',
      model: MealPlan,
      importable: true,
      displayName: 'Meal Plans',
      description: 'Client meal plans',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'ProgressEntry',
      model: ProgressEntry,
      importable: true,
      displayName: 'Progress Entries',
      description: 'Client progress tracking',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'FoodLog',
      model: FoodLog,
      importable: true,
      displayName: 'Food Logs',
      description: 'Food consumption logs',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'Task',
      model: Task,
      importable: true,
      displayName: 'Tasks',
      description: 'Task management',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'Tag',
      model: Tag,
      importable: true,
      displayName: 'Tags',
      description: 'Categorization tags',
      uniqueIdentifiers: ['name']
    });

    this.registerModel({
      name: 'ServicePlan',
      model: ServicePlan,
      importable: true,
      displayName: 'Service Plans',
      description: 'Service/subscription plans',
      uniqueIdentifiers: ['name']
    });

    this.registerModel({
      name: 'DietTemplate',
      model: DietTemplate,
      importable: true,
      displayName: 'Diet Templates',
      description: 'Diet plan templates',
      uniqueIdentifiers: ['name']
    });

    this.registerModel({
      name: 'Transformation',
      model: Transformation,
      importable: true,
      displayName: 'Transformations',
      description: 'Client transformation stories',
      uniqueIdentifiers: []
    });

    // Register all additional models
    this.registerModel({
      name: 'ActivityAssignment',
      model: ActivityAssignment,
      importable: true,
      displayName: 'Activity Assignments',
      description: 'Assigned activities',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'ActivityLog',
      model: ActivityLog,
      importable: true,
      displayName: 'Activity Logs',
      description: 'Activity tracking logs',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'Blog',
      model: Blog,
      importable: true,
      displayName: 'Blogs',
      description: 'Blog posts',
      uniqueIdentifiers: ['slug']
    });

    this.registerModel({
      name: 'ClientDocuments',
      model: ClientDocuments,
      importable: true,
      displayName: 'Client Documents',
      description: 'Client documents',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'ClientMealPlan',
      model: ClientMealPlan,
      importable: true,
      displayName: 'Client Meal Plans',
      description: 'Client specific meal plans',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'ClientSubscription',
      model: ClientSubscription,
      importable: true,
      displayName: 'Client Subscriptions',
      description: 'Client subscription records',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'DailyTracking',
      model: DailyTracking,
      importable: true,
      displayName: 'Daily Tracking',
      description: 'Daily tracking data',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'DietaryRecall',
      model: DietaryRecall,
      importable: true,
      displayName: 'Dietary Recalls',
      description: 'Dietary recall data',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'EcommerceBlog',
      model: EcommerceBlog,
      importable: true,
      displayName: 'Ecommerce Blogs',
      description: 'Ecommerce blog posts',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'EcommerceOrder',
      model: EcommerceOrder,
      importable: true,
      displayName: 'Ecommerce Orders',
      description: 'Ecommerce orders',
      uniqueIdentifiers: ['orderId']
    });

    this.registerModel({
      name: 'EcommercePayment',
      model: EcommercePayment,
      importable: true,
      displayName: 'Ecommerce Payments',
      description: 'Ecommerce payment records',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'EcommercePlan',
      model: EcommercePlan,
      importable: true,
      displayName: 'Ecommerce Plans',
      description: 'Ecommerce plans',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'EcommerceRating',
      model: EcommerceRating,
      importable: true,
      displayName: 'Ecommerce Ratings',
      description: 'Product/service ratings',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'EcommerceTransformation',
      model: EcommerceTransformation,
      importable: true,
      displayName: 'Ecommerce Transformations',
      description: 'Transformation stories for ecommerce',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'File',
      model: File,
      importable: true,
      displayName: 'Files',
      description: 'Uploaded files',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'GoalCategory',
      model: GoalCategory,
      importable: true,
      displayName: 'Goal Categories',
      description: 'Goal categories',
      uniqueIdentifiers: ['name']
    });

    this.registerModel({
      name: 'History',
      model: History,
      importable: true,
      displayName: 'History',
      description: 'Historical records',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'JournalTracking',
      model: JournalTracking,
      importable: true,
      displayName: 'Journal Tracking',
      description: 'Journal entries and tracking',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'LifestyleInfo',
      model: LifestyleInfo,
      importable: true,
      displayName: 'Lifestyle Info',
      description: 'Lifestyle information',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'MealPlanTemplate',
      model: MealPlanTemplate,
      importable: true,
      displayName: 'Meal Plan Templates',
      description: 'Meal plan templates',
      uniqueIdentifiers: ['name']
    });

    this.registerModel({
      name: 'MedicalInfo',
      model: MedicalInfo,
      importable: true,
      displayName: 'Medical Info',
      description: 'Medical information',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'Message',
      model: Message,
      importable: true,
      displayName: 'Messages',
      description: 'Chat messages',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'OtherPlatformPayment',
      model: OtherPlatformPayment,
      importable: true,
      displayName: 'Other Platform Payments',
      description: 'Payments from other platforms',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'PaymentLink',
      model: PaymentLink,
      importable: true,
      displayName: 'Payment Links',
      description: 'Payment links',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'SubscriptionPlan',
      model: SubscriptionPlan,
      importable: true,
      displayName: 'Subscription Plans',
      description: 'Subscription plans',
      uniqueIdentifiers: ['name']
    });

    this.registerModel({
      name: 'SystemAlert',
      model: SystemAlert,
      importable: true,
      displayName: 'System Alerts',
      description: 'System alerts and notifications',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'WatiContact',
      model: WatiContact,
      importable: true,
      displayName: 'Wati Contacts',
      description: 'Wati platform contacts',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'WooCommerceClient',
      model: WooCommerceClient,
      importable: true,
      displayName: 'WooCommerce Clients',
      description: 'WooCommerce client data',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'Notification',
      model: Notification,
      importable: true,
      displayName: 'Notifications',
      description: 'User notifications',
      uniqueIdentifiers: []
    });

    // Additional models
    this.registerModel({
      name: 'Payment',
      model: Payment,
      importable: true,
      displayName: 'Payments',
      description: 'Payment transactions',
      uniqueIdentifiers: ['razorpayPaymentId', 'razorpayOrderId']
    });

    this.registerModel({
      name: 'AdminAuditLog',
      model: AdminAuditLog,
      importable: false,
      displayName: 'Admin Audit Logs',
      description: 'Admin activity audit logs',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'AppointmentType',
      model: AppointmentType,
      importable: true,
      displayName: 'Appointment Types',
      description: 'Appointment type configuration settings',
      uniqueIdentifiers: ['slug']
    });

    this.registerModel({
      name: 'AppointmentMode',
      model: AppointmentMode,
      importable: true,
      displayName: 'Appointment Modes',
      description: 'Appointment mode configuration settings',
      uniqueIdentifiers: ['slug']
    });

    this.registerModel({
      name: 'ProviderAvailability',
      model: ProviderAvailability,
      importable: true,
      displayName: 'Provider Availability',
      description: 'Provider day/time availability settings',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'Counter',
      model: Counter,
      importable: false,
      displayName: 'Counters',
      description: 'Auto-increment counters',
      uniqueIdentifiers: ['name']
    });

    this.registerModel({
      name: 'GroupMessage',
      model: GroupMessage,
      importable: true,
      displayName: 'Group Messages',
      description: 'Group chat messages',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'MessageGroup',
      model: MessageGroup,
      importable: true,
      displayName: 'Message Groups',
      description: 'Message group definitions',
      uniqueIdentifiers: []
    });

    this.registerModel({
      name: 'UnifiedPayment',
      model: UnifiedPayment,
      importable: true,
      displayName: 'Unified Payments',
      description: 'Unified payment records',
      uniqueIdentifiers: ['paymentId', 'orderId']
    });

    this.initialized = true;
  }

  /**
   * Register a model with the registry
   */
  private registerModel(config: {
    name: string;
    model: Model<any>;
    importable: boolean;
    displayName: string;
    description: string;
    uniqueIdentifiers: string[];
  }): void {
    if (!config.model || !config.model.schema) {
      console.error(`[ModelRegistry] Invalid model: ${config.name}. Model or schema is undefined.`, config.model);
      return;
    }

    const schema = config.model.schema;
    const fields = this.extractSchemaFields(schema);
    const requiredFields = fields
      .filter(f => f.required && !f.path.startsWith('_'))
      .map(f => f.path);

    this.models.set(config.name, {
      name: config.name,
      model: config.model,
      schema: schema,
      fields: fields,
      requiredFields: requiredFields,
      uniqueIdentifiers: config.uniqueIdentifiers,
      importable: config.importable,
      displayName: config.displayName,
      description: config.description
    });

    // Debug logging for User model
    if (config.name === 'User') {
      console.log(`[ModelRegistry] Registered User model with ${fields.length} total fields`);
      console.log(`[ModelRegistry] User required fields: ${requiredFields.join(', ')}`);
      console.log(`[ModelRegistry] User total field list (first 20): ${fields.map(f => f.path).slice(0, 20).join(', ')}`);
    }






    // Debug logging for Recipe model
    if (config.name === 'Recipe') {
      console.log(`[ModelRegistry] Registered Recipe model with ${fields.length} total fields`);
      console.log(`[ModelRegistry] Recipe required fields: ${requiredFields.join(', ')}`);
      console.log(`[ModelRegistry] Recipe total field list: ${fields.map(f => f.path).join(', ')}`);
    }
  }





  /**
   * Extract field information from a Mongoose schema
   */
  private extractSchemaFields(schema: Schema, prefix: string = ''): SchemaFieldInfo[] {
    const fields: SchemaFieldInfo[] = [];
    const paths = schema.paths;

    for (const [pathName, schemaType] of Object.entries(paths)) {
      // Skip internal fields
      if (pathName.startsWith('_') && pathName !== '_id') continue;
      if (pathName === '__v') continue;

      const fullPath = prefix ? `${prefix}.${pathName}` : pathName;
      const options = (schemaType as any).options || {};
      const instance = (schemaType as any).instance;

      const fieldInfo: SchemaFieldInfo = {
        path: fullPath,
        type: this.getFieldType(schemaType),
        required: options.required === true ||
          (Array.isArray(options.required) && options.required[0] === true),
        enum: options.enum,
        default: options.default,
        ref: options.ref,
        min: options.min,
        max: options.max,
        minLength: options.minlength,
        maxLength: options.maxlength,
        isArray: instance === 'Array',
        isNested: instance === 'Embedded' || instance === 'Mixed'
      };

      // Handle nested schemas
      if ((schemaType as any).schema) {
        fieldInfo.nestedFields = this.extractSchemaFields(
          (schemaType as any).schema,
          fullPath
        );
      }

      fields.push(fieldInfo);
    }

    return fields;
  }

  /**
   * Flatten nested object field names to get all field paths
   * E.g., { goals: { calories: 1800 }, assignedDietitians: [id1, id2] }
   * becomes [goals, goals.calories, assignedDietitians]
   */
  private flattenFieldNames(obj: Record<string, any>, prefix = ''): string[] {
    const fields: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      fields.push(fullPath);

      // Only flatten one level for nested objects to avoid too many fields
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && !prefix) {
        for (const nestedKey of Object.keys(value)) {
          fields.push(`${fullPath}.${nestedKey}`);
        }
      }
    }

    return fields;
  }

  /**
   * Get the field type as a string
   */
  private getFieldType(schemaType: any): string {
    const instance = schemaType.instance;

    if (instance === 'Array') {
      const caster = schemaType.caster;
      if (caster) {
        return `Array<${caster.instance || 'Mixed'}>`;
      }
      return 'Array';
    }

    return instance || 'Mixed';
  }

  /**
   * Get all registered models
   */
  getAll(): RegisteredModel[] {
    return Array.from(this.models.values());
  }

  /**
   * Get all importable models
   */
  getImportable(): RegisteredModel[] {
    return Array.from(this.models.values()).filter(m => m.importable);
  }

  /**
   * Get a specific model by name
   */
  get(name: string): RegisteredModel | undefined {
    return this.models.get(name);
  }

  /**
   * Get model by name (case-insensitive)
   */
  getByName(name: string): RegisteredModel | undefined {
    const normalizedName = name.toLowerCase();
    for (const [key, model] of this.models) {
      if (key.toLowerCase() === normalizedName) {
        return model;
      }
    }
    return undefined;
  }

  /**
   * Detect which model a row of data belongs to
   */
  detectModel(row: Record<string, any>): ModelMatchResult[] {
    // Include ALL fields, even if empty - we need to check if required fields are PRESENT
    // Also flatten nested objects to get all field paths
    const rowFields = this.flattenFieldNames(row);

    console.log(`\n[ModelDetection] ===== NEW ROW DETECTION =====`);
    console.log(`[ModelDetection] Row fields (${rowFields.length}): ${rowFields.slice(0, 20).join(', ')}${rowFields.length > 20 ? '...' : ''}`);

    const results: ModelMatchResult[] = [];

    for (const [name, registeredModel] of this.models) {
      if (!registeredModel.importable) continue;

      const modelFields = registeredModel.fields
        .filter(f => !f.path.startsWith('_') && f.path !== 'createdAt' && f.path !== 'updatedAt')
        .map(f => f.path);

      // Normalize field names for matching
      const normalizeFieldName = (field: string) => {
        return field.toLowerCase().replace(/_/g, '');
      };

      // Match fields with normalized comparison
      const matchedFields = rowFields.filter((f: string) => {
        const fNormalized = normalizeFieldName(f);

        // Exact match
        if (modelFields.includes(f)) return true;

        // Case-insensitive match
        if (modelFields.some(mf => mf.toLowerCase() === f.toLowerCase())) return true;

        // Normalized match (ignore underscores)
        if (modelFields.some(mf => normalizeFieldName(mf) === fNormalized)) return true;

        // Nested field match
        if (modelFields.some(mf => mf.startsWith(f + '.'))) return true;

        return false;
      });

      const missingRequired = registeredModel.requiredFields.filter((rf: string) => {
        const rfNormalized = normalizeFieldName(rf);

        // Check exact match
        if (rowFields.includes(rf)) return false;

        // Check case-insensitive match
        if (rowFields.some(f => f.toLowerCase() === rf.toLowerCase())) return false;

        // Check normalized match
        if (rowFields.some(f => normalizeFieldName(f) === rfNormalized)) return false;

        // Check nested match
        if (rowFields.some(f => f.startsWith(rf + '.'))) return false;

        return true;
      });

      const extraFields = rowFields.filter((f: string) => {
        const fNormalized = normalizeFieldName(f);

        // Check if matches any model field
        if (modelFields.includes(f)) return false;
        if (modelFields.some(mf => mf.toLowerCase() === f.toLowerCase())) return false;
        if (modelFields.some(mf => normalizeFieldName(mf) === fNormalized)) return false;
        if (modelFields.some(mf => mf.startsWith(f + '.'))) return false;
        if (modelFields.some(mf => f.startsWith(mf + '.'))) return false;

        return true;
      });

      // Calculate confidence score with improved weighting
      // PRIMARY GOAL: If all required fields are present, the row belongs to this model
      // SECONDARY: How many total fields match (coverage)
      // TERTIARY: Model-specific keyword indicators (Recipe has "prepTime", "cookTime", "ingredients", etc.)
      // QUATERNARY: Penalize for extra fields

      // All required fields matched = strong indicator this is the right model
      const hasAllRequired = missingRequired.length === 0 ? 1 : 0;

      // Ratio of matched fields to model fields (how much of the model schema we cover)
      const matchRatio = matchedFields.length / Math.max(modelFields.length, 1);

      // Model-specific keyword indicators for better partial-data detection
      let keywordBonus = 0;
      const rowFieldsLower = rowFields.map(f => f.toLowerCase().replace(/[_-]/g, ''));

      if (name === 'Recipe') {
        // Strong indicators that this is recipe data
        const recipeKeywords = ['preptime', 'cooktime', 'ingredients', 'instructions', 'nutrition', 'servings'];
        const matchedKeywords = recipeKeywords.filter(kw =>
          rowFieldsLower.some(f => f.includes(kw))
        );
        keywordBonus = Math.min(25, matchedKeywords.length * 6); // Up to 25 points for strong indicators
      } else if (name === 'User') {
        // For User model
        const userKeywords = ['firstname', 'lastname', 'email', 'phone', 'dateofbirth', 'height', 'weight'];
        const matchedKeywords = userKeywords.filter(kw =>
          rowFieldsLower.some(f => f.includes(kw))
        );
        keywordBonus = Math.min(15, matchedKeywords.length * 3);
      }

      // Penalty for missing required fields (each missing required field is a strike)
      // But for Recipe, reduce penalty since it might have many optional fields
      let missingRequiredPenalty = missingRequired.length * 10; // 10 points per missing required
      if (name === 'Recipe' && missingRequired.length > 0) {
        // Recipe-specific: if we have the strong indicators, reduce the penalty
        const recipeKeywords = ['preptime', 'cooktime', 'ingredients', 'instructions'];
        const hasRecipeKeywords = recipeKeywords.some(kw => rowFieldsLower.some(f => f.includes(kw)));
        if (hasRecipeKeywords) {
          missingRequiredPenalty = missingRequired.length * 5; // Reduce to 5 per missing for recipe with keywords
        }
      }

      // Smaller penalty for extra fields
      // If model has 50 fields and we have 60 extra, that's a ratio of 1.2, which is 36 penalty points
      // But we cap it at 20 to not over-penalize files with many unknown columns
      const extraFieldRatio = extraFields.length / Math.max(modelFields.length, 1);
      const extraFieldPenalty = Math.min(20, extraFieldRatio * 25);

      // IMPROVED FORMULA: 
      // Base: 80 points (if all required found) 
      // + matchRatio * 20 points (coverage of model fields) 
      // + keywordBonus (model-specific indicators)
      // - penalties
      const confidence = Math.max(0, Math.min(100,
        80 * hasAllRequired +          // 80 points if all required found
        matchRatio * 20 +               // Up to 20 more points based on field coverage
        keywordBonus -                  // Bonus for model-specific keywords
        missingRequiredPenalty -        // Penalize for each missing required
        extraFieldPenalty               // Penalize for unknown extra fields
      ));


      // Debug logging
      console.log(`[ModelDetection-${name}] conf=${confidence.toFixed(1)} (allReq=${hasAllRequired * 80}+match=${(matchRatio * 20).toFixed(1)}+bonus=${keywordBonus}-missing=${missingRequiredPenalty}-extra=${extraFieldPenalty.toFixed(1)}), matched=${matchedFields.length}/${modelFields.length}, missing=${missingRequired.length}/${registeredModel.requiredFields.length}, extra=${extraFields.length}`);


      if (name === 'User' || name === 'Recipe') {
        console.log(`  [${name}-Details] Required fields: ${registeredModel.requiredFields.join(', ')}`);
        console.log(`  [${name}-Details] Missing: ${missingRequired.length > 0 ? missingRequired.join(', ') : 'NONE'}`);
        console.log(`  [${name}-Details] Matched required: ${registeredModel.requiredFields.filter(rf => {
          const rfNorm = normalizeFieldName(rf);
          return rowFields.some(f => normalizeFieldName(f) === rfNorm);
        }).join(', ')}`);
        if (name === 'Recipe') {
          const recipeKeywords = ['preptime', 'cooktime', 'ingredients', 'instructions', 'nutrition', 'servings'];
          const rowFieldsLower = rowFields.map(f => f.toLowerCase().replace(/[_-]/g, ''));
          const matchedKeywords = recipeKeywords.filter(kw =>
            rowFieldsLower.some(f => f.includes(kw))
          );
          console.log(`  [Recipe-Keywords] Matched strong indicators: ${matchedKeywords.join(', ')} (bonus: ${keywordBonus}pts)`);
        }
      }

      results.push({
        modelName: name,
        confidence: confidence,
        matchedFields,
        missingRequired,
        extraFields,
        isValid: missingRequired.length === 0 && extraFields.length === 0
      });
    }

    // Sort by confidence (descending), then by number of matched fields (descending), then by required fields match
    results.sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      // Tiebreaker 1: prefer model with more matched fields
      if (b.matchedFields.length !== a.matchedFields.length) {
        return b.matchedFields.length - a.matchedFields.length;
      }
      // Tiebreaker 2: prefer model with no missing required fields
      if (b.missingRequired.length !== a.missingRequired.length) {
        return a.missingRequired.length - b.missingRequired.length;
      }
      return 0;
    });

    // Log all models ranked by confidence
    console.log(`[ModelDetection] ===== ALL ${results.length} MODELS RANKED =====`);
    results.forEach((r, idx) => {
      const status = r.confidence >= 60 ? '✓' : '✗';
      console.log(`  ${status} ${idx + 1}. ${r.modelName.padEnd(18)} ${r.confidence.toFixed(1).padStart(5)}% (matched: ${r.matchedFields.length}, missing: ${r.missingRequired.length}, extra: ${r.extraFields.length})`);
    });
    console.log(`[ModelDetection] TOP RESULT: ${results[0]?.modelName}(${results[0]?.confidence.toFixed(1)}) vs threshold 60`);
    console.log(`[ModelDetection] ===== END ROW DETECTION =====\n`);
    return results;
  }

  /**
   * Get schema fields for a model (for generating templates)
   */
  getSchemaFields(modelName: string): SchemaFieldInfo[] {
    const model = this.get(modelName);
    return model ? model.fields : [];
  }

  /**
   * Get required fields for a model
   */
  getRequiredFields(modelName: string): string[] {
    const model = this.get(modelName);
    return model ? model.requiredFields : [];
  }

  /**
   * Validate a single row against a model's schema
   */
  async validateRow(
    modelName: string,
    row: Record<string, any>,
    rowIndex: number
  ): Promise<{
    isValid: boolean;
    errors: Array<{
      row: number;
      field: string;
      message: string;
      value: any;
    }>;
  }> {
    const registeredModel = this.get(modelName);
    if (!registeredModel) {
      return {
        isValid: false,
        errors: [{
          row: rowIndex,
          field: '_model',
          message: `Model "${modelName}" not found in registry`,
          value: modelName
        }]
      };
    }

    const errors: Array<{
      row: number;
      field: string;
      message: string;
      value: any;
    }> = [];

    try {
      // Get allowed schema fields
      const schemaFields = registeredModel.fields.map(f => f.path);
      const allowedFields = new Set([
        ...schemaFields,
        '_id',
        'createdAt',
        'updatedAt',
        '__v'
      ]);

      // Filter row data to only include allowed fields
      // This removes extra columns from the import file
      const cleanedRow: Record<string, any> = {};
      for (const [key, value] of Object.entries(row)) {
        const isAllowed = allowedFields.has(key) ||
          Array.from(allowedFields).some(af =>
            key.startsWith(af + '.') || af.startsWith(key + '.')
          );

        if (isAllowed) {
          cleanedRow[key] = value;
        }
      }

      // Create a document instance for validation
      const doc = new registeredModel.model(cleanedRow);

      // Run Mongoose validation
      const validationError = doc.validateSync();

      if (validationError) {
        for (const [field, error] of Object.entries(validationError.errors)) {
          errors.push({
            row: rowIndex,
            field: field,
            message: (error as any).message || 'Validation failed',
            value: cleanedRow[field]
          });
        }
      }

      // Check for empty required fields
      for (const reqField of registeredModel.requiredFields) {
        const value = cleanedRow[reqField];
        if (value === '' || value === null || value === undefined) {
          // Check if error already exists
          const alreadyReported = errors.some(e => e.field === reqField);
          if (!alreadyReported) {
            errors.push({
              row: rowIndex,
              field: reqField,
              message: `"${reqField}" is required and cannot be empty`,
              value: value
            });
          }
        }
      }

    } catch (error: any) {
      errors.push({
        row: rowIndex,
        field: '_general',
        message: error.message || 'Unknown validation error',
        value: null
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get the Mongoose model instance
   */
  getMongooseModel(modelName: string): Model<any> | undefined {
    const registeredModel = this.get(modelName);
    return registeredModel?.model;
  }
}

// Export singleton instance
export const modelRegistry = new ModelRegistry();

// Export types
export type { ModelRegistry };
