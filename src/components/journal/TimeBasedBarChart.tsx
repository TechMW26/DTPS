'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ChartData {
  time: string;
  values: number[];
}

interface TimeBasedBarChartProps {
  title: string;
  yAxisLabel: string;
  data: ChartData[];
  colors: string[];
  legends: { label: string; color: string }[];
  maxValue?: number;
}

export default function TimeBasedBarChart({
  title,
  yAxisLabel,
  data,
  colors,
  legends,
  maxValue = 100
}: TimeBasedBarChartProps) {
  const chartHeight = 200;
  const barWidth = 12;
  const barGap = 4;
  
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-medium text-gray-700">{title}</h4>
            <p className="text-xs text-blue-500">{yAxisLabel}</p>
          </div>
          <div className="flex items-center gap-4">
            {legends.map((legend, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <div 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: legend.color }}
                />
                <span className="text-xs text-gray-600">{legend.label}</span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="relative" style={{ height: chartHeight + 40 }}>
          {/* Chart area */}
          <div className="flex items-end justify-between h-full pb-8 px-2">
            {data.map((item, index) => (
              <div key={index} className="flex flex-col items-center">
                {/* Bars group */}
                <div className="flex items-end gap-1" style={{ height: chartHeight }}>
                  {item.values.map((value, vIdx) => {
                    const height = (value / maxValue) * chartHeight;
                    return (
                      <div
                        key={vIdx}
                        className="rounded-t-sm transition-all duration-300 hover:opacity-80"
                        style={{
                          width: barWidth,
                          height: Math.max(height, 4),
                          backgroundColor: colors[vIdx] || colors[0]
                        }}
                      />
                    );
                  })}
                </div>
                {/* Time label */}
                <span className="text-xs text-gray-500 mt-2">{item.time}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
