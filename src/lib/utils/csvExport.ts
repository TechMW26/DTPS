/**
 * CSV Export Utility
 * 
 * A comprehensive utility for exporting data to CSV format with:
 * - Proper header-to-field mapping
 * - Clean human-readable headers
 * - Support for nested fields
 * - Buffer and object handling
 * - Data type conversion
 * - Special character escaping
 */

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface FieldMapping {
    /** Database/source field name (can be nested like 'user.name') */
    field: string;
    /** Human-readable header name for CSV */
    header: string;
    /** Optional formatter function */
    formatter?: (value: any, row?: any) => string;
    /** Optional default value if field is empty */
    defaultValue?: string;
}

export interface CSVExportOptions {
    /** Array of field mappings defining columns */
    fields: FieldMapping[];
    /** Include BOM for Excel compatibility */
    includeBOM?: boolean;
    /** Delimiter character (default: comma) */
    delimiter?: string;
    /** Line ending (default: \r\n for Windows compatibility) */
    lineEnding?: string;
    /** Quote character (default: ") */
    quoteChar?: string;
    /** Always quote all fields */
    alwaysQuote?: boolean;
}

export interface SchemaField {
    path: string;
    type: string;
    required?: boolean;
    ref?: string;
}

// ============================================
// FIELD NAME UTILITIES
// ============================================

/**
 * Convert camelCase or snake_case to Title Case
 */
