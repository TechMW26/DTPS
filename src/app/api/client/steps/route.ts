import { nativeHabitRoute } from '@/lib/api/native-habit-route';
import { formatInTimeZone } from 'date-fns-tz';
const format = (date: Date, pattern: string) => formatInTimeZone(date, 'Asia/Kolkata', pattern);

function buildStepsResponse(journal: any, targetDate: Date) {
    const stepsEntries = journal?.steps || [];
    const totalSteps = stepsEntries.reduce(
        (sum: number, entry: any) => sum + (entry.steps || 0),
        0
    );

    const transformedAssignedSteps = journal?.assignedSteps
        ? {
            amount: journal.assignedSteps.target || 0,
            assignedAt: journal.assignedSteps.assignedAt,
            isCompleted: journal.assignedSteps.isCompleted || false,
            completedAt: journal.assignedSteps.completedAt,
        }
        : null;

    return {
        totalToday: totalSteps,
        goal: journal?.targets?.steps || 10000,
        entries: stepsEntries
            .map((entry: any) => ({
                _id: entry._id?.toString(),
                steps: entry.steps,
                distance: entry.distance,
                calories: entry.calories,
                time: entry.createdAt ? format(new Date(entry.createdAt), 'h:mm a') : '',
                createdAt: entry.createdAt,
            }))
            .sort(
                (a: any, b: any) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            ),
        assignedSteps: transformedAssignedSteps,
        date: format(targetDate, 'yyyy-MM-dd'),
        // Change-detection token: updates whenever the journal document changes
        dataHash: journal?.updatedAt
            ? new Date(journal.updatedAt).toISOString()
            : 'empty',
    };
}

const handler = nativeHabitRoute('steps', buildStepsResponse);
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
