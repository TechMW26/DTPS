import ActivityLog, { IActivityLog } from '@/lib/db/models/ActivityLog';
import SystemAlert, { ISystemAlert } from '@/lib/db/models/SystemAlert';
import connectDB from '@/lib/db/connection';

// Activity Log Types
type ActivityActionType = IActivityLog['actionType'];
type ActivityCategory = IActivityLog['category'];
type UserRole = IActivityLog['userRole'];

// System Alert Types
type AlertType = ISystemAlert['type'];
type AlertSource = ISystemAlert['source'];
type AlertPriority = ISystemAlert['priority'];
type AlertCategory = ISystemAlert['category'];

interface LogActivityParams {
  userId: string;
  userRole: UserRole;
  userName: string;
  userEmail?: string;
  userPhone?: string;
  action: string;
  actionType: ActivityActionType;
  category: ActivityCategory;
  description: string;
  targetUserId?: string;
  targetUserName?: string;
  resourceId?: string;
  resourceType?: string;
  resourceName?: string;
  details?: Record<string, any>;
  changeDetails?: { fieldName: string; oldValue: any; newValue: any }[];
  ipAddress?: string;
  userAgent?: string;
}

interface CreateSystemAlertParams {
  type: AlertType;
  source: AlertSource;
  message: string;
  title?: string;
  priority?: AlertPriority;
  category?: AlertCategory;
  details?: Record<string, any>;
  errorStack?: string;
  affectedResource?: string;
  affectedResourceId?: string;
  createdBy?: string;
}

/**
 * Log a user activity
 */
export async function logActivity(params: LogActivityParams): Promise<IActivityLog | null> {
  try {
    await connectDB();

    const activity = await ActivityLog.create({
      userId: params.userId,
      userRole: params.userRole,
      userName: params.userName,
      userEmail: params.userEmail,
      userPhone: params.userPhone,
      action: params.action,
      actionType: params.actionType,
      category: params.category,
      description: params.description,
      targetUserId: params.targetUserId,
      targetUserName: params.targetUserName,
      resourceId: params.resourceId,
      resourceType: params.resourceType,
      resourceName: params.resourceName,
      details: params.details,
      changeDetails: params.changeDetails,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      isRead: false
    });

    return activity;
  } catch (error) {
    console.error('Error logging activity:', error);
    // Create a system alert for the logging failure
    await createSystemAlert({
      type: 'error',
      source: 'system',
      message: `Failed to log activity: ${params.action}`,
      priority: 'low',
      category: 'other',
      details: { originalActivity: params, error: String(error) }
    });
    return null;
  }
}

/**
 * Create a system alert
 */
export async function createSystemAlert(params: CreateSystemAlertParams): Promise<ISystemAlert | null> {
  try {
    await connectDB();

    const alert = await SystemAlert.create({
      type: params.type,
      source: params.source,
      message: params.message,
      title: params.title,
      priority: params.priority || 'medium',
      category: params.category || 'other',
      status: 'new',
      details: params.details,
      errorStack: params.errorStack,
      affectedResource: params.affectedResource,
      affectedResourceId: params.affectedResourceId,
      createdBy: params.createdBy,
      notificationSent: false,
      isRead: false
    });

    return alert;
  } catch (error) {
    console.error('Error creating system alert:', error);
    return null;
  }
}

/**
 * Log a database error
 */
export async function logDatabaseError(
  operation: string,
  error: any,
  details?: Record<string, any>
): Promise<void> {
  await createSystemAlert({
    type: 'error',
    source: 'database',
    title: `Database Error: ${operation}`,
    message: error?.message || String(error),
    priority: 'high',
    category: 'database_error',
    errorStack: error?.stack,
    details: {
      operation,
      ...details
    }
  });
}

/**
 * Log an API error
 */
export async function logApiError(
  endpoint: string,
  method: string,
  error: any,
  statusCode?: number,
  details?: Record<string, any>
): Promise<void> {
  await createSystemAlert({
    type: 'error',
    source: 'api',
    title: `API Error: ${method} ${endpoint}`,
    message: error?.message || String(error),
    priority: statusCode && statusCode >= 500 ? 'high' : 'medium',
    category: 'api_error',
    errorStack: error?.stack,
    details: {
      endpoint,
      method,
      statusCode,
      ...details
    }
  });
}

/**
 * Log a payment failure
 */
export async function logPaymentFailure(
  paymentId: string,
  error: any,
  userId?: string,
  amount?: number,
  details?: Record<string, any>
): Promise<void> {
  await createSystemAlert({
    type: 'error',
    source: 'payment',
    title: 'Payment Failed',
    message: error?.message || String(error),
    priority: 'high',
    category: 'payment_failure',
    affectedResource: 'Payment',
    affectedResourceId: paymentId,
    errorStack: error?.stack,
    details: {
      paymentId,
      userId,
      amount,
      ...details
    }
  });
}

