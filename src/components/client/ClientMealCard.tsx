'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Flame, ChevronRight, Check, Utensils } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MealItem {
  id: string;
  name: string;
  calories?: number;
  portion?: string;
  isCompleted?: boolean;
}

interface MealCardProps {
  title: string;
  time?: string;
  calories?: number;
  items: MealItem[];
  isCompleted?: boolean;
  onView?: () => void;
  onMarkComplete?: () => void;
  className?: string;
}

export function ClientMealCard({
  title,
  time,
  calories,
  items,
  isCompleted = false,
  onView,
  onMarkComplete,
  className,
}: MealCardProps) {
  return (
    <Card className={cn(
      "border-0 shadow-sm transition-all duration-200",
      isCompleted && "bg-green-50/50 border-green-200",
      className
    )}>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center",
              isCompleted ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
            )}>
              <Utensils className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">{title}</CardTitle>
              {time && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="h-3 w-3" />
                  {time}
                </div>
              )}
            </div>
          </div>
          {isCompleted && (
            <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
              <Check className="h-3 w-3 mr-1" />
              Done
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {/* Meal Items */}
        <div className="space-y-2 mb-3">
          {items.slice(0, 3).map((item) => (
            <div 
              key={item.id} 
              className="flex items-center justify-between text-sm"
            >
              <span className={cn(
                "text-gray-700",
                item.isCompleted && "line-through text-gray-400"
              )}>
                {item.name}
              </span>
              {item.portion && (
                <span className="text-xs text-gray-500">{item.portion}</span>
              )}
            </div>
          ))}
          {items.length > 3 && (
            <p className="text-xs text-gray-500">
              +{items.length - 3} more items
            </p>
          )}
        </div>

        {/* Calories */}
        {calories && (
          <div className="flex items-center gap-1 text-xs text-gray-600 mb-3">
            <Flame className="h-3 w-3 text-orange-500" />
            <span>{calories} kcal</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {!isCompleted && onMarkComplete && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onMarkComplete}
              className="flex-1 h-8 text-xs"
            >
              <Check className="h-3 w-3 mr-1" />
              Mark Done
            </Button>
          )}
          {onView && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onView}
              className="flex-1 h-8 text-xs"
            >
              View Details
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface MealCardListProps {
  children: React.ReactNode;
  className?: string;
}

export function ClientMealCardList({ children, className }: MealCardListProps) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {children}
    </div>
  );
}

export default ClientMealCard;