export function toTitleCase(str: string): string {
    return str
        // Insert space before capitals in camelCase
        .replace(/([A-Z])/g, ' $1')
        // Replace underscores and hyphens with spaces
        .replace(/[_-]/g, ' ')
        // Capitalize first letter of each word
        .replace(/\b\w/g, char => char.toUpperCase())
        // Clean up multiple spaces
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Generate a clean header name from a field path
 */
export function generateHeaderFromField(fieldPath: string): string {
    // Handle nested paths like 'user.firstName'
    const parts = fieldPath.split('.');
    const lastPart = parts[parts.length - 1];

    // Skip internal fields
    if (lastPart.startsWith('_') && lastPart !== '_id') {
        return '';
    }

    // Comprehensive special case mappings for clean headers
    const specialCases: Record<string, string> = {
        // Common ID fields
        '_id': 'ID',
        'id': 'ID',
        'displayId': 'Display ID',
        'userId': 'User ID',
        'clientId': 'Client ID',
        'dietitianId': 'Dietitian ID',
        'recipeId': 'Recipe ID',
        'mealPlanId': 'Meal Plan ID',
        'appointmentId': 'Appointment ID',
        'orderId': 'Order ID',
        'paymentId': 'Payment ID',
        'uuid': 'UUID',

        // Name fields
        'firstName': 'First Name',
        'lastName': 'Last Name',
        'fullName': 'Full Name',
        'name': 'Name',
        'title': 'Title',
        'displayName': 'Display Name',

        // Contact fields
        'email': 'Email',
        'phone': 'Phone',
        'mobile': 'Mobile',
        'whatsapp': 'WhatsApp',
        'address': 'Address',
        'city': 'City',
        'state': 'State',
        'country': 'Country',
        'pincode': 'Pincode',
        'zipCode': 'Zip Code',

        // Date fields
        'createdAt': 'Created Date',
        'updatedAt': 'Updated Date',
        'deletedAt': 'Deleted Date',
        'dateOfBirth': 'Date of Birth',
        'dob': 'Date of Birth',
        'startDate': 'Start Date',
        'endDate': 'End Date',
        'expiryDate': 'Expiry Date',
        'lastLogin': 'Last Login',
        'lastActive': 'Last Active',
        'scheduledDate': 'Scheduled Date',
        'appointmentDate': 'Appointment Date',

        // Status fields
        'status': 'Status',
        'isActive': 'Is Active',
        'isVerified': 'Is Verified',
        'isDeleted': 'Is Deleted',
        'isPublic': 'Is Public',
        'isPremium': 'Is Premium',
        'isTemplate': 'Is Template',
        'clientStatus': 'Client Status',
        'paymentStatus': 'Payment Status',
        'orderStatus': 'Order Status',
        'onboardingCompleted': 'Onboarding Completed',

        // Assignment fields
        'assignedDietitian': 'Assigned Dietitian',
        'assignedDietitians': 'Assigned Dietitians',
        'assignedHealthCounselor': 'Assigned Health Counselor',
        'assignedHealthCounselors': 'Assigned Health Counselors',
        'createdBy': 'Created By',
        'updatedBy': 'Updated By',

        // User/Profile fields
        'role': 'Role',
        'avatar': 'Avatar',
        'profilePicture': 'Profile Picture',
        'bio': 'Bio',
        'gender': 'Gender',
        'age': 'Age',
        'weight': 'Weight',
        'height': 'Height',
        'bmi': 'BMI',

        // Health fields
        'healthGoals': 'Health Goals',
        'dietaryPreferences': 'Dietary Preferences',
        'allergies': 'Allergies',
        'allergens': 'Allergens',
        'medicalConditions': 'Medical Conditions',
        'medicalContraindications': 'Medical Contraindications',
        'medications': 'Medications',
        'activityLevel': 'Activity Level',

        // Recipe fields
        'ingredients': 'Ingredients',
        'instructions': 'Instructions',
        'servings': 'Servings',
        'servingSize': 'Serving Size',
        'prepTime': 'Prep Time (mins)',
        'cookTime': 'Cook Time (mins)',
        'totalTime': 'Total Time (mins)',
        'calories': 'Calories',
        'protein': 'Protein (g)',
        'carbs': 'Carbs (g)',
        'fat': 'Fat (g)',
        'fiber': 'Fiber (g)',
        'category': 'Category',
        'cuisine': 'Cuisine',
        'mealType': 'Meal Type',
        'dietType': 'Diet Type',
        'dietTypes': 'Diet Types',
        'dietaryRestrictions': 'Dietary Restrictions',
        'difficulty': 'Difficulty',
        'image': 'Image URL',
        'images': 'Image URLs',
        'videoUrl': 'Video URL',
        'rating': 'Rating',
        'ratingCount': 'Rating Count',
        'usageCount': 'Usage Count',
        'favoriteCount': 'Favorite Count',

        // Payment fields
        'amount': 'Amount',
        'currency': 'Currency',
        'transactionId': 'Transaction ID',
        'razorpayPaymentId': 'Razorpay Payment ID',
        'razorpayOrderId': 'Razorpay Order ID',
        'paymentMethod': 'Payment Method',
        'planName': 'Plan Name',
        'planCategory': 'Plan Category',
        'planDuration': 'Plan Duration',

        // Appointment fields
        'duration': 'Duration',
        'type': 'Type',
        'notes': 'Notes',
        'meetingLink': 'Meeting Link',
        'zoomLink': 'Zoom Link',

        // Message fields
        'message': 'Message',
        'content': 'Content',
        'subject': 'Subject',
        'body': 'Body',
        'messageType': 'Message Type',
        'isRead': 'Is Read',
        'readAt': 'Read At',
        'sentAt': 'Sent At',

        // Misc fields
        'tags': 'Tags',
        'description': 'Description',
        'remarks': 'Remarks',
        'comments': 'Comments',
        'priority': 'Priority',
        'source': 'Source',
        'referralCode': 'Referral Code',
        'couponCode': 'Coupon Code',
        'discount': 'Discount',
    };

    if (specialCases[lastPart]) {
        // For nested paths, prepend parent name
        if (parts.length > 1) {
            const parentName = toTitleCase(parts.slice(0, -1).join(' '));
            return `${parentName} ${specialCases[lastPart]}`;
        }
        return specialCases[lastPart];
    }

    // Generate from the full path for nested fields
    if (parts.length > 1) {
        return parts.map(part => toTitleCase(part)).join(' ');
    }

    return toTitleCase(lastPart);
}

/**
 * Auto-generate field mappings from a schema
 */
export function generateFieldMappingsFromSchema(
    schemaFields: SchemaField[],
    excludeFields: string[] = ['__v', 'password', 'passwordHash', 'refreshToken']
): FieldMapping[] {
    return schemaFields
        .filter(f => !excludeFields.includes(f.path) && !f.path.startsWith('$'))
        .map(f => ({
            field: f.path,
            header: generateHeaderFromField(f.path),
        }))
        .filter(f => f.header !== '');
}

/**
 * Auto-generate field mappings from data
 */
export function generateFieldMappingsFromData(
    data: Record<string, any>[],
    excludeFields: string[] = ['__v', 'password', 'passwordHash', 'refreshToken']
): FieldMapping[] {
    const fieldSet = new Set<string>();

    // Extract all unique field paths from data
    const extractPaths = (obj: any, prefix: string = '') => {
        if (!obj || typeof obj !== 'object') return;

        Object.keys(obj).forEach(key => {
            // Skip internal/excluded fields
            if (key.startsWith('$') || excludeFields.includes(key)) return;

            const fullPath = prefix ? `${prefix}.${key}` : key;
            const value = obj[key];

            // Check if it's a nested object (not array, not Date, not ObjectId-like)
            if (
                value !== null &&
                typeof value === 'object' &&
                !Array.isArray(value) &&
                !(value instanceof Date) &&
                !isObjectId(value)
            ) {
                extractPaths(value, fullPath);
            } else {
                fieldSet.add(fullPath);
            }
        });
    };

    data.forEach(doc => extractPaths(doc));

    // Sort fields: _id first, then alphabetically
    const sortedFields = Array.from(fieldSet).sort((a, b) => {
        if (a === '_id') return -1;
        if (b === '_id') return 1;
        return a.localeCompare(b);
    });

    return sortedFields.map(field => ({
        field,
        header: generateHeaderFromField(field),
    })).filter(f => f.header !== '');
}

// ============================================
// VALUE UTILITIES
// ============================================

/**
 * Check if a value looks like a MongoDB ObjectId
 */
function isObjectId(value: any): boolean {
    if (!value) return false;
    if (typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value)) return true;
    if (value._bsontype === 'ObjectId' || value._bsontype === 'ObjectID') return true;
    if (value.constructor?.name === 'ObjectId') return true;
    return false;
}

