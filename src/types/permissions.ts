// Permission keys - centralized list of all available permissions
export enum PermissionKey {
    // Client Management
    VIEW_ASSIGNED_CLIENTS = 'view_assigned_clients',
    VIEW_ALL_CLIENTS = 'view_all_clients',
    EDIT_CLIENT_PROFILE = 'edit_client_profile',
    ASSIGN_CLIENTS_TO_DIETITIANS = 'assign_clients_to_dietitians',
    ASSIGN_CLIENTS_TO_HEALTH_COUNSELORS = 'assign_clients_to_health_counselors',

    // Meal Plans
    CREATE_MEAL_PLANS = 'create_meal_plans',
    EDIT_MEAL_PLANS = 'edit_meal_plans',
    DELETE_MEAL_PLANS = 'delete_meal_plans',
    VIEW_ALL_MEAL_PLANS = 'view_all_meal_plans',

    // Recipes
    CREATE_RECIPES = 'create_recipes',
    EDIT_RECIPES = 'edit_recipes',
    DELETE_RECIPES = 'delete_recipes',
    VIEW_ALL_RECIPES = 'view_all_recipes',

    // Appointments
    CREATE_APPOINTMENTS = 'create_appointments',
    EDIT_APPOINTMENTS = 'edit_appointments',
    CANCEL_APPOINTMENTS = 'cancel_appointments',
    VIEW_ALL_APPOINTMENTS = 'view_all_appointments',

    // Payments
    CREATE_PAYMENT_LINKS = 'create_payment_links',
    VIEW_PAYMENT_HISTORY = 'view_payment_history',
    VIEW_ALL_PAYMENTS = 'view_all_payments',
    MARK_PAYMENTS_AS_PAID = 'mark_payments_as_paid',

    // Messages
    SEND_MESSAGES = 'send_messages',
    VIEW_ALL_MESSAGES = 'view_all_messages',

    // Templates
    CREATE_DIET_TEMPLATES = 'create_diet_templates',
    EDIT_DIET_TEMPLATES = 'edit_diet_templates',
    DELETE_DIET_TEMPLATES = 'delete_diet_templates',
    VIEW_ALL_DIET_TEMPLATES = 'view_all_diet_templates',

    // Notifications
    SEND_PUSH_NOTIFICATIONS = 'send_push_notifications',

    // Reports
    VIEW_ANALYTICS = 'view_analytics',
    VIEW_REVENUE_REPORTS = 'view_revenue_reports',

    // Admin
    MANAGE_USERS = 'manage_users',
    MANAGE_PERMISSIONS = 'manage_permissions',
    MANAGE_SERVICE_PLANS = 'manage_service_plans',
}

// Permission categories for UI grouping
export const PermissionCategories = {
    'Client Management': [
        PermissionKey.VIEW_ASSIGNED_CLIENTS,
        PermissionKey.VIEW_ALL_CLIENTS,
        PermissionKey.EDIT_CLIENT_PROFILE,
        PermissionKey.ASSIGN_CLIENTS_TO_DIETITIANS,
        PermissionKey.ASSIGN_CLIENTS_TO_HEALTH_COUNSELORS,
    ],
    'Meal Plans': [
        PermissionKey.CREATE_MEAL_PLANS,
        PermissionKey.EDIT_MEAL_PLANS,
        PermissionKey.DELETE_MEAL_PLANS,
        PermissionKey.VIEW_ALL_MEAL_PLANS,
    ],
    'Recipes': [
        PermissionKey.CREATE_RECIPES,
        PermissionKey.EDIT_RECIPES,
        PermissionKey.DELETE_RECIPES,
        PermissionKey.VIEW_ALL_RECIPES,
    ],
    'Appointments': [
        PermissionKey.CREATE_APPOINTMENTS,
        PermissionKey.EDIT_APPOINTMENTS,
        PermissionKey.CANCEL_APPOINTMENTS,
        PermissionKey.VIEW_ALL_APPOINTMENTS,
    ],
    'Payments': [
        PermissionKey.CREATE_PAYMENT_LINKS,
        PermissionKey.VIEW_PAYMENT_HISTORY,
        PermissionKey.VIEW_ALL_PAYMENTS,
        PermissionKey.MARK_PAYMENTS_AS_PAID,
    ],
    'Messages': [
        PermissionKey.SEND_MESSAGES,
        PermissionKey.VIEW_ALL_MESSAGES,
    ],
    'Diet Templates': [
        PermissionKey.CREATE_DIET_TEMPLATES,
        PermissionKey.EDIT_DIET_TEMPLATES,
        PermissionKey.DELETE_DIET_TEMPLATES,
        PermissionKey.VIEW_ALL_DIET_TEMPLATES,
    ],
    'Notifications': [
        PermissionKey.SEND_PUSH_NOTIFICATIONS,
    ],
    'Reports & Analytics': [
        PermissionKey.VIEW_ANALYTICS,
        PermissionKey.VIEW_REVENUE_REPORTS,
    ],
    'Administration': [
        PermissionKey.MANAGE_USERS,
        PermissionKey.MANAGE_PERMISSIONS,
        PermissionKey.MANAGE_SERVICE_PLANS,
    ],
};

