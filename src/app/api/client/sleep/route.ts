import { nativeHabitRoute } from '@/lib/api/native-habit-route';
import { formatInTimeZone } from 'date-fns-tz';
const format = (date: Date, pattern: string) => formatInTimeZone(date, 'Asia/Kolkata', pattern);

function buildSleepResponse(journal: any, targetDate: Date) {
    const sleepEntries = journal?.sleep || [];

    const totalHours = sleepEntries.reduce(
        (sum: number, entry: any) => sum + (entry.hours + entry.minutes / 60),
        0
    );

    const transformedAssignedSleep = journal?.assignedSleep
        ? {
            amount:
                (journal.assignedSleep.targetHours || 0) +
                (journal.assignedSleep.targetMinutes || 0) / 60,
            assignedAt: journal.assignedSleep.assignedAt,
            isCompleted: journal.assignedSleep.isCompleted || false,
            completedAt: journal.assignedSleep.completedAt,
        }
        : null;

    return {
        totalToday: totalHours,
        goal: journal?.targets?.sleep || 8,
        entries: sleepEntries
            .map((entry: any) => ({
                _id: entry._id?.toString(),
                hours: entry.hours,
                minutes: entry.minutes,
                quality: entry.quality,
                time: entry.createdAt ? format(new Date(entry.createdAt), 'h:mm a') : '',
                createdAt: entry.createdAt,
            }))
            .sort(
                (a: any, b: any) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            ),
        assignedSleep: transformedAssignedSleep,
        date: format(targetDate, 'yyyy-MM-dd'),
        // Change-detection token: updates whenever the journal document changes
        dataHash: journal?.updatedAt
            ? new Date(journal.updatedAt).toISOString()
            : 'empty',
    };
}

const handler = nativeHabitRoute('sleep', buildSleepResponse);
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
