'use client';

import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, Mail, Phone } from 'lucide-react';

interface Professional {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
  phone?: string;
  specialization?: string;
}

interface ProfessionalGridProps {
  title: string;
  professionals: Professional[];
  type: 'dietitian' | 'health_counselor';
  onRemove?: (professionalId: string) => void;
  isLoading?: boolean;
  compact?: boolean;
}

export const ProfessionalGrid = ({
  title,
  professionals,
  type,
  onRemove,
  isLoading = false,
  compact = false,
}: ProfessionalGridProps) => {
  if (professionals.length === 0) {
    return (
      <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center bg-gray-50">
        <p className="text-sm text-gray-600">No {title.toLowerCase()} assigned yet</p>
      </div>
    );
  }

  const typeColor = type === 'dietitian' 
    ? { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-800' }
    : { bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-800' };

  const typeLabel = type === 'dietitian' ? 'Dietitian' : 'Health Counselor';

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">
        {title} ({professionals.length})
      </h4>
      <div className={compact ? 'space-y-2' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'}>
        {professionals.map((prof) => (
          <div
            key={prof._id}
            className={`flex items-start justify-between p-3 border rounded-lg transition-colors hover:bg-opacity-75 ${typeColor.bg} ${typeColor.border} border`}
          >
            <div className="flex gap-3 flex-1 min-w-0">
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarImage src={prof.avatar} />
                <AvatarFallback className={`${typeColor.badge}`}>
                  {prof.firstName?.[0]}{prof.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm">{prof.firstName} {prof.lastName}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Badge variant="outline" className={`text-xs h-5 ${typeColor.badge} border-0`}>
                    {typeLabel}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-600">
                  {prof.email && (
                    <a
                      href={`mailto:${prof.email}`}
                      className="flex items-center gap-1 hover:text-blue-600 truncate"
                      title={prof.email}
                    >
                      <Mail className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{prof.email}</span>
                    </a>
                  )}
                  {prof.phone && (
                    <a
                      href={`tel:${prof.phone}`}
                      className="flex items-center gap-1 hover:text-blue-600"
                      title={prof.phone}
                    >
                      <Phone className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
            {onRemove && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemove(prof._id)}
                disabled={isLoading}
                className="ml-2 h-8 w-8 p-0 hover:bg-red-100 hover:text-red-600 flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

interface ProfessionalSectionProps {
  dietitians: Professional[];
  healthCounselors: Professional[];
  onRemoveDietitian?: (id: string) => void;
  onRemoveHealthCounselor?: (id: string) => void;
  isLoading?: boolean;
  compact?: boolean;
}

export const ProfessionalSection = ({
  dietitians,
  healthCounselors,
  onRemoveDietitian,
  onRemoveHealthCounselor,
  isLoading = false,
  compact = false,
}: ProfessionalSectionProps) => {
  const hasProfessionals = dietitians.length > 0 || healthCounselors.length > 0;

  if (!hasProfessionals) {
    return (
      <div className="text-center py-6 border border-dashed border-gray-300 rounded-lg bg-gray-50">
        <p className="text-sm text-gray-600">No professionals assigned</p>
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      {dietitians.length > 0 && (
        <ProfessionalGrid
          title="Assigned Dietitians"
          professionals={dietitians}
          type="dietitian"
          onRemove={onRemoveDietitian}
          isLoading={isLoading}
          compact={compact}
        />
      )}
      {healthCounselors.length > 0 && (
        <ProfessionalGrid
          title="Assigned Health Counselors"
          professionals={healthCounselors}
          type="health_counselor"
          onRemove={onRemoveHealthCounselor}
          isLoading={isLoading}
          compact={compact}
        />
      )}
    </div>
  );
};