// Human-readable permission names
export const PermissionLabels: Record<PermissionKey, string> = {
    [PermissionKey.VIEW_ASSIGNED_CLIENTS]: 'View Assigned Clients',
    [PermissionKey.VIEW_ALL_CLIENTS]: 'View All Clients',
    [PermissionKey.EDIT_CLIENT_PROFILE]: 'Edit Client Profile',
    [PermissionKey.ASSIGN_CLIENTS_TO_DIETITIANS]: 'Assign Clients to Dietitians',
    [PermissionKey.ASSIGN_CLIENTS_TO_HEALTH_COUNSELORS]: 'Assign Clients to Health Counselors',

    [PermissionKey.CREATE_MEAL_PLANS]: 'Create Meal Plans',
    [PermissionKey.EDIT_MEAL_PLANS]: 'Edit Meal Plans',
    [PermissionKey.DELETE_MEAL_PLANS]: 'Delete Meal Plans',
    [PermissionKey.VIEW_ALL_MEAL_PLANS]: 'View All Meal Plans',

    [PermissionKey.CREATE_RECIPES]: 'Create Recipes',
    [PermissionKey.EDIT_RECIPES]: 'Edit Recipes',
    [PermissionKey.DELETE_RECIPES]: 'Delete Recipes',
    [PermissionKey.VIEW_ALL_RECIPES]: 'View All Recipes',

    [PermissionKey.CREATE_APPOINTMENTS]: 'Create Appointments',
    [PermissionKey.EDIT_APPOINTMENTS]: 'Edit Appointments',
    [PermissionKey.CANCEL_APPOINTMENTS]: 'Cancel Appointments',
    [PermissionKey.VIEW_ALL_APPOINTMENTS]: 'View All Appointments',

    [PermissionKey.CREATE_PAYMENT_LINKS]: 'Create Payment Links',
    [PermissionKey.VIEW_PAYMENT_HISTORY]: 'View Payment History',
    [PermissionKey.VIEW_ALL_PAYMENTS]: 'View All Payments',
    [PermissionKey.MARK_PAYMENTS_AS_PAID]: 'Mark Payments as Paid',

    [PermissionKey.SEND_MESSAGES]: 'Send Messages',
    [PermissionKey.VIEW_ALL_MESSAGES]: 'View All Messages',

    [PermissionKey.CREATE_DIET_TEMPLATES]: 'Create Diet Templates',
    [PermissionKey.EDIT_DIET_TEMPLATES]: 'Edit Diet Templates',
    [PermissionKey.DELETE_DIET_TEMPLATES]: 'Delete Diet Templates',
    [PermissionKey.VIEW_ALL_DIET_TEMPLATES]: 'View All Diet Templates',

    [PermissionKey.SEND_PUSH_NOTIFICATIONS]: 'Send Push Notifications',

    [PermissionKey.VIEW_ANALYTICS]: 'View Analytics',
    [PermissionKey.VIEW_REVENUE_REPORTS]: 'View Revenue Reports',

    [PermissionKey.MANAGE_USERS]: 'Manage Users',
    [PermissionKey.MANAGE_PERMISSIONS]: 'Manage Permissions',
    [PermissionKey.MANAGE_SERVICE_PLANS]: 'Manage Service Plans',
};

