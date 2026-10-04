export interface IActivityLog {
  _id: string;
  userId: string;
  userRole: 'admin' | 'dietitian' | 'health_counselor' | 'client';
  userName: string;
  userEmail?: string;
  userPhone?: string;
  action: string;
  actionType: 'create' | 'update' | 'delete' | 'view' | 'assign' | 'complete' | 'cancel' | 'payment' | 'login' | 'logout' | 'other';
  category: 'meal_plan' | 'diet_plan' | 'appointment' | 'payment' | 'task' | 'note' | 'document' | 'profile' | 'client_assignment' | 'recipe' | 'fitness' | 'message' | 'subscription' | 'auth' | 'system' | 'other';
  description: string;
  targetUserId?: string;
  targetUserName?: string;
  resourceId?: string;
  resourceType?: string;
  resourceName?: string;
  details?: Record<string, any>;
  changeDetails?: {
    fieldName: string;
    oldValue: any;
    newValue: any;
  }[];
  ipAddress?: string;
  userAgent?: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISystemAlert {
  _id: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'critical';
  source: 'database' | 'api' | 'auth' | 'payment' | 'email' | 'file' | 'system' | 'user_action' | 'cron' | 'integration';
  message: string;
  title?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'database_error' | 'api_error' | 'auth_failure' | 'payment_failure' | 'email_failure' | 'validation_error' | 'performance' | 'security' | 'maintenance' | 'other';
  status: 'new' | 'acknowledged' | 'resolved' | 'ignored';
  details?: Record<string, any>;
  errorStack?: string;
  affectedResource?: string;
  affectedResourceId?: string;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolution?: string;
  createdBy?: string;
  notificationSent: boolean;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}