/**
 * Log an email failure
 */
export async function logEmailFailure(
  recipient: string,
  subject: string,
  error: any,
  details?: Record<string, any>
): Promise<void> {
  await createSystemAlert({
    type: 'warning',
    source: 'email',
    title: 'Email Delivery Failed',
    message: error?.message || String(error),
    priority: 'medium',
    category: 'email_failure',
    errorStack: error?.stack,
    details: {
      recipient,
      subject,
      ...details
    }
  });
}

/**
 * Log an auth failure (suspicious login attempts, etc.)
 */
export async function logAuthFailure(
  email: string,
  reason: string,
  ipAddress?: string,
  details?: Record<string, any>
): Promise<void> {
  await createSystemAlert({
    type: 'warning',
    source: 'auth',
    title: 'Authentication Failure',
    message: `Auth failed for ${email}: ${reason}`,
    priority: 'medium',
    category: 'auth_failure',
    details: {
      email,
      reason,
      ipAddress,
      ...details
    }
  });
}

/**
 * Log a security event
 */
export async function logSecurityEvent(
  title: string,
  message: string,
  priority: AlertPriority = 'high',
  details?: Record<string, any>
): Promise<void> {
  await createSystemAlert({
    type: 'critical',
    source: 'system',
    title,
    message,
    priority,
    category: 'security',
    details
  });
}

/**
 * Log system maintenance event
 */
export async function logMaintenanceEvent(
  title: string,
  message: string,
  details?: Record<string, any>
): Promise<void> {
  await createSystemAlert({
    type: 'info',
    source: 'system',
    title,
    message,
    priority: 'low',
    category: 'maintenance',
    details
  });
}

