import { useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type DatePickerProps = {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};



export function DatePicker({ value, onChange, placeholder = "Pick a date", className, disabled = false }: DatePickerProps) {
  const [open, setOpen] = useState(false);

  // Convert string date (YYYY-MM-DD) to Date object
  const dateValue = value ? new Date(value + 'T00:00:00') : undefined;

  const handleSelect = (date: Date | undefined) => {
    if (disabled) return;
    if (date) {
      // Convert Date to YYYY-MM-DD format
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}`;
      onChange(formattedDate);
      setOpen(false);
    }
  };

  // Format display text
  const getDisplayText = () => {
    if (!value) return placeholder;
    try {
      return format(dateValue!, 'MMM dd, yyyy');
    } catch {
      return value; // Fallback to raw value if formatting fails
    }
  };

  return (
    <Popover open={disabled ? false : open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "h-9 w-full justify-start text-left font-normal bg-white border border-gray-300 hover:bg-slate-50 rounded-md px-3 flex items-center transition-colors",
            !value && "text-muted-foreground",
            disabled && "opacity-50 cursor-not-allowed hover:bg-white",
            className
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4 text-slate-900" />
          <span className="text-xs text-slate-900 font-medium">
            {getDisplayText()}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 border-2 border-gray-300 shadow-xl bg-white"
        style={{ zIndex: 50 }}
        align="start"
        sideOffset={5}
      >
        <Calendar
          mode="single"
          selected={dateValue}
          onSelect={handleSelect}
          initialFocus
          className="rounded-md border"
        />
      </PopoverContent>
    </Popover>
  );
}