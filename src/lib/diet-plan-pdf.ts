import type { jsPDF } from 'jspdf';

type PdfFood = {
  food?: string;
  unit?: string;
  cal?: string;
  protein?: string;
  carbs?: string;
  fats?: string;
  note?: string;
  isAlternative?: boolean;
};

type PdfMeal = {
  time?: string;
  foodOptions?: PdfFood[];
};

type PdfDay = {
  day?: string;
  date?: string;
  meals?: Record<string, PdfMeal>;
  note?: string;
  isHeld?: boolean;
  holdReason?: string;
};

export type DietPlanPdfInput = {
  clientName?: string;
  dietitianName?: string;
  duration: number;
  mealTypes: string[];
  weekPlan: PdfDay[];
  showMacros: boolean;
  clientInfo?: {
    dietaryRestrictions?: string;
    allergies?: string;
  };
};

const PAGE_WIDTH = 210;
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_LIMIT = 279;
const GREEN: [number, number, number] = [5, 150, 105];
const DARK: [number, number, number] = [41, 37, 36];
const MUTED: [number, number, number] = [120, 113, 108];
const BORDER: [number, number, number] = [225, 223, 220];

function value(value: unknown, fallback = '-'): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function numberValue(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPlanDate(input?: string): string {
  if (!input) return '';
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value(input, '');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
}

function normalizedMealName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mealFor(day: PdfDay, requestedName: string): PdfMeal | undefined {
  const meals = day.meals || {};
  if (meals[requestedName]) return meals[requestedName];
  const requested = normalizedMealName(requestedName);
  return Object.entries(meals).find(([name]) => normalizedMealName(name) === requested)?.[1];
}

function orderedMealTypes(input: DietPlanPdfInput, day: PdfDay): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  [...input.mealTypes, ...Object.keys(day.meals || {})].forEach((name) => {
    const normalized = normalizedMealName(name);
    if (!normalized || seen.has(normalized)) return;
    const meal = mealFor(day, name);
    if (!meal?.foodOptions?.some((food) => value(food.food, '') !== '')) return;
    seen.add(normalized);
    result.push(name);
  });
  return result;
}

function dayTotals(day: PdfDay) {
  return Object.values(day.meals || {}).reduce(
    (totals, meal) => {
      (meal.foodOptions || []).filter((food) => !food.isAlternative).forEach((food) => {
        totals.cal += numberValue(food.cal);
        totals.protein += numberValue(food.protein);
        totals.carbs += numberValue(food.carbs);
        totals.fats += numberValue(food.fats);
      });
      return totals;
    },
    { cal: 0, protein: 0, carbs: 0, fats: 0 },
  );
}