// Activity helper functions for common actions
export const ActivityHelpers = {
  // Meal Plan Activities
  async mealPlanCreated(user: { id: string; role: UserRole; name: string; email: string }, clientName: string, planName: string, planId: string) {
    return logActivity({
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      userEmail: user.email,
      action: 'Created Meal Plan',
      actionType: 'create',
      category: 'meal_plan',
      description: `Created meal plan "${planName}" for ${clientName}`,
      resourceId: planId,
      resourceType: 'MealPlan',
      resourceName: planName,
      targetUserName: clientName
    });
  },

  async mealPlanAssigned(user: { id: string; role: UserRole; name: string; email: string }, clientId: string, clientName: string, planName: string, planId: string) {
    return logActivity({
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      userEmail: user.email,
      action: 'Assigned Meal Plan',
      actionType: 'assign',
      category: 'meal_plan',
      description: `Assigned meal plan "${planName}" to ${clientName}`,
      targetUserId: clientId,
      targetUserName: clientName,
      resourceId: planId,
      resourceType: 'MealPlan',
      resourceName: planName
    });
  },

  // Diet Plan Activities
  async dietPlanCreated(user: { id: string; role: UserRole; name: string; email: string }, clientName: string, planName: string, planId: string) {
    return logActivity({
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      userEmail: user.email,
      action: 'Created Diet Plan',
      actionType: 'create',
      category: 'diet_plan',
      description: `Created diet plan "${planName}" for ${clientName}`,
      resourceId: planId,
      resourceType: 'DietPlan',
      resourceName: planName,
      targetUserName: clientName
    });
  },

  // Payment Activities
  async paymentCreated(user: { id: string; role: UserRole; name: string; email: string }, clientId: string, clientName: string, amount: number, paymentId: string) {
    return logActivity({
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      userEmail: user.email,
      action: 'Created Payment',
      actionType: 'payment',
      category: 'payment',
      description: `Created payment of ₹${amount} for ${clientName}`,
      targetUserId: clientId,
      targetUserName: clientName,
      resourceId: paymentId,
      resourceType: 'Payment',
      details: { amount }
    });
  },

  async paymentReceived(user: { id: string; role: UserRole; name: string; email: string }, clientId: string, clientName: string, amount: number, paymentId: string) {
    return logActivity({
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      userEmail: user.email,
      action: 'Payment Received',
      actionType: 'payment',
      category: 'payment',
      description: `Received payment of ₹${amount} from ${clientName}`,
      targetUserId: clientId,
      targetUserName: clientName,
      resourceId: paymentId,
      resourceType: 'Payment',
      details: { amount }
    });
  },

  // Appointment Activities
  async appointmentBooked(user: { id: string; role: UserRole; name: string; email: string }, dietitianName: string, date: string, appointmentId: string) {
    return logActivity({
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      userEmail: user.email,
      action: 'Booked Appointment',
      actionType: 'create',
      category: 'appointment',
      description: `Booked appointment with ${dietitianName} on ${date}`,
      targetUserName: dietitianName,
      resourceId: appointmentId,
      resourceType: 'Appointment',
      details: { date }
    });
  },

  async appointmentCompleted(user: { id: string; role: UserRole; name: string; email: string }, clientName: string, appointmentId: string) {
    return logActivity({
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      userEmail: user.email,
      action: 'Completed Appointment',
      actionType: 'complete',
      category: 'appointment',
      description: `Completed appointment with ${clientName}`,
      targetUserName: clientName,
      resourceId: appointmentId,
      resourceType: 'Appointment'
    });
  },

  async appointmentCancelled(user: { id: string; role: UserRole; name: string; email: string }, otherPartyName: string, appointmentId: string, reason?: string) {
    return logActivity({
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      userEmail: user.email,
      action: 'Cancelled Appointment',
      actionType: 'cancel',
      category: 'appointment',
      description: `Cancelled appointment with ${otherPartyName}${reason ? `: ${reason}` : ''}`,
      targetUserName: otherPartyName,
      resourceId: appointmentId,
      resourceType: 'Appointment',
      details: { reason }
    });
  },

  // Task Activities
  async taskCreated(user: { id: string; role: UserRole; name: string; email: string }, taskTitle: string, taskId: string, assigneeName?: string) {
    return logActivity({
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      userEmail: user.email,
      action: 'Created Task',
      actionType: 'create',
      category: 'task',
      description: `Created task "${taskTitle}"${assigneeName ? ` for ${assigneeName}` : ''}`,
      targetUserName: assigneeName,
      resourceId: taskId,
      resourceType: 'Task',
      resourceName: taskTitle
    });
  },

  async taskCompleted(user: { id: string; role: UserRole; name: string; email: string }, taskTitle: string, taskId: string) {
    return logActivity({
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      userEmail: user.email,
      action: 'Completed Task',
      actionType: 'complete',
      category: 'task',
      description: `Completed task "${taskTitle}"`,
      resourceId: taskId,
      resourceType: 'Task',
      resourceName: taskTitle
    });
  },

  // Client Assignment Activities
  async clientAssigned(user: { id: string; role: UserRole; name: string; email: string }, clientId: string, clientName: string, dietitianId: string, dietitianName: string) {
    return logActivity({
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      userEmail: user.email,
      action: 'Assigned Client',
      actionType: 'assign',
      category: 'client_assignment',
      description: `Assigned ${clientName} to ${dietitianName}`,
      targetUserId: clientId,
      targetUserName: clientName,
      details: { dietitianId, dietitianName }
    });
  },

  // Note Activities
  async noteAdded(user: { id: string; role: UserRole; name: string; email: string }, clientId: string, clientName: string, noteType: string) {
    return logActivity({
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      userEmail: user.email,
      action: 'Added Note',
      actionType: 'create',
      category: 'note',
      description: `Added ${noteType} note for ${clientName}`,
      targetUserId: clientId,
      targetUserName: clientName,
      details: { noteType }
    });
  },

  // Profile Activities
  async profileUpdated(user: { id: string; role: UserRole; name: string; email: string }, targetUserId?: string, targetUserName?: string, changes?: { fieldName: string; oldValue: any; newValue: any }[]) {
    return logActivity({
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      userEmail: user.email,
      action: 'Updated Profile',
      actionType: 'update',
      category: 'profile',
      description: targetUserName ? `Updated profile for ${targetUserName}` : 'Updated own profile',
      targetUserId,
      targetUserName,
      changeDetails: changes
    });
  },

  // Document Activities
  async documentUploaded(user: { id: string; role: UserRole; name: string; email: string }, documentName: string, documentId: string, clientName?: string) {
    return logActivity({
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      userEmail: user.email,
      action: 'Uploaded Document',
      actionType: 'create',
      category: 'document',
      description: `Uploaded document "${documentName}"${clientName ? ` for ${clientName}` : ''}`,
      targetUserName: clientName,
      resourceId: documentId,
      resourceType: 'Document',
      resourceName: documentName
    });
  },

  // Auth Activities
  async userLoggedIn(user: { id: string; role: UserRole; name: string; email: string }, ipAddress?: string, userAgent?: string) {
    return logActivity({
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      userEmail: user.email,
      action: 'Logged In',
      actionType: 'login',
      category: 'auth',
      description: `${user.name} logged in`,
      ipAddress,
      userAgent
    });
  },

  async userLoggedOut(user: { id: string; role: UserRole; name: string; email: string }) {
    return logActivity({
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      userEmail: user.email,
      action: 'Logged Out',
      actionType: 'logout',
      category: 'auth',
      description: `${user.name} logged out`
    });
  }
};
