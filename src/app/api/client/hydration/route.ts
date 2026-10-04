import { nativeHabitRoute } from '@/lib/api/native-habit-route';
const UNIT_TO_ML: Record<string, number> = {
  'Glass (250ml)': 250,
  'Bottle (500ml)': 500,
  'Bottle (1L)': 1000,
  'Cup (200ml)': 200,
  'glasses': 250,
  'ml': 1,
};

const toMl = (amount: number, unit: string) => amount * (UNIT_TO_ML[unit] ?? 1);


function buildHydrationResponse(journal: any, targetDate: Date, waterGoal: number = 2500) {
  const waterList = journal?.water || [];

  const totalToday = waterList.reduce(
    (sum: number, entry: any) => sum + toMl(entry.amount, entry.unit),
    0
  );

  const entries = waterList
    .map((entry: any) => ({
      _id: entry._id.toString(),
      amount: toMl(entry.amount, entry.unit),
      unit: 'ml',
      type: entry.type || 'water',
      time: entry.time,
      createdAt: entry.createdAt,
    }))
    .sort(
      (a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  return {
    totalToday,
    goal: waterGoal,
    entries,
    date: targetDate.toISOString(),
    assignedWater: journal?.assignedWater
      ? {
        amount: journal.assignedWater.amount || 0,
        assignedAt: journal.assignedWater.assignedAt,
        isCompleted: journal.assignedWater.isCompleted || false,
        completedAt: journal.assignedWater.completedAt,
      }
      : null,
    // Change-detection token: updates whenever the journal document changes
    dataHash: journal?.updatedAt
      ? new Date(journal.updatedAt).toISOString()
      : 'no-data',
  };
}

const handler = nativeHabitRoute('water', buildHydrationResponse);
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
