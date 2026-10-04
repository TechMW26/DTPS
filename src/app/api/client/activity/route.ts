import { nativeHabitRoute } from '@/lib/api/native-habit-route';
import { formatInTimeZone } from 'date-fns-tz';
const format = (date: Date, pattern: string) => formatInTimeZone(date, 'Asia/Kolkata', pattern);

function buildActivityResponse(journal: any, targetDate: Date) {
    const activityEntries = journal?.activities || [];
    const totalMinutes = activityEntries.reduce(
        (sum: number, entry: any) => sum + (entry.duration || 0),
        0
    );

    const assignedActivitiesList = journal?.assignedActivities?.activities || [];
    const transformedAssignedActivity = journal?.assignedActivities
        ? {
            amount: assignedActivitiesList.reduce(
                (sum: number, act: any) => sum + (act.duration || 0),
                0
            ) || 0,
            activityCount: assignedActivitiesList.length,
            unit: 'minutes',
            assignedAt: journal.assignedActivities.assignedAt,
            isCompleted: journal.assignedActivities.isCompleted || false,
            completedAt: journal.assignedActivities.completedAt,
            activities: assignedActivitiesList,
        }
        : null;

    return {
        totalToday: totalMinutes,
        goal: journal?.targets?.activityMinutes || 30,
        entries: activityEntries
            .map((entry: any) => ({
                _id: entry._id?.toString(),
                name: entry.name,
                duration: entry.duration,
                sets: entry.sets,
                reps: entry.reps,
                intensity: entry.intensity || 'moderate',
                videoLink: entry.videoLink,
                completed: entry.completed,
                completedAt: entry.completedAt,
                time: entry.createdAt ? format(new Date(entry.createdAt), 'h:mm a') : '',
                createdAt: entry.createdAt,
            }))
            .sort(
                (a: any, b: any) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            ),
        assignedActivity: transformedAssignedActivity,
        date: format(targetDate, 'yyyy-MM-dd'),
        // Change-detection token: updates whenever the journal document changes
        dataHash: journal?.updatedAt
            ? new Date(journal.updatedAt).toISOString()
            : 'empty',
    };
}

const handler = nativeHabitRoute('activities', buildActivityResponse);
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
