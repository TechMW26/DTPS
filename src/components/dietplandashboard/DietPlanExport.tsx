'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileText, FileSpreadsheet, Printer, FileImage, FileDown } from 'lucide-react';
import { DayPlan, MealTypeConfig, FoodOption } from './DietPlanDashboard';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { MEAL_TYPES, MEAL_TYPE_KEYS, normalizeMealType } from '@/lib/mealConfig';

interface DietPlanExportProps {
  weekPlan: DayPlan[];
  mealTypes: string[];
  clientName?: string;
  clientInfo?: {
    age?: number;
    goal?: string;
    dietaryRestrictions?: string;
    medicalConditions?: string;
    allergies?: string;
  };
  duration: number;
  startDate?: string;
  dietitianName?: string; // Name of the dietitian who created the plan
  externalOpen?: boolean; // External control to open dialog
  onExternalOpenChange?: (open: boolean) => void; // Callback when dialog state changes externally
}

export function DietPlanExport({ weekPlan, mealTypes, clientName, clientInfo, duration, startDate, dietitianName, externalOpen, onExternalOpenChange }: DietPlanExportProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [exportFor, setExportFor] = useState<'dietitian' | 'client'>('dietitian');

  // Support both internal and external open state
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (onExternalOpenChange) {
      onExternalOpenChange(value);
    } else {
      setInternalOpen(value);
    }
  };

  const [exportFormat, setExportFormat] = useState<'html' | 'csv' | 'pdf' | 'print'>('pdf');

  // Helper function to format date properly
  const formatDateProper = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-IN', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      });
    } catch (e) {
      return dateStr;
    }
  };

  // Helper: escape note text and render one bullet line per sentence.
  const formatNoteForExport = (noteText?: string): string => {
    if (!noteText) return '';

    const escaped = noteText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const sentenceLines = (escaped.match(/[^.\n]+(?:\.)?/g) || [])
      .map((line) => line.trim())
      .filter(Boolean);

    if (!sentenceLines.length) return '';

    return sentenceLines
      .map((line) => `<span class="sentence-dot">●</span> ${line}`)
      .join('<br/>');
  };

  // Helper function to get meal time — prefer actual stored time from plan data
  // This ensures custom meal times and bulk-edited times are reflected in exports
  const getMealTime = (mealType: string): string => {
    // First try stored time from plan data (reflects bulk time edits and custom meals)
    for (const day of weekPlan) {
      if (day.meals[mealType]?.time) {
        return day.meals[mealType].time;
      }
      // Also try normalized key form
      const key = normalizeMealType(mealType);
      if (key) {
        const label = MEAL_TYPES[key]?.label;
        if (label && label !== mealType && day.meals[label]?.time) {
          return day.meals[label].time;
        }
      }
    }
    // Fallback to canonical IST time from mealConfig
    const normalizedKey = normalizeMealType(mealType);
    if (normalizedKey && MEAL_TYPES[normalizedKey]) {
      return MEAL_TYPES[normalizedKey].time12h;
    }
    return '12:00 PM';
  };

  // Helper: get canonical sort order for a meal type
  const getCanonicalSortOrder = (mealType: string): number => {
    const normalizedKey = normalizeMealType(mealType);
    if (normalizedKey && MEAL_TYPES[normalizedKey]) {
      return MEAL_TYPES[normalizedKey].sortOrder;
    }
    return 99; // custom types go last
  };

  // Helper function to convert time string to numeric for sorting (proper AM/PM handling)
  const getTimeNumericValue = (timeStr: string): number => {
    if (!timeStr) return 1200;
    const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const period = match[3].toUpperCase();
      if (period === 'AM' && hours === 12) hours = 0;
      if (period === 'PM' && hours !== 12) hours += 12;
      return hours * 60 + minutes;
    }
    // Fallback: try 24h format
    if (timeStr.includes(':')) {
      const [hours, minutes] = timeStr.split(':');
      return parseInt(hours, 10) * 60 + parseInt(minutes, 10);
    }
    return 1200;
  };

  // Helper: resolve meal type to display label
  const toDisplayLabel = (mt: string): string => {
    const key = normalizeMealType(mt);
    if (key && MEAL_TYPES[key]) return MEAL_TYPES[key].label;
    return mt;
  };

  // Helper: find meal in day's meals, trying both label and key forms
  const findMealInDay = (day: DayPlan, mealType: string) => {
    if (day.meals[mealType]) return day.meals[mealType];
    const key = normalizeMealType(mealType);
    if (key && day.meals[key]) return day.meals[key];
    const label = toDisplayLabel(mealType);
    if (label !== mealType && day.meals[label]) return day.meals[label];
    return undefined;
  };

  // Get all unique meal types from weekPlan while preserving planner order
  const getAllMealTypesSorted = (): string[] => {
    const orderedMealTypes: string[] = [];
    const seenMealTypes = new Set<string>();

    // 1) Start with planner-configured order
    mealTypes.forEach(mt => {
      const label = toDisplayLabel(mt);
      if (!seenMealTypes.has(label)) {
        seenMealTypes.add(label);
        orderedMealTypes.push(label);
      }
    });

    // 2) Add any extra meal types present in data (custom/legacy), in discovery order
    weekPlan.forEach(day => {
      Object.keys(day.meals).forEach(mt => {
        const label = toDisplayLabel(mt);
        const meal = day.meals[mt];
        // Only include if it has food
        if (meal?.foodOptions?.some(opt => opt.food?.trim()) && !seenMealTypes.has(label)) {
          seenMealTypes.add(label);
          orderedMealTypes.push(label);
        }
      });
    });

    return orderedMealTypes;
  };

  // Calculate daily totals (only main foods, exclude alternatives)
  const calculateDayTotals = (day: DayPlan) => {
    let cal = 0, carbs = 0, protein = 0, fats = 0;

    Object.values(day.meals).forEach(meal => {
      if (meal?.foodOptions) {
        // Only count MAIN food options (isAlternative is false or undefined)
        const mainFoods = meal.foodOptions.filter(opt => !opt.isAlternative);
        mainFoods.forEach(opt => {
          cal += parseFloat(opt.cal) || 0;
          carbs += parseFloat(opt.carbs) || 0;
          protein += parseFloat(opt.protein) || 0;
          fats += parseFloat(opt.fats) || 0;
        });
      }
    });

    return { cal, carbs, protein, fats };
  };

  // Get meal type class suffix based on meal name
  const getMealTypeClass = (mealType: string): string => {
    const lowerMeal = mealType.toLowerCase();
    if (lowerMeal.includes('breakfast') || lowerMeal.includes('early morning')) return 'breakfast';
    if (lowerMeal.includes('mid morning') || lowerMeal.includes('mid-morning')) return 'mid';
    if (lowerMeal.includes('lunch')) return 'lunch';
    if (lowerMeal.includes('snack') || lowerMeal.includes('evening')) return 'snack';
    if (lowerMeal.includes('dinner') || lowerMeal.includes('bed') || lowerMeal.includes('night')) return 'dinner';
    return 'breakfast'; // default
  };

  // Get meal icon SVG based on meal type
  const getMealIcon = (mealType: string): string => {
    const lowerMeal = mealType.toLowerCase();
    if (lowerMeal.includes('breakfast') || lowerMeal.includes('early morning')) {
      return '<svg viewBox="0 0 24 24"><path d="M17 11h1a3 3 0 0 1 0 6h-1"/><path d="M3 11h14v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 6V3"/><path d="M10 6V3"/><path d="M14 6V3"/></svg>';
    }
    if (lowerMeal.includes('mid morning') || lowerMeal.includes('mid-morning')) {
      return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
    }
    if (lowerMeal.includes('lunch')) {
      return '<svg viewBox="0 0 24 24"><path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15z"/><path d="m2 22 5.5-1.5L3.5 16.5z"/></svg>';
    }
    if (lowerMeal.includes('snack') || lowerMeal.includes('evening')) {
      return '<svg viewBox="0 0 24 24"><path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06z"/><path d="M10 2c1 .5 2 2 2 5"/></svg>';
    }
    if (lowerMeal.includes('dinner') || lowerMeal.includes('bed') || lowerMeal.includes('night')) {
      return '<svg viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>';
    }
    return '<svg viewBox="0 0 24 24"><path d="M17 11h1a3 3 0 0 1 0 6h-1"/><path d="M3 11h14v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/></svg>';
  };

  // Generate Premium HTML template matching the exact NutriBalance design
  const generateHTMLContent = useCallback((showMacros: boolean = true) => {
    const today = format(new Date(), 'MMMM d, yyyy');
    const planRef = `NP-${format(new Date(), 'yyyy')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Sort days by actual date if available
    const sortedDays = [...weekPlan].sort((a, b) => {
      if (a.date && b.date) {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      }
      return weekPlan.indexOf(a) - weekPlan.indexOf(b);
    });

    // Hide macros CSS for client version
    const hideMacrosCSS = !showMacros ? `
    .macros { display: none !important; }
    th.c:nth-child(n+3), td.c:nth-child(n+3), td.cal { display: none !important; }
    .meal-kcal { display: none !important; }
    .alt-table td.ac, .alt-table td.am { display: none !important; }
    ` : '';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Weekly Nutrition Plan — DTPS Nutrition</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; background: #e7e5e4; color: #1c1917; padding: 32px 16px; }
    .page { max-width: 860px; margin: 0 auto; background: #fff; border-radius: 2px; box-shadow: 0 1px 30px rgba(0,0,0,0.08); overflow: hidden; }
    .accent-top { height: 6px; background: linear-gradient(to right, #10b981, #14b8a6, #06b6d4); border-radius: 2px 2px 0 0; }
    .accent-bottom { height: 4px; background: linear-gradient(to right, #10b981, #14b8a6, #06b6d4); }

    .header { padding: 40px 48px 32px; }
    .logo-row { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
    .logo-icon { width: 36px; height: 36px; border-radius: 8px; background: linear-gradient(135deg, #10b981, #0d9488); display: flex; align-items: center; justify-content: center; }
    .logo-icon svg { width: 20px; height: 20px; fill: none; stroke: #fff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .brand { font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; color: #047857; font-weight: 600; }
    .title { font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 600; color: #292524; margin-top: 12px; letter-spacing: -0.02em; }
    .ref { color: #a8a29e; font-size: 13px; margin-top: 4px; }
    .export-badge { display: inline-block; background: ${showMacros ? '#ecfdf5' : '#eff6ff'}; color: ${showMacros ? '#059669' : '#2563eb'}; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 500; margin-top: 8px; }

    .client-bar { margin-top: 28px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #f5f5f4; border-radius: 8px; overflow: hidden; border: 1px solid #f5f5f4; }
    .client-field { background: #fff; padding: 12px 16px; }
    .client-field .fl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #a8a29e; font-weight: 500; }
    .client-field .fv { font-size: 13px; color: #44403c; font-weight: 500; margin-top: 2px; }

    .day-divider { padding: 16px 48px 8px; }
    .day-divider-line { border: none; border-top: 2px dashed #d6d3d1; }
    .day-header { padding: 24px 48px 20px; display: flex; align-items: center; gap: 12px; }
    .day-icon { width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(135deg, #10b981, #14b8a6); display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .day-icon svg { width: 20px; height: 20px; fill: none; stroke: #fff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .day-name { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 600; color: #292524; letter-spacing: -0.02em; }
    .day-name .day-num { color: #a8a29e; font-size: 16px; }
    .day-date { font-size: 12px; color: #a8a29e; font-weight: 500; margin-top: -2px; }

    .macros { padding: 0 48px 24px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .mc { border-radius: 8px; padding: 14px 16px; }
    .mc.cal { background: #fffbeb; }
    .mc.pro { background: #eff6ff; }
    .mc.carb { background: #ecfdf5; }
    .mc.fat { background: #fff1f2; }
    .mc-top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .mc-dot { width: 20px; height: 20px; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
    .mc-dot svg { width: 12px; height: 12px; fill: none; stroke: #fff; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
    .mc.cal .mc-dot { background: linear-gradient(135deg, #f59e0b, #fb923c); }
    .mc.pro .mc-dot { background: linear-gradient(135deg, #3b82f6, #818cf8); }
    .mc.carb .mc-dot { background: linear-gradient(135deg, #10b981, #22c55e); }
    .mc.fat .mc-dot { background: linear-gradient(135deg, #f43f5e, #ec4899); }
    .mc-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #78716c; font-weight: 500; }
    .mc-val { font-size: 22px; font-weight: 700; color: #292524; letter-spacing: -0.02em; }
    .mc-val span { font-size: 12px; font-weight: 400; color: #a8a29e; }

    .meals { padding: 0 48px 16px; }
    .meal { margin-bottom: 20px; }
    .meal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .meal-left { display: flex; align-items: center; gap: 10px; }
    .meal-icon { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
    .meal-icon svg { width: 14px; height: 14px; fill: none; stroke: #fff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .meal-icon.breakfast { background: linear-gradient(135deg, #f59e0b, #fb923c); }
    .meal-icon.mid { background: linear-gradient(135deg, #0ea5e9, #22d3ee); }
    .meal-icon.lunch { background: linear-gradient(135deg, #10b981, #22c55e); }
    .meal-icon.snack { background: linear-gradient(135deg, #8b5cf6, #a855f7); }
    .meal-icon.dinner { background: linear-gradient(135deg, #6366f1, #60a5fa); }
    .meal-name { font-size: 15px; font-weight: 600; color: #292524; }
    .meal-time { font-size: 12px; color: #a8a29e; margin-left: 8px; }
    .meal-time svg { width: 12px; height: 12px; display: inline-block; vertical-align: -1px; margin-right: 2px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .meal-kcal { font-size: 12px; color: #a8a29e; font-weight: 500; }

    .tbl-wrap { border-radius: 8px; overflow: hidden; }
    .tbl-wrap.breakfast-border { border: 1px solid #fde68a; }
    .tbl-wrap.mid-border { border: 1px solid #bae6fd; }
    .tbl-wrap.lunch-border { border: 1px solid #a7f3d0; }
    .tbl-wrap.snack-border { border: 1px solid #ddd6fe; }
    .tbl-wrap.dinner-border { border: 1px solid #c7d2fe; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead tr.breakfast-bg { background: #fffbeb; }
    thead tr.mid-bg { background: #f0f9ff; }
    thead tr.lunch-bg { background: #ecfdf5; }
    thead tr.snack-bg { background: #f5f3ff; }
    thead tr.dinner-bg { background: #eef2ff; }
    th { text-align: left; padding: 8px 12px; font-weight: 500; color: #78716c; }
    th.c { text-align: center; }
    td { padding: 10px 12px; }
    td.food { color: #44403c; font-weight: 500; }
    td.c { text-align: center; color: #78716c; }
    td.cal { text-align: center; font-weight: 600; color: #44403c; }
    tbody tr + tr td { border-top: 1px solid #f5f5f4; }
    .food-note-row td { border-top: none; }
    td.food-note {
      font-size: 11px;
      line-height: 1.5;
      color: #57534e;
      background: #fafaf9;
      padding-top: 6px;
      padding-bottom: 10px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .food-note-label { font-weight: 600; color: #44403c; margin-right: 4px; }

    /* Alternatives */
    .alt-wrap { margin-top: 10px; border-radius: 8px; overflow: hidden; }
    .alt-wrap.breakfast-alt { border: 1px dashed rgba(251,146,60,0.4); background: rgba(255,247,237,0.5); }
    .alt-wrap.mid-alt { border: 1px dashed rgba(34,211,238,0.4); background: rgba(236,254,255,0.5); }
    .alt-wrap.lunch-alt { border: 1px dashed rgba(34,197,94,0.4); background: rgba(240,253,244,0.5); }
    .alt-wrap.snack-alt { border: 1px dashed rgba(168,85,247,0.4); background: rgba(250,245,255,0.5); }
    .alt-wrap.dinner-alt { border: 1px dashed rgba(96,165,250,0.4); background: rgba(239,246,255,0.5); }
    .alt-header { padding: 10px 16px; display: flex; align-items: center; gap: 6px; }
    .alt-header svg { width: 14px; height: 14px; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .alt-header.breakfast-hdr svg { stroke: #fb923c; }
    .alt-header.mid-hdr svg { stroke: #22d3ee; }
    .alt-header.lunch-hdr svg { stroke: #22c55e; }
    .alt-header.snack-hdr svg { stroke: #a855f7; }
    .alt-header.dinner-hdr svg { stroke: #60a5fa; }
    .alt-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #a8a29e; font-weight: 600; }

    .alt-group-label { padding: 6px 16px; display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.5); }
    .alt-group-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .alt-group-dot.breakfast-dot { background: #fb923c; }
    .alt-group-dot.mid-dot { background: #22d3ee; }
    .alt-group-dot.lunch-dot { background: #22c55e; }
    .alt-group-dot.snack-dot { background: #a855f7; }
    .alt-group-dot.dinner-dot { background: #60a5fa; }
    .alt-group-text { font-size: 12px; color: #78716c; font-weight: 600; }
    .alt-group-text strong { color: #57534e; font-weight: 600; }
    .alt-group-sep { border: none; border-top: 1px dashed rgba(214,211,209,0.5); }

    .alt-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .alt-table td { padding: 7px 12px; }
    .alt-table td.af { padding-left: 32px; color: #57534e; font-weight: 500; }
    .alt-table td.as { text-align: center; color: #a8a29e; white-space: nowrap; }
    .alt-table td.ac { text-align: center; color: #57534e; font-weight: 600; }
    .alt-table td.ac span { font-weight: 400; color: #a8a29e; }
    .alt-table td.am { text-align: center; color: #a8a29e; }
    .alt-table tr + tr td { border-top: 1px solid rgba(245,245,244,0.6); }

    .notes { padding: 32px 48px; }
    .notes-divider { border: none; border-top: 1px dashed #d6d3d1; margin-bottom: 28px; }
    .notes-title { font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; color: #44403c; font-weight: 600; margin-bottom: 12px; }
    .note { display: flex; align-items: flex-start; gap: 8px; font-size: 12.5px; color: #78716c; margin-bottom: 8px; }
    .note p { margin: 0; flex: 1; min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; }
    .sentence-dot { color: black; font-size: 10px; margin-right: 6px; vertical-align: middle; }
    .note-dot { width: 6px; height: 6px; border-radius: 50%; background: #34d399; margin-top: 6px; flex-shrink: 0; }

    .footer { padding: 0 48px 32px; }
    .footer-inner { border-top: 1px solid #f5f5f4; padding-top: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
    .footer-text { font-size: 11px; color: #a8a29e; line-height: 1.7; }
    .footer-text .green { color: #059669; font-weight: 600; }
    .sig { text-align: center; }
    .sig-line { width: 160px; border-bottom: 1px solid #d6d3d1; margin-bottom: 4px; }
    .sig-name { font-size: 11px; color: #a8a29e; }
    .sig-role { font-size: 10px; color: #a8a29e; }

    .day-held-banner { background: linear-gradient(135deg, #fef3c7, #fde68a); padding: 20px 48px; text-align: center; color: #92400e; font-weight: 500; }

    ${hideMacrosCSS}

    @media (max-width: 640px) {
      body { padding: 12px 8px; }
      .header, .meals, .notes, .footer { padding-left: 20px; padding-right: 20px; }
      .macros { padding-left: 20px; padding-right: 20px; }
      .day-header, .day-divider { padding-left: 20px; padding-right: 20px; }
      .client-bar { grid-template-columns: repeat(2, 1fr); }
      .macros { grid-template-columns: repeat(2, 1fr); }
      .meal-time { display: none; }
      .footer-inner { flex-direction: column; align-items: flex-start; gap: 16px; }
      .am { display: none; }
    }
    @media print { body { background: #fff; padding: 0; } .page { box-shadow: none; } }
  </style>
</head>
<body>
<div class="page">
  <div class="accent-top"></div>

  <!-- HEADER -->
  <div class="header">
    <div class="logo-row">
      <div class="logo-icon"><img src="https://dtps.tech/icons/icon-96x96.png" alt="DTPS" style="width: 27px; height: 26px; border-radius: 4px;" /></div>
      <span class="brand">DTPS Nutrition</span>
    </div>
    <h1 class="title"> Nutrition Plan</h1>
   
    <span class="export-badge">${showMacros ? '📋 Dietitian Version' : '👤 Client Version'}</span>
    <div class="client-bar">
      <div class="client-field"><p class="fl">Client</p><p class="fv">${clientName || 'Client'}</p></div>
      <div class="client-field"><p class="fl">Duration</p><p class="fv">${duration} Days</p></div>
      <div class="client-field"><p class="fl">Dietitian</p><p class="fv">${dietitianName || 'DTPS Nutrition'}</p></div>
    </div>
  </div>

  ${sortedDays.map((day, dayIndex) => {
      const totals = calculateDayTotals(day);
      const dayNum = dayIndex + 1;
      const mealTypeClass = 'breakfast'; // default for day icon

      // Day divider (not for first day)
      const dayDivider = dayIndex > 0 ? '<div class="day-divider"><hr class="day-divider-line"/></div>' : '';

      if (day.isHeld) {
        return `
      ${dayDivider}
      <div class="day-header">
        <div class="day-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
        <div>
          <div class="day-name">${day.day} <span class="day-num">&mdash; Day ${dayNum}</span></div>
          <div class="day-date">${day.date ? formatDateProper(day.date) : ''}</div>
        </div>
      </div>
      <div class="day-held-banner">⏸️ Plan on hold${day.holdReason ? `: ${day.holdReason}` : ''}</div>
      `;
      }

      const allMealTypes = getAllMealTypesSorted();

      return `
    ${dayDivider}
    <div class="day-header">
      <div class="day-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
      <div>
        <div class="day-name">${day.day} <span class="day-num">&mdash; Day ${dayNum}</span></div>
        <div class="day-date">${day.date ? formatDateProper(day.date) : ''}</div>
      </div>
    </div>

    <div class="macros">
      <div class="mc cal"><div class="mc-top"><div class="mc-dot"><svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg></div><span class="mc-label">Calories</span></div><div class="mc-val">${totals.cal.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} <span>kcal</span></div></div>
      <div class="mc pro"><div class="mc-top"><div class="mc-dot"><svg viewBox="0 0 24 24"><path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/></svg></div><span class="mc-label">Protein</span></div><div class="mc-val">${totals.protein.toFixed(0)} <span>g</span></div></div>
      <div class="mc carb"><div class="mc-top"><div class="mc-dot"><svg viewBox="0 0 24 24"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg></div><span class="mc-label">Carbs</span></div><div class="mc-val">${totals.carbs.toFixed(0)} <span>g</span></div></div>
      <div class="mc fat"><div class="mc-top"><div class="mc-dot"><svg viewBox="0 0 24 24"><path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75"/></svg></div><span class="mc-label">Fats</span></div><div class="mc-val">${totals.fats.toFixed(0)} <span>g</span></div></div>
    </div>

    <div class="meals">
      ${allMealTypes.map(mealType => {
        const meal = findMealInDay(day, mealType);
        if (!meal?.foodOptions?.length) return '';

        // Separate main foods from alternatives
        const mainFoods = meal.foodOptions.filter(opt => !opt.isAlternative);
        const alternatives = meal.foodOptions.filter(opt => opt.isAlternative);

        if (!mainFoods.length) return '';

        const mealClass = getMealTypeClass(mealType);
        const mealIcon = getMealIcon(mealType);
        const mealTime = getMealTime(mealType);

        // Calculate meal totals from main foods only
        let mealCal = 0;
        mainFoods.forEach(opt => {
          mealCal += parseFloat(opt.cal) || 0;
        });

        return `
        <div class="meal">
          <div class="meal-head">
            <div class="meal-left">
              <div class="meal-icon ${mealClass}">${mealIcon}</div>
              <span class="meal-name">${mealType}</span>
              <span class="meal-time"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${mealTime}</span>
            </div>
            <span class="meal-kcal">${mealCal.toFixed(0)} kcal</span>
          </div>
          <div class="tbl-wrap ${mealClass}-border">
            <table>
              <thead>
                <tr class="${mealClass}-bg">
                  <th>Food Item</th>
                  <th class="c">Srv.</th>
                  <th class="c">Cal</th>
                  <th class="c">P(g)</th>
                  <th class="c">C(g)</th>
                  <th class="c">F(g)</th>
                </tr>
              </thead>
              <tbody>
                ${mainFoods.map(food => `
                <tr>
                  <td class="food">${food.food || '-'}</td>
                  <td class="c">${food.unit || '1'}</td>
                  <td class="cal">${food.cal || '0'}</td>
                  <td class="c">${food.protein || '0'}</td>
                  <td class="c">${food.carbs || '0'}</td>
                  <td class="c">${food.fats || '0'}</td>
                </tr>
                ${food.note?.trim() ? `
                <tr class="food-note-row">
                  <td class="food-note" colspan="6"><span class="food-note-label">Note:</span>${formatNoteForExport(food.note)}</td>
                </tr>
                ` : ''}
                `).join('')}
              </tbody>
            </table>
          </div>
          ${alternatives.length > 0 ? `
          <div class="alt-wrap ${mealClass}-alt">
            <div class="alt-header ${mealClass}-hdr">
              <svg viewBox="0 0 24 24"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>
              <span class="alt-label">Alternatives</span>
            </div>
            ${mainFoods.map((mainFood, mainIdx) => {
          // Find alternatives that could replace this main food
          // For now, show all alternatives under first main food
          if (mainIdx > 0) return '';
          return `
              <div class="alt-group-label">
                <span class="alt-group-dot ${mealClass}-dot"></span>
                <span class="alt-group-text">Instead of <strong>${mainFood.food || 'Main Item'}</strong></span>
              </div>
              <table class="alt-table">
                <tbody>
                  ${alternatives.map(alt => `
                  <tr>
                    <td class="af">${alt.food || '-'}</td>
                    <td class="as">${alt.unit || '1 srv'}</td>
                    <td class="ac">${alt.cal || '0'} <span>cal</span></td>
                    <td class="am">${alt.protein || '0'}p</td>
                    <td class="am">${alt.carbs || '0'}c</td>
                    <td class="am">${alt.fats || '0'}f</td>
                  </tr>
                  `).join('')}
                </tbody>
              </table>
              `;
        }).join('')}
          </div>
          ` : ''}
        </div>
        `;
      }).join('')}
    </div>

    ${day.note ? `
    <div class="notes">
      <hr class="notes-divider"/>
      <p class="notes-title">Day Notes</p>
      <div class="note"><p>${formatNoteForExport(day.note)}</p></div>
    </div>
    ` : ''}
    `;
    }).join('')}

  <!-- NOTES -->
  <div class="notes">
    <hr class="notes-divider"/>
    <p class="notes-title">Important Notes</p>
    <div class="note"><span class="note-dot"></span><p>Drink at least 8-10 glasses of water throughout the day.</p></div>
    <div class="note"><span class="note-dot"></span><p>Nutritional values are approximate and may vary by brand and preparation.</p></div>
    <div class="note"><span class="note-dot"></span><p>Replace food items only with the listed alternatives to maintain macro balance.</p></div>
    <div class="note"><span class="note-dot"></span><p>Avoid processed foods, sugary drinks, and excessive sodium intake.</p></div>
    ${clientInfo?.dietaryRestrictions ? `<div class="note"><span class="note-dot"></span><p><strong>Dietary Restrictions:</strong> ${clientInfo.dietaryRestrictions}</p></div>` : ''}
    ${clientInfo?.allergies ? `<div class="note"><span class="note-dot"></span><p><strong>Allergies:</strong> ${clientInfo.allergies}</p></div>` : ''}
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <div class="footer-inner">
      <div class="footer-text">
        <p>This diet plan is for informational purposes only. Consult your healthcare provider before making dietary changes.</p>
        <p>Generated by <span class="green">DTPS Nutrition</span></p>
      </div>
      <div class="sig">
        <div class="sig-line"></div>
        <p class="sig-name">${dietitianName || 'DTPS Nutrition'}</p>
        <p class="sig-role">Certified Nutritionist</p>
      </div>
    </div>
  </div>

  <div class="accent-bottom"></div>
</div>
</body>
</html>
    `;
  }, [weekPlan, mealTypes, clientName, clientInfo, duration, startDate, dietitianName]);

  // Generate CSV content with proper date/time sorting
  const generateCSVContent = useCallback(() => {
    // Sort days by actual date if available, otherwise by index
    const sortedDays = [...weekPlan].sort((a, b) => {
      if (a.date && b.date) {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      }
      return weekPlan.indexOf(a) - weekPlan.indexOf(b);
    });

    let csv = '"Diet Plan Export"\n';
    csv += `"Client","${clientName || 'N/A'}"\n`;
    csv += `"Duration","${duration} days"\n`;
    csv += `"Start Date","${startDate ? format(new Date(startDate), 'PPP') : 'N/A'}"\n`;
    csv += '\n';

    // Column headers
    csv += '"Day","Date","Meal Type","Meal Time","Food Item","Quantity","Calories","Carbs(g)","Protein(g)","Fats(g)","Alternative Options","Notes"\n';

    // Data rows
    sortedDays.forEach((day) => {
      // Skip held days or show them differently
      if (day.isHeld) {
        csv += `"${day.day}","${day.date ? formatDateProper(day.date) : ''}","ON HOLD","","","","","","","","","","⏸️ ${day.holdReason || 'Plan on hold'}"\n`;
        return;
      }

      const allMealTypes = getAllMealTypesSorted();

      allMealTypes.forEach(mealType => {
        const meal = findMealInDay(day, mealType);
        if (!meal?.foodOptions?.length) return;

        // Get primary food and alternatives
        const primaryFood = meal.foodOptions[0];
        const alternatives = meal.foodOptions.slice(1);

        const alternativesStr = alternatives
          .map(alt => `${alt.food}${alt.unit ? ` (${alt.unit})` : ''}`)
          .join(' | ');

        // Main food row
        csv += `"${day.day}","${day.date ? formatDateProper(day.date) : ''}","${mealType}","${getMealTime(mealType)}","${primaryFood.food || ''}","${primaryFood.unit || ''}","${primaryFood.cal || ''}","${primaryFood.carbs || ''}","${primaryFood.protein || ''}","${primaryFood.fats || ''}","${alternativesStr}","${day.note || ''}"\n`;

        // Alternative rows (if any)
        alternatives.forEach((alt, altIndex) => {
          csv += `"","","(Alternative ${altIndex + 1})","","${alt.food || ''}","${alt.unit || ''}","${alt.cal || ''}","${alt.carbs || ''}","${alt.protein || ''}","${alt.fats || ''}","",""\n`;
        });
      });

      // Add day total row
      const dayTotals = calculateDayTotals(day);
      csv += `"${day.day} TOTAL","","","","","","${dayTotals.cal.toFixed(0)}","${dayTotals.carbs.toFixed(1)}","${dayTotals.protein.toFixed(1)}","${dayTotals.fats.toFixed(1)}","",""\n`;
      csv += '\n'; // Blank line between days for readability
    });

    // Weekly summary
    csv += '\n"WEEKLY SUMMARY"\n';
    const weeklyTotals = sortedDays.reduce(
      (acc, day) => {
        const totals = calculateDayTotals(day);
        return {
          cal: acc.cal + totals.cal,
          carbs: acc.carbs + totals.carbs,
          protein: acc.protein + totals.protein,
          fats: acc.fats + totals.fats
        };
      },
      { cal: 0, carbs: 0, protein: 0, fats: 0 }
    );

    csv += `"Total Calories","${weeklyTotals.cal.toFixed(0)}"\n`;
    csv += `"Average Daily Calories","${(weeklyTotals.cal / duration).toFixed(0)}"\n`;
    csv += `"Total Carbs","${weeklyTotals.carbs.toFixed(1)} g"\n`;
    csv += `"Total Protein","${weeklyTotals.protein.toFixed(1)} g"\n`;
    csv += `"Total Fats","${weeklyTotals.fats.toFixed(1)} g"\n`;

    return csv;
  }, [weekPlan, clientName, duration, startDate]);

  // Export handlers
  const handleExportHTML = useCallback(() => {
    const showMacros = exportFor === 'dietitian';
    const html = generateHTMLContent(showMacros);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const suffix = exportFor === 'dietitian' ? 'dietitian' : 'client';
    link.download = `diet-plan-${clientName?.replace(/\s+/g, '-') || 'export'}-${suffix}-${format(new Date(), 'yyyy-MM-dd')}.html`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Diet plan exported as HTML (${exportFor} version)`);
    setOpen(false);
  }, [generateHTMLContent, clientName, exportFor]);

  const handleExportCSV = useCallback(() => {
    const csv = generateCSVContent();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diet-plan-${clientName?.replace(/\s+/g, '-') || 'export'}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Diet plan exported as CSV');
    setOpen(false);
  }, [generateCSVContent, clientName]);

  const handleExportPDF = useCallback(() => {
    const showMacros = exportFor === 'dietitian';
    const html = generateHTMLContent(showMacros);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      // Add print-to-PDF optimized styles
      const pdfOptimizedHtml = html.replace('</head>', `
        <style>
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            @page { size: A4; margin: 10mm; }
            .container { box-shadow: none !important; }
          }
        </style>
        </head>
      `);
      printWindow.document.write(pdfOptimizedHtml);
      printWindow.document.close();
      printWindow.onload = () => {
        // Show instructions for saving as PDF
        toast.info(`Use "Save as PDF" in the print dialog to download as PDF (${exportFor} version)`);
        printWindow.print();
      };
    }
    setOpen(false);
  }, [generateHTMLContent, exportFor]);

  const handlePrint = useCallback(() => {
    const showMacros = exportFor === 'dietitian';
    const html = generateHTMLContent(showMacros);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
    toast.success(`Print dialog opened (${exportFor} version)`);
    setOpen(false);
  }, [generateHTMLContent, exportFor]);

  const handleExport = () => {
    switch (exportFormat) {
      case 'html':
        handleExportHTML();
        break;
      case 'csv':
        handleExportCSV();
        break;
      case 'pdf':
        handleExportPDF();
        break;
      case 'print':
        handlePrint();
        break;
    }
  };

  return (
    <>
      {/* Only show button if not externally controlled */}
      {externalOpen === undefined && (
        <Button variant="outline" onClick={() => setOpen(true)} className="border-gray-300 hover:bg-slate-50 dark:border-gray-600 dark:hover:bg-slate-700 font-medium">
          <Download className="w-4 h-4 mr-2" />
          Export Diet Plan
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export Diet Plan</DialogTitle>
            <DialogDescription>
              Choose a format to download the diet plan for {clientName || 'this client'}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Export For</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={exportFor === 'dietitian' ? 'default' : 'outline'}
                  className={`flex-1 ${exportFor === 'dietitian' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                  onClick={() => setExportFor('dietitian')}
                >
                  📋 Dietitian
                </Button>
                <Button
                  type="button"
                  variant={exportFor === 'client' ? 'default' : 'outline'}
                  className={`flex-1 ${exportFor === 'client' ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                  onClick={() => setExportFor('client')}
                >
                  👤 Client
                </Button>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                {exportFor === 'dietitian'
                  ? '✓ Includes all nutritional data (calories, macros)'
                  : '✓ Meal plan only (no nutritional information)'}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Export Format</label>
              <Select value={exportFormat} onValueChange={(v: any) => setExportFormat(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">
                    <div className="flex items-center gap-2">
                      <FileDown className="w-4 h-4" />
                      <span>PDF (Download)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="html">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      <span>HTML (Formatted Table)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="csv">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>CSV (Spreadsheet)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="print">
                    <div className="flex items-center gap-2">
                      <Printer className="w-4 h-4" />
                      <span>Print Preview</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-sm space-y-1">
              <p className="font-medium">Export includes:</p>
              <ul className="text-gray-600 dark:text-gray-400 text-xs space-y-0.5">
                <li>• {duration} days of meal plans</li>
                <li>• {mealTypes.length} meals per day</li>
                <li>• Nutritional information (calories, macros)</li>
                <li>• Alternative food options</li>
                <li>• Daily notes and special instructions</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleExport} className="bg-green-600 hover:bg-green-700">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