/**
 * Check if a value is a Buffer
 */
function isBuffer(value: any): boolean {
    if (!value) return false;
    if (Buffer.isBuffer(value)) return true;
    if (value.type === 'Buffer' && Array.isArray(value.data)) return true;
    return false;
}

/**
 * Get a nested value from an object using dot notation
 */
export function getNestedValue(obj: any, path: string): any {
    if (!obj || !path) return null;

    return path.split('.').reduce((current, key) => {
        if (current === null || current === undefined) return null;
        return current[key];
    }, obj);
}

/**
 * Format a value for CSV output
 */
export function formatValueForCSV(value: any): string {
    // Handle null/undefined
    if (value === null || value === undefined) {
        return '';
    }

    // Handle Buffer - convert to empty or hex string
    if (isBuffer(value)) {
        return ''; // Or use Buffer.from(value.data || value).toString('hex') if you need the data
    }

    // Handle ObjectId
    if (isObjectId(value)) {
        return value.toString ? value.toString() : String(value);
    }

    // Handle Date
    if (value instanceof Date) {
        return value.toISOString();
    }

    // Handle Date-like strings
    if (typeof value === 'string') {
        const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
        if (datePattern.test(value)) {
            try {
                return new Date(value).toISOString();
            } catch {
                return value;
            }
        }
        return value;
    }

    // Handle Arrays
    if (Array.isArray(value)) {
        // For arrays of objects, try to extract meaningful data
        const formatted = value.map(item => {
            if (item === null || item === undefined) return '';
            if (typeof item === 'object') {
                // Try common display fields
                if (item.name) return item.name;
                if (item.firstName && item.lastName) return `${item.firstName} ${item.lastName}`;
                if (item.title) return item.title;
                if (item.email) return item.email;
                if (isObjectId(item)) return item.toString();
                // Fallback to JSON
                return JSON.stringify(item);
            }
            return String(item);
        });
        return formatted.join('; ');
    }

    // Handle Objects
    if (typeof value === 'object') {
        // Try common display patterns
        if (value.name) return value.name;
        if (value.firstName && value.lastName) return `${value.firstName} ${value.lastName}`;
        if (value.title) return value.title;
        if (value.email) return value.email;
        if (value.displayId) return value.displayId;

        // Check for populated Mongoose reference
        if (value._id) {
            if (value.name) return value.name;
            if (value.firstName) return `${value.firstName} ${value.lastName || ''}`.trim();
            if (value.email) return value.email;
            return value._id.toString();
        }

        // Fallback to JSON (but clean it up)
        try {
            const jsonStr = JSON.stringify(value);
            // If it's a simple object, return the JSON
            if (jsonStr.length < 200) return jsonStr;
            // For large objects, just indicate it's an object
            return '[Complex Object]';
        } catch {
            return '[Object]';
        }
    }

    // Handle boolean
    if (typeof value === 'boolean') {
        return value ? 'Yes' : 'No';
    }

    // Handle number
    if (typeof value === 'number') {
        return String(value);
    }

    // Default: convert to string
    return String(value);
}

