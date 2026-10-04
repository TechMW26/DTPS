import {nativeResponseJson} from '@/lib/api/native-response';
import { getNativeDatabase } from '@/lib/db/firestore-native';
import { nativeTaskJournal, completeNativeTask } from '@/lib/db/repository/native-client-tasks';
import {nativeHabitDay} from '@/lib/db/repository/native-habits';
import { taskDateError } from '@/lib/task-schedule';
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// GET - Get all assigned tasks for a date
export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return nativeResponseJson({ error: "Unauthorized" }, { status: 401 });
        }

        if (session.user.role !== 'client') return nativeResponseJson({error:'Forbidden'},{status:403});

        // Get date from query params
        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');

        // Get date range
        let day;try{day=nativeHabitDay(dateParam);}catch{return nativeResponseJson({error:'Invalid date'},{status:400});}
        const targetDate=day.start,nextDay=day.end;

        // Get today's journal
        const journal = await nativeTaskJournal(getNativeDatabase(),session.user.id,targetDate,nextDay);

        // Calculate current steps
        const currentSteps = journal?.steps?.reduce((sum: number, entry: any) => sum + entry.steps, 0) || 0;

        // Calculate current sleep
        const currentSleepMinutes = journal?.sleep?.reduce((sum: number, entry: any) =>
            sum + (entry.hours * 60) + (entry.minutes || 0), 0) || 0;
        const currentSleepHours = Math.floor(currentSleepMinutes / 60);
        const currentSleepMins = currentSleepMinutes % 60;

        // Calculate current water intake
        const currentWater = journal?.water?.reduce((sum: number, entry: any) => {
            const unitToMl: Record<string, number> = {
                'Glass (250ml)': 250,
                'Bottle (500ml)': 500,
                'Bottle (1L)': 1000,
                'Cup (200ml)': 200,
                'glasses': 250,
                'ml': 1
            };
            return sum + (entry.amount * (unitToMl[entry.unit] || 1));
        }, 0) || 0;

        // Calculate current activity minutes
        const currentActivityMinutes = journal?.activities?.reduce((sum: number, entry: any) =>
            sum + (entry.duration || 0), 0) || 0;

        // Format assigned activities
        const assignedActivities = journal?.assignedActivities?.activities?.map((activity: any, index: number) => ({
            _id: `activity-${index}`,
            name: activity.name,
            sets: activity.sets || 0,
            reps: activity.reps || 0,
            duration: activity.duration || 0,
            videoLink: activity.videoLink || '',
            completed: activity.completed || false,
            completedAt: activity.completedAt
        })) || [];

        // Generate data hash for change detection (based on updatedAt)
        const dataHash = journal?.updatedAt || 'no-data';

        return nativeResponseJson({
            // Assigned Water
            water: journal?.assignedWater?.amount ? {
                amount: journal.assignedWater.amount,
                assignedAt: journal.assignedWater.assignedAt,
                isCompleted: journal.assignedWater.isCompleted || currentWater >= journal.assignedWater.amount,
                completedAt: journal.assignedWater.completedAt,
                currentIntake: currentWater
            } : null,

            // Assigned Steps
            steps: journal?.assignedSteps?.target ? {
                target: journal.assignedSteps.target,
                current: currentSteps,
                assignedAt: journal.assignedSteps.assignedAt,
                isCompleted: journal.assignedSteps.isCompleted || currentSteps >= journal.assignedSteps.target,
                completedAt: journal.assignedSteps.completedAt
            } : null,

            // Assigned Sleep
            sleep: (journal?.assignedSleep?.targetHours || journal?.assignedSleep?.targetMinutes) ? {
                targetHours: journal.assignedSleep.targetHours,
                targetMinutes: journal.assignedSleep.targetMinutes || 0,
                currentHours: currentSleepHours,
                currentMinutes: currentSleepMins,
                assignedAt: journal.assignedSleep.assignedAt,
                isCompleted: journal.assignedSleep.isCompleted || (currentSleepMinutes >= (journal.assignedSleep.targetHours * 60 + (journal.assignedSleep.targetMinutes || 0))),
                completedAt: journal.assignedSleep.completedAt
            } : null,

            // Assigned Activities
            activities: assignedActivities,
            activitiesAssignedAt: journal?.assignedActivities?.assignedAt || null,
            allActivitiesCompleted: assignedActivities.length > 0 ? assignedActivities.every((a: any) => a.completed) : false,

            // Current logged data (for display)
            currentData: {
                water: currentWater,
                steps: currentSteps,
                sleepHours: currentSleepHours,
                sleepMinutes: currentSleepMins,
                activityMinutes: currentActivityMinutes
            },

            date: targetDate.toISOString(),
            dataHash
        });
    } catch (error) {
        console.error("Error fetching tasks:", error);
        return nativeResponseJson({ error: "Failed to fetch tasks" }, { status: 500 });
    }
}

// PATCH - Complete a task, using an atomic update for concurrent activity check-offs.
export async function PATCH(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return nativeResponseJson({error:'Unauthorized'},{status:401});
        if (session.user.role !== 'client') return nativeResponseJson({error:'Forbidden'},{status:403});
        let data;try {data=await request.json();}catch{return nativeResponseJson({error:'Invalid request'},{status:400});}
        if (!data || data.action !== 'complete') return nativeResponseJson({error:'Invalid action'},{status:400});
        if (data.date !== undefined && typeof data.date !== 'string') return nativeResponseJson({error:'Invalid date'},{status:400});
        const dateError=taskDateError(data.date);
        if(dateError)return nativeResponseJson({error:dateError},{status:400});
        if(!['water','steps','sleep','activity'].includes(data.taskType))return nativeResponseJson({error:'Invalid task type'},{status:400});
        const index=typeof data.taskId==='string' && /^activity-\d+$/.test(data.taskId)?Number(data.taskId.slice(9)):data.taskIndex;
        if(data.taskType==='activity'&&(!Number.isSafeInteger(index)||index<0))return nativeResponseJson({error:'Activity index required'},{status:400});
        const completed=await completeNativeTask(getNativeDatabase(),session.user.id,data.date,data.taskType,index);
        if(!completed)return nativeResponseJson({error:'Assigned task not found'},{status:404});
        return nativeResponseJson({success:true,message:`${data.taskType} task marked as complete`});
    }catch{return nativeResponseJson({error:'Failed to complete task'},{status:500});}
}
