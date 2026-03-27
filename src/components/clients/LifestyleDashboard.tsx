"use client";

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Utensils, Moon, Flame } from 'lucide-react';
import type { LifestyleData } from './LifestyleForm';

const fmtLabel = (v: string) => v?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '—';

interface LifestyleDashboardProps {
  data: LifestyleData;
  onEdit: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{children}</h4>;
}

function TagList({ items, color = 'gray' }: { items: string[]; color?: string }) {
  const colorMap: Record<string, string> = {
    green: 'bg-emerald-100 text-emerald-700',
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
    purple: 'bg-purple-100 text-purple-700',
    red: 'bg-red-100 text-red-700',
    orange: 'bg-orange-100 text-orange-700',
    gray: 'bg-gray-100 text-gray-700',
  };
  const cls = colorMap[color] || colorMap.gray;
  if (!items.length) return <span className="text-sm text-gray-400">None</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, index) => (
        <Badge key={`${item}-${index}`} variant="secondary" className={`${cls} text-xs font-medium`}>{item}</Badge>
      ))}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, bg }: { label: string; value: string; icon?: React.ComponentType<{ className?: string }>; bg: string }) {
  return (
    <div className={`${bg} rounded-lg p-3 text-center`}>
      {Icon && <Icon className="h-4 w-4 mx-auto text-gray-500 mb-1" />}
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-bold text-gray-900">{value}</p>
    </div>
  );
}

export default function LifestyleDashboard({ data, onEdit }: LifestyleDashboardProps) {
  const cuisines = data.preferredCuisine?.map(fmtLabel) || [];
  const foodAllergies = data.allergiesFood?.filter(a => a).map(fmtLabel) || [];
  const fDays = data.fastDays?.map(fmtLabel) || [];
  const nvDays = data.nonVegExemptDays?.map(fmtLabel) || [];
  const oils = data.cookingOil?.filter(o => o && o !== 'none').map(fmtLabel) || [];

  const oilConsumptionMap: Record<string, string> = {
    '500ml': '500 ml', '1l': '1 Litre', '2l': '2 Litres', '3l': '3 Litres', 'more-3l': '3+ Litres'
  };
  const saltMap: Record<string, string> = {
    'tata-white': 'Iodised White Salt', 'rock-salt': 'Rock Salt', 'black-salt': 'Black Salt'
  };
  const sleepMap: Record<string, string> = {
    'regular-sleep': 'Regular (7-9 hrs)', 'irregular-sleep': 'Irregular', 'insomnia-diagnosed': 'Insomnia', 'difficulty-falling-asleep': 'Difficulty Falling Asleep'
  };
  const stressMap: Record<string, string> = {
    'rarely-stressed': 'Rarely', 'mild-occasional-stress': 'Mild', 'moderate-stress': 'Moderate', 'frequent-stress': 'Frequent'
  };

  return (
    <Card className="border-0 shadow-lg rounded-xl overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-emerald-500 to-emerald-600 py-4 px-4 sm:px-6 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg sm:text-xl font-bold text-white">Lifestyle Information</CardTitle>
          <p className="text-emerald-100 text-sm">Food preferences and dietary habits</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onEdit} className="bg-white/20 hover:bg-white/30 text-white border-0">
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Edit
        </Button>
      </CardHeader>
      <CardContent className="px-4 sm:px-6 py-5 space-y-5">
        {/* Food Preferences */}
        <div>
          <SectionLabel>Food Preferences</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <StatCard label="Diet Type" value={fmtLabel(data.foodPreference)} icon={Utensils} bg="bg-green-50" />
            <StatCard label="Craving" value={fmtLabel(data.cravingType)} icon={Flame} bg="bg-orange-50" />
            <StatCard label="Eat Out" value={fmtLabel(data.eatOutFrequency)} bg="bg-amber-50" />
            <StatCard label="Activity" value={fmtLabel(data.activityRate)} bg="bg-blue-50" />
          </div>
        </div>

        {/* Cuisine & Allergies */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <SectionLabel>Preferred Cuisine</SectionLabel>
            <TagList items={cuisines} color="green" />
          </div>
          <div>
            <SectionLabel>Food Allergies</SectionLabel>
            <TagList items={foodAllergies} color="red" />
          </div>
        </div>

        {/* Days */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <SectionLabel>Fast Days</SectionLabel>
            <TagList items={fDays} color="purple" />
          </div>
          <div>
            <SectionLabel>Non-Veg/Egg Exempt Days</SectionLabel>
            <TagList items={nvDays} color="amber" />
          </div>
        </div>

        {/* Likes / Dislikes */}
        {(data.foodLikes || data.foodDislikes) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.foodLikes && (
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Food Likes</p>
                <p className="text-sm text-gray-800">{data.foodLikes}</p>
              </div>
            )}
            {data.foodDislikes && (
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Food Dislikes</p>
                <p className="text-sm text-gray-800">{data.foodDislikes}</p>
              </div>
            )}
          </div>
        )}

        {/* Habits Row */}
        <div>
          <SectionLabel>Lifestyle Habits</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-lg p-2.5 text-center">
              <p className="text-xs text-gray-500">Smoking</p>
              <p className="text-sm font-medium">{fmtLabel(data.smokingFrequency)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5 text-center">
              <p className="text-xs text-gray-500">Alcohol</p>
              <p className="text-sm font-medium">{fmtLabel(data.alcoholFrequency)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5 text-center">
              <p className="text-xs text-gray-500">Carbonated Beverages</p>
              <p className="text-sm font-medium">{fmtLabel(data.carbonatedBeverageFrequency)}</p>
            </div>
          </div>
        </div>

        {/* Cooking */}
        <div>
          <SectionLabel>Cooking & Consumption</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div className="bg-yellow-50 rounded-lg p-2.5 text-center">
              <p className="text-xs text-gray-500">Monthly Oil</p>
              <p className="text-sm font-medium">{oilConsumptionMap[data.monthlyOilConsumption] || fmtLabel(data.monthlyOilConsumption)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5 text-center">
              <p className="text-xs text-gray-500">Salt Type</p>
              <p className="text-sm font-medium">{saltMap[data.cookingSalt] || fmtLabel(data.cookingSalt)}</p>
            </div>
            <div className="sm:col-span-1">
              <p className="text-xs text-gray-500 mb-1.5">Cooking Oils</p>
              <TagList items={oils} color="orange" />
            </div>
          </div>
        </div>

        {/* Sleep & Stress */}
        <div>
          <SectionLabel>Sleep & Stress</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-indigo-50 rounded-lg p-3 text-center">
              <Moon className="h-4 w-4 mx-auto text-indigo-500 mb-1" />
              <p className="text-xs text-gray-500">Sleep Pattern</p>
              <p className="text-sm font-bold text-gray-900">{sleepMap[data.sleepPattern] || fmtLabel(data.sleepPattern)}</p>
            </div>
            <div className="bg-rose-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Stress Level</p>
              <p className="text-sm font-bold text-gray-900">{stressMap[data.stressLevel] || fmtLabel(data.stressLevel)}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
