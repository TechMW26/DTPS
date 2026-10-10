import type * as MongoTypes from '@/lib/db/mongo-types';
import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';
import {formatInTimeZone,fromZonedTime} from 'date-fns-tz';
import {isValidMealTimeZone,TASK_TIME_ZONE} from '@/lib/task-schedule';
import {nativeDates} from './native-plan-editor';
import {nativeAppointmentActor} from './native-staff-appointments';
import {NativeStaffClientError} from './native-staff-client';
import {hydrateNativeDocument} from '@/lib/storage/native-document';
export async function nativeClientDashboard(db:MongoDatabase,userId:string){
 const actor=await nativeAppointmentActor(db,userId);if(actor.get('role')!=='client')throw new NativeStaffClientError('Client access required',403);
 const raw=actor.data()!,user:DocumentData={firstName:raw.firstName,lastName:raw.lastName,email:raw.email,goals:raw.goals};
 const zone=isValidMealTimeZone(raw.timezone)?raw.timezone:TASK_TIME_ZONE,dateKey=formatInTimeZone(new Date(),zone,'yyyy-MM-dd'),today=fromZonedTime(dateKey+'T00:00:00',zone),tomorrowKey=new Date(Date.parse(dateKey+'T12:00:00Z')+86400000).toISOString().slice(0,10),endOfDay=fromZonedTime(tomorrowKey+'T00:00:00',zone);
 const weights=db.collection('progressentries').where('user','==',userId).where('type','==','weight');
 const [food,latest,week,first,logs,appointments,tracking]=await Promise.all([
 db.collection('foodlogs').where('client','==',userId).where('date','>=',today).where('date','<',endOfDay).select('totalNutrition').limit(1).get(),
 weights.orderBy('recordedAt','desc').limit(1).get(),weights.where('recordedAt','<=',new Date(today.getTime()-7*86400000)).orderBy('recordedAt','desc').limit(1).get(),weights.orderBy('recordedAt','asc').limit(1).get(),
 db.collection('foodlogs').where('client','==',userId).where('date','>=',new Date(today.getTime()-366*86400000)).where('date','<',endOfDay).select('date').get(),
 db.collection('appointments').where('client','==',userId).where('status','in',['scheduled','confirmed','rescheduled']).where('scheduledAt','>=',new Date()).orderBy('scheduledAt').limit(1).get(),
 db.collection('dailytrackings').where('client','==',userId).where('date','>=',today).where('date','<',endOfDay).limit(1).get()]);
 const one=(s:MongoTypes.QuerySnapshot)=>s.docs[0]?nativeDates(s.docs[0].data()):null,todayFoodLog=one(food),latestWeight=one(latest),weekAgoWeight=one(week),firstWeight=one(first),nextAppointment=one(appointments);if(nextAppointment)nextAppointment._id=appointments.docs[0].id;
 const references=[raw.assignedDietitian,nextAppointment?.dietitian].filter(v=>typeof v==='string'&&/^[a-f0-9]{24}$/.test(v));const map=new Map();if(references.length)for(const d of await db.getAll(...[...new Set(references)].map(id=>db.collection('users').doc(id)),{fieldMask:['firstName','lastName','email','avatar','bio','experience','specializations']}))if(d.exists)map.set(d.id,{_id:d.id,...await hydrateNativeDocument(d.data()!)});user.assignedDietitian=map.get(raw.assignedDietitian)||null;if(nextAppointment)nextAppointment.dietitian=map.get(nextAppointment.dietitian)||null;
 const days=new Set(logs.docs.map(d=>formatInTimeZone(nativeDates(d.data()).date,zone,'yyyy-MM-dd')));let streak=0;for(let i=0;i<=365;i++){const key=new Date(Date.parse(dateKey+'T12:00:00Z')-i*86400000).toISOString().slice(0,10);if(!days.has(key))break;streak++;}
    // Derived calculations
    const todayTotals = todayFoodLog?.totalNutrition ? {
      calories: todayFoodLog.totalNutrition.calories || 0,
      protein: todayFoodLog.totalNutrition.protein || 0,
      carbs: todayFoodLog.totalNutrition.carbs || 0,
      fat: todayFoodLog.totalNutrition.fat || 0
    } : { calories: 0, protein: 0, carbs: 0, fat: 0 };

    const weightChange = latestWeight && weekAgoWeight
      ? (latestWeight.value - weekAgoWeight.value).toFixed(1)
      : '0.0';

    // Get user's goals (default values if not set)
    const goals = user?.goals || {
      calories: 1800,
      protein: 120,
      carbs: 200,
      fat: 60,
      water: 8,
      steps: 10000,
      targetWeight: latestWeight ? latestWeight.value - 5 : 65
    };

 const existing=one(tracking),dailyTracking={water:existing?.water||{glasses:0,target:goals.water||8},steps:existing?.steps||{count:0,target:goals.steps||10000},sleep:existing?.sleep||{hours:0,target:8}};
    return {
      user: {
        firstName: user?.firstName || undefined || 'User',
        lastName: user?.lastName || '',
        email: user?.email || undefined
      },
      assignedDietitian: user?.assignedDietitian ? {
        _id: (user.assignedDietitian as any)._id,
        firstName: (user.assignedDietitian as any).firstName,
        lastName: (user.assignedDietitian as any).lastName,
        email: (user.assignedDietitian as any).email,
        avatar: (user.assignedDietitian as any).avatar,
        bio: (user.assignedDietitian as any).bio,
        experience: (user.assignedDietitian as any).experience,
        specializations: (user.assignedDietitian as any).specializations
      } : null,
      todayStats: {
        calories: {
          consumed: Math.round(todayTotals.calories),
          target: goals.calories || 1800,
          burned: 0, // This would come from exercise logs
          remaining: Math.max(0, (goals.calories || 1800) - Math.round(todayTotals.calories))
        },
        macros: {
          protein: {
            current: Math.round(todayTotals.protein),
            target: goals.protein || 120,
            percentage: Math.round((todayTotals.protein / (goals.protein || 120)) * 100)
          },
          carbs: {
            current: Math.round(todayTotals.carbs),
            target: goals.carbs || 200,
            percentage: Math.round((todayTotals.carbs / (goals.carbs || 200)) * 100)
          },
          fats: {
            current: Math.round(todayTotals.fat),
            target: goals.fat || 60,
            percentage: Math.round((todayTotals.fat / (goals.fat || 60)) * 100)
          }
        },
        water: {
          current: dailyTracking.water.glasses,
          target: dailyTracking.water.target
        },
        steps: {
          current: dailyTracking.steps.count,
          target: dailyTracking.steps.target
        },
        sleep: {
          current: dailyTracking.sleep?.hours || 0,
          target: dailyTracking.sleep?.target || 8
        }
      },
      weight: {
        current: latestWeight?.value || 0,
        target: goals.targetWeight || 65,
        start: firstWeight?.value || latestWeight?.value || 0,
        change: parseFloat(weightChange),
        unit: latestWeight?.unit || 'kg'
      },
      streak: streak,
      nextAppointment: nextAppointment ? {
        id: nextAppointment._id,
        dietitian: {
          name: `${(nextAppointment.dietitian as any)?.firstName || ''} ${(nextAppointment.dietitian as any)?.lastName || ''}`.trim(),
          firstName: (nextAppointment.dietitian as any)?.firstName
        },
        startTime: nextAppointment.scheduledAt.toISOString(),
        endTime: new Date(nextAppointment.scheduledAt.getTime() + (nextAppointment.duration * 60000)).toISOString(),
        type: nextAppointment.type,
        status: nextAppointment.status
      } : null
    };


}
