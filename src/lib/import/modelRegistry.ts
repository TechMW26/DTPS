import catalog from './native-model-catalog.json';
import {validateNativeCatalogRow} from './native-catalog-validation';
export interface SchemaFieldInfo {
  path: string;
  type: string;
  required: boolean;
  enum?: string[];
  default?: any;
  defaultKind?: string;
  pattern?: string;
  patternFlags?: string;
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
  collection: string;
  uniqueIndexes?: Array<{fields:string[];sparse?:boolean;partial?:Record<string,unknown>}>;
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


class ModelRegistry {
 private models=new Map<string,RegisteredModel>((catalog as unknown as RegisteredModel[]).map(model=>[model.name,{...model,requiredFields:model.requiredFields.filter(field=>!(model.name==='User'&&field==='password'))}]));
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

      // Required field coverage (0-1). This allows detecting the right model even
      // when one required field is missing, so rows can be marked invalid instead of unmatched.
      const requiredFieldCount = registeredModel.requiredFields.length;
      const matchedRequiredCount = requiredFieldCount - missingRequired.length;
      const requiredCoverage = requiredFieldCount > 0
        ? (matchedRequiredCount / requiredFieldCount)
        : 0;

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
        keywordBonus = Math.min(20, matchedKeywords.length * 4);
      }

      // Penalty for missing required fields (kept small since requiredCoverage already captures this)
      // But for Recipe, reduce penalty since it might have many optional fields
      let missingRequiredPenalty = missingRequired.length * 5;
      if (name === 'Recipe' && missingRequired.length > 0) {
        // Recipe-specific: if we have the strong indicators, reduce the penalty
        const recipeKeywords = ['preptime', 'cooktime', 'ingredients', 'instructions'];
        const hasRecipeKeywords = recipeKeywords.some(kw => rowFieldsLower.some(f => f.includes(kw)));
        if (hasRecipeKeywords) {
          missingRequiredPenalty = missingRequired.length * 3;
        }
      }

      // Smaller penalty for extra fields
      // If model has 50 fields and we have 60 extra, that's a ratio of 1.2, which is 36 penalty points
      // But we cap it at 20 to not over-penalize files with many unknown columns
      const extraFieldRatio = extraFields.length / Math.max(modelFields.length, 1);
      const extraFieldPenalty = Math.min(20, extraFieldRatio * 25);

      // IMPROVED FORMULA:
      // Base: up to 80 points from required field coverage
      // + matchRatio * 20 points (coverage of model fields)
      // + keywordBonus (model-specific indicators)
      // - penalties
      const confidence = Math.max(0, Math.min(100,
        80 * requiredCoverage +         // Up to 80 points from required-field coverage
        matchRatio * 20 +               // Up to 20 more points based on field coverage
        keywordBonus -                  // Bonus for model-specific keywords
        missingRequiredPenalty -        // Penalize for each missing required
        extraFieldPenalty               // Penalize for unknown extra fields
      ));


      // Debug logging
      console.log(`[ModelDetection-${name}] conf=${confidence.toFixed(1)} (reqCov=${(requiredCoverage * 80).toFixed(1)}+match=${(matchRatio * 20).toFixed(1)}+bonus=${keywordBonus}-missing=${missingRequiredPenalty}-extra=${extraFieldPenalty.toFixed(1)}), matched=${matchedFields.length}/${modelFields.length}, missing=${missingRequired.length}/${registeredModel.requiredFields.length}, extra=${extraFields.length}`);


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

  async validateRow(modelName:string,row:Record<string,any>,rowIndex:number){const model=this.get(modelName);const errors=validateNativeCatalogRow(model,row).map(error=>({...error,row:rowIndex}));return {isValid:errors.length===0,errors};}
}
export const modelRegistry=new ModelRegistry();
export type {ModelRegistry};