export function buildDietPlanPdf(pdf: jsPDF, input: DietPlanPdfInput): jsPDF {
  let y = MARGIN;

  pdf.setProperties({
    title: `Nutrition Plan - ${value(input.clientName, 'Client')}`,
    subject: 'DTPS Nutrition Plan',
    author: 'DTPS Nutrition',
    creator: 'DTPS Nutrition',
  });

  const addContinuationHeader = () => {
    pdf.setFillColor(...GREEN);
    pdf.rect(0, 0, PAGE_WIDTH, 4, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...GREEN);
    pdf.text('DTPS NUTRITION', MARGIN, 11);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...MUTED);
    pdf.text(value(input.clientName, 'Client'), PAGE_WIDTH - MARGIN, 11, { align: 'right' });
    y = 18;
  };

  const addPage = () => {
    pdf.addPage('a4', 'portrait');
    addContinuationHeader();
  };

  const ensureSpace = (height: number) => {
    if (y + height > BOTTOM_LIMIT) addPage();
  };

  const wrappedText = (
    text: string,
    x: number,
    width: number,
    options: { size?: number; color?: [number, number, number]; font?: 'normal' | 'bold'; lineHeight?: number } = {},
  ) => {
    const size = options.size || 8;
    const lineHeight = options.lineHeight || size * 0.42;
    pdf.setFont('helvetica', options.font || 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(...(options.color || DARK));
    const lines = pdf.splitTextToSize(value(text), width) as string[];
    ensureSpace(lines.length * lineHeight + 1);
    pdf.text(lines, x, y, { lineHeightFactor: 1.15 });
    y += lines.length * lineHeight;
  };

  pdf.setFillColor(...GREEN);
  pdf.rect(0, 0, PAGE_WIDTH, 5, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(...GREEN);
  pdf.text('DTPS NUTRITION', MARGIN, 18);
  pdf.setFontSize(25);
  pdf.setTextColor(...DARK);
  pdf.text('Nutrition Plan', MARGIN, 31);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(...MUTED);
  pdf.text(input.showMacros ? 'DIETITIAN VERSION' : 'CLIENT VERSION', MARGIN, 38);

  y = 44;
  const cardWidth = CONTENT_WIDTH / 3;
  const cards = [
    ['CLIENT', value(input.clientName, 'Client')],
    ['DURATION', `${input.duration} days`],
    ['DIETITIAN', value(input.dietitianName, 'DTPS Nutrition')],
  ];
  cards.forEach(([label, cardValue], index) => {
    const x = MARGIN + index * cardWidth;
    pdf.setFillColor(249, 250, 251);
    pdf.setDrawColor(...BORDER);
    pdf.rect(x, y, cardWidth, 17, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.setTextColor(...MUTED);
    pdf.text(label, x + 4, y + 6);
    pdf.setFontSize(9);
    pdf.setTextColor(...DARK);
    const cardLines = pdf.splitTextToSize(cardValue, cardWidth - 8) as string[];
    pdf.text(cardLines.slice(0, 2), x + 4, y + 12, { lineHeightFactor: 1.05 });
  });
  y += 25;

  input.weekPlan.forEach((day, dayIndex) => {
    ensureSpace(24);
    pdf.setFillColor(236, 253, 245);
    pdf.roundedRect(MARGIN, y, CONTENT_WIDTH, 16, 2, 2, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(...DARK);
    pdf.text(`${value(day.day, `Day ${dayIndex + 1}`)}  |  Day ${dayIndex + 1}`, MARGIN + 5, y + 7);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...MUTED);
    pdf.text(formatPlanDate(day.date), MARGIN + 5, y + 12);
    y += 21;

    if (day.isHeld) {
      pdf.setFillColor(254, 243, 199);
      pdf.setTextColor(146, 64, 14);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.roundedRect(MARGIN, y, CONTENT_WIDTH, 13, 2, 2, 'F');
      pdf.text(`PLAN ON HOLD${day.holdReason ? `: ${day.holdReason}` : ''}`, MARGIN + 4, y + 8);
      y += 19;
      return;
    }

    if (input.showMacros) {
      const totals = dayTotals(day);
      const macroValues = [
        `Calories  ${totals.cal.toFixed(0)} kcal`,
        `Protein  ${totals.protein.toFixed(1)} g`,
        `Carbs  ${totals.carbs.toFixed(1)} g`,
        `Fats  ${totals.fats.toFixed(1)} g`,
      ];
      macroValues.forEach((macro, index) => {
        const width = CONTENT_WIDTH / 4 - 2;
        const x = MARGIN + index * (CONTENT_WIDTH / 4);
        pdf.setFillColor(248, 250, 252);
        pdf.roundedRect(x, y, width, 10, 1.5, 1.5, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.2);
        pdf.setTextColor(...DARK);
        pdf.text(macro, x + 3, y + 6.3);
      });
      y += 15;
    }

    orderedMealTypes(input, day).forEach((mealType) => {
      const meal = mealFor(day, mealType);
      const mainFoods = (meal?.foodOptions || []).filter((food) => !food.isAlternative);
      const alternatives = (meal?.foodOptions || []).filter((food) => food.isAlternative);
      if (!mainFoods.length) return;

      ensureSpace(19);
      pdf.setFillColor(240, 253, 250);
      pdf.roundedRect(MARGIN, y, CONTENT_WIDTH, 10, 1.5, 1.5, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(...DARK);
      pdf.text(value(mealType), MARGIN + 3, y + 6.4);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(...MUTED);
      pdf.text(value(meal?.time, ''), PAGE_WIDTH - MARGIN - 3, y + 6.4, { align: 'right' });
      y += 12;

      const columns = input.showMacros
        ? [
            { label: 'Food item', x: MARGIN, width: 82, align: 'left' as const },
            { label: 'Serving', x: MARGIN + 82, width: 25, align: 'center' as const },
            { label: 'Cal', x: MARGIN + 107, width: 18, align: 'center' as const },
            { label: 'P(g)', x: MARGIN + 125, width: 18, align: 'center' as const },
            { label: 'C(g)', x: MARGIN + 143, width: 18, align: 'center' as const },
            { label: 'F(g)', x: MARGIN + 161, width: 21, align: 'center' as const },
          ]
        : [
            { label: 'Food item', x: MARGIN, width: 132, align: 'left' as const },
            { label: 'Serving', x: MARGIN + 132, width: 50, align: 'center' as const },
          ];

      const drawTableHeader = () => {
        pdf.setFillColor(249, 250, 251);
        pdf.setDrawColor(...BORDER);
        pdf.rect(MARGIN, y, CONTENT_WIDTH, 7, 'FD');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.5);
        pdf.setTextColor(...MUTED);
        columns.forEach((column) => {
          const textX = column.align === 'left' ? column.x + 3 : column.x + column.width / 2;
          pdf.text(column.label, textX, y + 4.7, { align: column.align });
        });
        y += 7;
      };

      drawTableHeader();
      mainFoods.forEach((food) => {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        const foodLines = pdf.splitTextToSize(value(food.food), columns[0].width - 6) as string[];
        const noteLines = food.note ? (pdf.splitTextToSize(`Note: ${food.note}`, columns[0].width - 6) as string[]) : [];
        const rowHeight = Math.max(8, foodLines.length * 3.2 + noteLines.length * 2.8 + 3);
        if (y + rowHeight > BOTTOM_LIMIT) {
          addPage();
          drawTableHeader();
        }
        pdf.setDrawColor(...BORDER);
        pdf.rect(MARGIN, y, CONTENT_WIDTH, rowHeight);
        pdf.setTextColor(...DARK);
        pdf.text(foodLines, MARGIN + 3, y + 4.5, { lineHeightFactor: 1.05 });
        if (noteLines.length) {
          pdf.setFontSize(6.5);
          pdf.setTextColor(...MUTED);
          pdf.text(noteLines, MARGIN + 3, y + 4.5 + foodLines.length * 3.2, { lineHeightFactor: 1.05 });
        }
        const rowValues = input.showMacros
          ? [value(food.unit), value(food.cal, '0'), value(food.protein, '0'), value(food.carbs, '0'), value(food.fats, '0')]
          : [value(food.unit)];
        rowValues.forEach((rowValue, index) => {
          const column = columns[index + 1];
          pdf.setFontSize(7);
          pdf.setTextColor(...DARK);
          pdf.text(rowValue, column.x + column.width / 2, y + 4.8, { align: 'center' });
        });
        y += rowHeight;
      });

      if (alternatives.length) {
        ensureSpace(8);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.5);
        pdf.setTextColor(...GREEN);
        pdf.text('ALTERNATIVES', MARGIN + 3, y + 5);
        y += 7;
        alternatives.forEach((food) => {
          const alternative = `${value(food.food)}  (${value(food.unit)})`;
          wrappedText(alternative, MARGIN + 5, CONTENT_WIDTH - 10, { size: 7, color: MUTED, lineHeight: 3.2 });
        });
      }
      y += 5;
    });

    if (day.note) {
      ensureSpace(12);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(...GREEN);
      pdf.text('DAY NOTES', MARGIN, y + 3);
      y += 7;
      wrappedText(day.note, MARGIN, CONTENT_WIDTH, { size: 7.5, color: MUTED, lineHeight: 3.5 });
      y += 4;
    }
  });

  ensureSpace(35);
  pdf.setDrawColor(...BORDER);
  pdf.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 7;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...DARK);
  pdf.text('Important notes', MARGIN, y);
  y += 5;
  [
    'Drink 8-10 glasses of water throughout the day.',
    'Nutritional values are approximate and may vary by brand and preparation.',
    input.clientInfo?.dietaryRestrictions ? `Dietary restrictions: ${input.clientInfo.dietaryRestrictions}` : '',
    input.clientInfo?.allergies ? `Allergies: ${input.clientInfo.allergies}` : '',
  ].filter(Boolean).forEach((note) => {
    wrappedText(`- ${note}`, MARGIN, CONTENT_WIDTH, { size: 7.5, color: MUTED, lineHeight: 3.5 });
    y += 1;
  });

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(...BORDER);
    pdf.line(MARGIN, 286, PAGE_WIDTH - MARGIN, 286);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(...MUTED);
    pdf.text('Generated by DTPS Nutrition', MARGIN, 291);
    pdf.text(`Page ${page} of ${pages}`, PAGE_WIDTH - MARGIN, 291, { align: 'right' });
  }

  return pdf;
}

export function dietPlanPdfFilename(clientName: string | undefined, version: 'dietitian' | 'client', date: Date): string {
  const safeName = value(clientName, 'export')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'export';
  const isoDate = date.toISOString().slice(0, 10);
  return `diet-plan-${safeName}-${version}-${isoDate}.pdf`;
}