// ============================================
// CSV GENERATION
// ============================================

/**
 * Escape a value for CSV format
 */
export function escapeCSV(
    value: string,
    delimiter: string = ',',
    quoteChar: string = '"',
    alwaysQuote: boolean = false
): string {
    const needsQuoting = alwaysQuote ||
        value.includes(delimiter) ||
        value.includes(quoteChar) ||
        value.includes('\n') ||
        value.includes('\r');

    if (needsQuoting) {
        // Escape quote characters by doubling them
        const escaped = value.replace(new RegExp(quoteChar, 'g'), quoteChar + quoteChar);
        return `${quoteChar}${escaped}${quoteChar}`;
    }

    return value;
}

/**
 * Generate CSV content from data with proper headers
 */
export function generateCSV(
    data: Record<string, any>[],
    options: CSVExportOptions
): string {
    const {
        fields,
        includeBOM = true,
        delimiter = ',',
        lineEnding = '\r\n',
        quoteChar = '"',
        alwaysQuote = false,
    } = options;

    if (!data || data.length === 0) {
        // Return just headers for empty data
        const headerRow = fields.map(f =>
            escapeCSV(f.header, delimiter, quoteChar, alwaysQuote)
        ).join(delimiter);
        return includeBOM ? '\ufeff' + headerRow : headerRow;
    }

    const rows: string[] = [];

    // Header row - use the clean header names
    const headerRow = fields.map(f =>
        escapeCSV(f.header, delimiter, quoteChar, alwaysQuote)
    ).join(delimiter);
    rows.push(headerRow);

    // Data rows
    for (const row of data) {
        const values = fields.map(fieldConfig => {
            const rawValue = getNestedValue(row, fieldConfig.field);

            // Use custom formatter if provided
            if (fieldConfig.formatter) {
                const formattedValue = fieldConfig.formatter(rawValue, row);
                return escapeCSV(formattedValue, delimiter, quoteChar, alwaysQuote);
            }

            // Use default value if empty
            if ((rawValue === null || rawValue === undefined) && fieldConfig.defaultValue) {
                return escapeCSV(fieldConfig.defaultValue, delimiter, quoteChar, alwaysQuote);
            }

            // Format the value
            const formatted = formatValueForCSV(rawValue);
            return escapeCSV(formatted, delimiter, quoteChar, alwaysQuote);
        });

        rows.push(values.join(delimiter));
    }

    const content = rows.join(lineEnding);
    return includeBOM ? '\ufeff' + content : content;
}

/**
 * Quick CSV generation with auto-detected fields
 */
export function generateCSVAuto(
    data: Record<string, any>[],
    excludeFields?: string[]
): string {
    const fields = generateFieldMappingsFromData(data, excludeFields);
    return generateCSV(data, { fields });
}

// ============================================
// PREDEFINED FIELD MAPPINGS FOR COMMON MODELS
// ============================================

export const UserFieldMappings: FieldMapping[] = [
    { field: '_id', header: 'ID' },
    { field: 'displayId', header: 'Display ID' },
    { field: 'firstName', header: 'First Name' },
    { field: 'lastName', header: 'Last Name' },
    { field: 'email', header: 'Email' },
    { field: 'phone', header: 'Phone' },
    { field: 'role', header: 'Role' },
    { field: 'status', header: 'Status' },
    { field: 'clientStatus', header: 'Client Status' },
    { field: 'assignedDietitian', header: 'Primary Dietitian' },
    { field: 'assignedDietitians', header: 'All Dietitians' },
    { field: 'assignedHealthCounselor', header: 'Primary Health Counselor' },
    { field: 'assignedHealthCounselors', header: 'All Health Counselors' },
    { field: 'tags', header: 'Tags' },
    { field: 'onboardingCompleted', header: 'Onboarding Completed', formatter: v => v ? 'Yes' : 'No' },
    { field: 'startDate', header: 'Start Date', formatter: v => v ? new Date(v).toLocaleDateString() : '' },
    { field: 'endDate', header: 'End Date', formatter: v => v ? new Date(v).toLocaleDateString() : '' },
    { field: 'createdAt', header: 'Created Date', formatter: v => v ? new Date(v).toLocaleDateString() : '' },
    { field: 'lastLogin', header: 'Last Login', formatter: v => v ? new Date(v).toLocaleString() : '' },
];

