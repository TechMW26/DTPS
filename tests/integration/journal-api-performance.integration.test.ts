import { performance } from 'perf_hooks';
import {
    summarizeActivities,
    summarizeSleep,
    summarizeSteps,
    summarizeWater,
} from '@/app/api/journal/_utils';

describe('journal API fast-fail performance', () => {
    it('summarizes journal payloads in a single pass under the 3ms budget', () => {
        const activities = Array.from({ length: 12 }, (_, index) => ({ duration: index + 1, sets: index % 4 }));
        const steps = Array.from({ length: 12 }, (_, index) => ({ steps: 800 + index, distance: 1.2, calories: 30 + index }));
        const sleep = Array.from({ length: 6 }, () => ({ hours: 1, minutes: 20 }));
        const water = Array.from({ length: 10 }, () => ({ amount: 2, unit: 'Glass (250ml)' }));

        const activityMs = (() => {
            const start = performance.now();
            for (let i = 0; i < 1000; i += 1) {
                summarizeActivities(activities, 60);
            }
            return (performance.now() - start) / 1000;
        })();

        const stepsMs = (() => {
            const start = performance.now();
            for (let i = 0; i < 1000; i += 1) {
                summarizeSteps(steps, 10000);
            }
            return (performance.now() - start) / 1000;
        })();

        const sleepMs = (() => {
            const start = performance.now();
            for (let i = 0; i < 1000; i += 1) {
                summarizeSleep(sleep, 8);
            }
            return (performance.now() - start) / 1000;
        })();

        const waterMs = (() => {
            const start = performance.now();
            for (let i = 0; i < 1000; i += 1) {
                summarizeWater(water, 2500);
            }
            return (performance.now() - start) / 1000;
        })();

        expect(activityMs).toBeLessThan(3);
        expect(stepsMs).toBeLessThan(3);
        expect(sleepMs).toBeLessThan(3);
        expect(waterMs).toBeLessThan(3);
    });
});