/// <reference types="jest" />

import fs from 'node:fs';
import path from 'node:path';
import { jsPDF } from 'jspdf';
import { buildDietPlanPdf, dietPlanPdfFilename } from '@/lib/diet-plan-pdf';

describe('diet plan PDF', () => {
  it('creates a deterministic A4 vector document with pagination', () => {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', putOnlyUsedFonts: true });
    const days = Array.from({ length: 10 }, (_, dayIndex) => ({
      day: `Day ${dayIndex + 1}`,
      date: `2026-08-${String(dayIndex + 1).padStart(2, '0')}`,
      note: dayIndex === 0 ? 'Follow the listed portions and drink enough water.' : '',
      meals: {
        Breakfast: {
          time: '8:00 AM',
          foodOptions: [
            { food: 'Vegetable oats with curd', unit: '1 bowl', cal: '320', protein: '14', carbs: '46', fats: '9' },
            { food: 'Vegetable poha', unit: '1 bowl', cal: '290', protein: '8', carbs: '52', fats: '6', isAlternative: true },
          ],
        },
        Lunch: {
          time: '1:30 PM',
          foodOptions: [
            { food: 'Dal, mixed vegetables, roti and salad', unit: '1 plate', cal: '510', protein: '22', carbs: '72', fats: '14' },
          ],
        },
        Dinner: {
          time: '7:30 PM',
          foodOptions: [
            { food: 'Paneer vegetable bowl', unit: '1 bowl', cal: '430', protein: '27', carbs: '31', fats: '21' },
          ],
        },
      },
    }));

    buildDietPlanPdf(pdf, {
      clientName: 'PDF Visual QA',
      dietitianName: 'DTPS Dietitian',
      duration: 10,
      mealTypes: ['Breakfast', 'Lunch', 'Dinner'],
      weekPlan: days,
      showMacros: true,
      clientInfo: { allergies: 'Peanuts' },
    });

    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(210, 0);
    expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(297, 0);
    expect(dietPlanPdfFilename('PDF Visual QA', 'dietitian', new Date('2026-08-08T00:00:00.000Z')))
      .toBe('diet-plan-pdf-visual-qa-dietitian-2026-08-08.pdf');

    if (process.env.PDF_QA_OUTPUT) {
      const outputPath = path.resolve(process.env.PDF_QA_OUTPUT);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, Buffer.from(pdf.output('arraybuffer')));
    }
  });
});