// Permission descriptions for tooltips
export const PermissionDescriptions: Record<PermissionKey, string> = {
    [PermissionKey.VIEW_ASSIGNED_CLIENTS]: 'View clients assigned to them',
    [PermissionKey.VIEW_ALL_CLIENTS]: 'View all clients in the system',
    [PermissionKey.EDIT_CLIENT_PROFILE]: 'Edit client profile information',
    [PermissionKey.ASSIGN_CLIENTS_TO_DIETITIANS]: 'Assign clients to dietitians',
    [PermissionKey.ASSIGN_CLIENTS_TO_HEALTH_COUNSELORS]: 'Assign clients to health counselors',

    [PermissionKey.CREATE_MEAL_PLANS]: 'Create new meal plans for clients',
    [PermissionKey.EDIT_MEAL_PLANS]: 'Edit existing meal plans',
    [PermissionKey.DELETE_MEAL_PLANS]: 'Delete meal plans',
    [PermissionKey.VIEW_ALL_MEAL_PLANS]: 'View all meal plans in the system',

    [PermissionKey.CREATE_RECIPES]: 'Create new recipes',
    [PermissionKey.EDIT_RECIPES]: 'Edit existing recipes',
    [PermissionKey.DELETE_RECIPES]: 'Delete recipes',
    [PermissionKey.VIEW_ALL_RECIPES]: 'View all recipes including private ones',

    [PermissionKey.CREATE_APPOINTMENTS]: 'Create appointments for clients',
    [PermissionKey.EDIT_APPOINTMENTS]: 'Edit appointment details',
    [PermissionKey.CANCEL_APPOINTMENTS]: 'Cancel scheduled appointments',
    [PermissionKey.VIEW_ALL_APPOINTMENTS]: 'View all appointments in the system',

    [PermissionKey.CREATE_PAYMENT_LINKS]: 'Generate payment links for clients',
    [PermissionKey.VIEW_PAYMENT_HISTORY]: 'View payment history of assigned clients',
    [PermissionKey.VIEW_ALL_PAYMENTS]: 'View all payments in the system',
    [PermissionKey.MARK_PAYMENTS_AS_PAID]: 'Manually mark payments as paid',

    [PermissionKey.SEND_MESSAGES]: 'Send messages to clients',
    [PermissionKey.VIEW_ALL_MESSAGES]: 'View all message conversations',

    [PermissionKey.CREATE_DIET_TEMPLATES]: 'Create reusable diet templates',
    [PermissionKey.EDIT_DIET_TEMPLATES]: 'Edit diet templates',
    [PermissionKey.DELETE_DIET_TEMPLATES]: 'Delete diet templates',
    [PermissionKey.VIEW_ALL_DIET_TEMPLATES]: 'View all diet templates including others\' private ones',

    [PermissionKey.SEND_PUSH_NOTIFICATIONS]: 'Send push notifications to clients',

    [PermissionKey.VIEW_ANALYTICS]: 'View system analytics and dashboards',
    [PermissionKey.VIEW_REVENUE_REPORTS]: 'View revenue and financial reports',

    [PermissionKey.MANAGE_USERS]: 'Create, edit, and delete users',
    [PermissionKey.MANAGE_PERMISSIONS]: 'Manage user permissions',
    [PermissionKey.MANAGE_SERVICE_PLANS]: 'Manage service plans and pricing',
};