export const ClientFieldMappings: FieldMapping[] = [
    { field: '_id', header: 'ID' },
    { field: 'displayId', header: 'Client ID' },
    { field: 'firstName', header: 'First Name' },
    { field: 'lastName', header: 'Last Name' },
    { field: 'email', header: 'Email' },
    { field: 'phone', header: 'Phone' },
    { field: 'clientStatus', header: 'Status' },
    { field: 'gender', header: 'Gender' },
    { field: 'dateOfBirth', header: 'Date of Birth', formatter: v => v ? new Date(v).toLocaleDateString() : '' },
    { field: 'assignedDietitian', header: 'Primary Dietitian' },
    { field: 'assignedDietitians', header: 'Secondary Dietitians' },
    { field: 'assignedHealthCounselor', header: 'Health Counselor' },
    { field: 'healthGoals', header: 'Health Goals' },
    { field: 'dietaryPreferences', header: 'Dietary Preferences' },
    { field: 'allergies', header: 'Allergies' },
    { field: 'medicalConditions', header: 'Medical Conditions' },
    { field: 'tags', header: 'Tags' },
    { field: 'startDate', header: 'Start Date', formatter: v => v ? new Date(v).toLocaleDateString() : '' },
    { field: 'endDate', header: 'End Date', formatter: v => v ? new Date(v).toLocaleDateString() : '' },
    { field: 'createdAt', header: 'Joined Date', formatter: v => v ? new Date(v).toLocaleDateString() : '' },
    { field: 'createdBy', header: 'Created By' },
];

export const PaymentFieldMappings: FieldMapping[] = [
    { field: '_id', header: 'Payment ID' },
    { field: 'orderId', header: 'Order ID' },
    { field: 'client', header: 'Client' },
    { field: 'amount', header: 'Amount', formatter: v => v ? `₹${v.toLocaleString()}` : '' },
    { field: 'currency', header: 'Currency' },
    { field: 'status', header: 'Status' },
    { field: 'paymentMethod', header: 'Payment Method' },
    { field: 'transactionId', header: 'Transaction ID' },
    { field: 'plan', header: 'Plan' },
    { field: 'createdAt', header: 'Date', formatter: v => v ? new Date(v).toLocaleString() : '' },
];

export const AppointmentFieldMappings: FieldMapping[] = [
    { field: '_id', header: 'Appointment ID' },
    { field: 'client', header: 'Client' },
    { field: 'dietitian', header: 'Dietitian' },
    { field: 'date', header: 'Date', formatter: v => v ? new Date(v).toLocaleDateString() : '' },
    { field: 'time', header: 'Time' },
    { field: 'duration', header: 'Duration (min)' },
    { field: 'type', header: 'Type' },
    { field: 'status', header: 'Status' },
    { field: 'notes', header: 'Notes' },
    { field: 'meetingLink', header: 'Meeting Link' },
    { field: 'createdAt', header: 'Created Date', formatter: v => v ? new Date(v).toLocaleString() : '' },
];

// ============================================
// EXPORT HELPER FUNCTIONS
// ============================================

/**
 * Create a downloadable CSV blob
 */
export function createCSVBlob(csvContent: string): Blob {
    return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
}

/**
 * Trigger a CSV download in the browser
 */
export function downloadCSV(csvContent: string, filename: string): void {
    const blob = createCSVBlob(csvContent);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Export data to CSV with automatic filename
 */
export function exportToCSV(
    data: Record<string, any>[],
    options: CSVExportOptions & { filename?: string }
): void {
    const csvContent = generateCSV(data, options);
    const filename = options.filename || `export_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(csvContent, filename);
}
