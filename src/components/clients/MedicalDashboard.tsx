"use client";

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Eye, Droplets, Stethoscope, FileText } from 'lucide-react';
import type { MedicalData, UploadedReport } from './MedicalForm';
import { openMediaInApp } from '@/lib/media';

const fmtLabel = (v: string) => v?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '—';

interface MedicalDashboardProps {
  data: MedicalData;
  onEdit: () => void;
  clientGender?: string;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{children}</h4>;
}

function TagList({ items, color = 'gray' }: { items: string[]; color?: string }) {
  const colorMap: Record<string, string> = {
    red: 'bg-red-100 text-red-700',
    green: 'bg-emerald-100 text-emerald-700',
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
    purple: 'bg-purple-100 text-purple-700',
    gray: 'bg-gray-100 text-gray-700',
  };
  const cls = colorMap[color] || colorMap.gray;
  if (!items.length) return <span className="text-sm text-gray-400">None specified</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(item => (
        <Badge key={item} variant="secondary" className={`${cls} text-xs font-medium`}>{item}</Badge>
      ))}
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-sm text-gray-800 whitespace-pre-line">{value}</p>
    </div>
  );
}

export default function MedicalDashboard({ data, onEdit, clientGender }: MedicalDashboardProps) {
  const conditions = data.medicalConditions
    ? data.medicalConditions.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const allergies = data.allergies
    ? data.allergies.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const restrictions = data.dietaryRestrictions
    ? data.dietaryRestrictions.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const gutDisplay = data.gutIssues?.filter(i => i && i !== 'none').map(fmtLabel) || [];

  const handleViewReport = (report: UploadedReport) => {
    if (!report.url) return;
    openMediaInApp(report.url, report.fileName, report.fileType);
  };

  return (
    <Card className="border-0 shadow-lg rounded-xl overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-emerald-500 to-emerald-600 py-4 px-4 sm:px-6 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg sm:text-xl font-bold text-white">Medical Information</CardTitle>
          <p className="text-emerald-100 text-sm">Health conditions and dietary restrictions</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onEdit} className="bg-white/20 hover:bg-white/30 text-white border-0">
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Edit
        </Button>
      </CardHeader>
      <CardContent className="px-4 sm:px-6 py-5 space-y-5">
        {/* Quick Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <Stethoscope className="h-4 w-4 mx-auto text-red-500 mb-1" />
            <p className="text-xs text-gray-500">Conditions</p>
            <p className="text-lg font-bold text-gray-900">{conditions.length}</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Allergies</p>
            <p className="text-lg font-bold text-gray-900">{allergies.length}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <Droplets className="h-4 w-4 mx-auto text-blue-500 mb-1" />
            <p className="text-xs text-gray-500">Blood Group</p>
            <p className="text-lg font-bold text-gray-900">{data.bloodGroup || '—'}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <FileText className="h-4 w-4 mx-auto text-green-500 mb-1" />
            <p className="text-xs text-gray-500">Reports</p>
            <p className="text-lg font-bold text-gray-900">{data.reports?.length || 0}</p>
          </div>
        </div>

        {/* Medical Conditions */}
        <div>
          <SectionLabel>Medical Conditions</SectionLabel>
          <TagList items={conditions} color="red" />
        </div>

        {/* Allergies & Restrictions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <SectionLabel>Allergies</SectionLabel>
            <TagList items={allergies} color="amber" />
          </div>
          <div>
            <SectionLabel>Dietary Restrictions</SectionLabel>
            <TagList items={restrictions} color="green" />
          </div>
        </div>

        {/* Gut Issues */}
        {gutDisplay.length > 0 && (
          <div>
            <SectionLabel>Gut Issues</SectionLabel>
            <TagList items={gutDisplay} color="purple" />
          </div>
        )}

        {/* Disease History Table */}
        {data.diseaseHistory?.length > 0 && (
          <div>
            <SectionLabel>Disease History</SectionLabel>
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2 font-medium text-gray-600">Disease</th>
                    <th className="text-left p-2 font-medium text-gray-600">Since</th>
                    <th className="text-left p-2 font-medium text-gray-600">Severity</th>
                    <th className="text-left p-2 font-medium text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.diseaseHistory.map(row => (
                    <tr key={row.id} className="border-t">
                      <td className="p-2 font-medium">{row.disease || '—'}</td>
                      <td className="p-2 text-gray-600">{row.since || '—'}</td>
                      <td className="p-2">
                        {row.severity && (
                          <Badge variant="outline" className="text-xs">
                            {row.severity}
                          </Badge>
                        )}
                      </td>
                      <td className="p-2 text-gray-600">{row.action || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Text Fields */}
        {(data.medicalHistory || data.familyHistory || data.medication) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <TextBlock label="Medical History" value={data.medicalHistory} />
            <TextBlock label="Family History" value={data.familyHistory} />
            <TextBlock label="Medication" value={data.medication} />
          </div>
        )}

        {/* Female-specific */}
        {clientGender === 'female' && (
          <div>
            <SectionLabel>Assessment (Female)</SectionLabel>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-pink-50 rounded-lg p-2.5 text-center">
                <p className="text-xs text-gray-500">Pregnant</p>
                <p className="text-sm font-medium">{data.isPregnant ? 'Yes' : 'No'}</p>
              </div>
              <div className="bg-pink-50 rounded-lg p-2.5 text-center">
                <p className="text-xs text-gray-500">Lactating</p>
                <p className="text-sm font-medium">{data.isLactating ? 'Yes' : 'No'}</p>
              </div>
              <div className="bg-pink-50 rounded-lg p-2.5 text-center">
                <p className="text-xs text-gray-500">Menstrual Cycle</p>
                <p className="text-sm font-medium">{fmtLabel(data.menstrualCycle)}</p>
              </div>
              <div className="bg-pink-50 rounded-lg p-2.5 text-center">
                <p className="text-xs text-gray-500">Blood Flow</p>
                <p className="text-sm font-medium">{fmtLabel(data.bloodFlow)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Reports */}
        {data.reports?.length > 0 && (
          <div>
            <SectionLabel>Uploaded Documents</SectionLabel>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2 font-medium text-gray-600">File Name</th>
                    <th className="text-left p-2 font-medium text-gray-600">Category</th>
                    <th className="text-left p-2 font-medium text-gray-600">Uploaded</th>
                    <th className="text-left p-2 font-medium text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.reports.map(r => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2 font-medium">{r.fileName}</td>
                      <td className="p-2">
                        <Badge variant="secondary" className={`text-xs ${r.category === 'other' ? 'bg-gray-100' : 'bg-blue-100 text-blue-700'}`}>
                          {r.category === 'other' ? 'Other' : 'Medical Report'}
                        </Badge>
                      </td>
                      <td className="p-2 text-gray-600">{r.uploadedOn}</td>
                      <td className="p-2">
                        <Button size="sm" variant="ghost" onClick={() => handleViewReport(r)} disabled={!r.url} className="h-7 text-blue-600 hover:text-blue-800 text-xs">
                          <Eye className="h-3 w-3 mr-1" /> View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Notes */}
        {data.notes && <TextBlock label="Additional Notes" value={data.notes} />}
      </CardContent>
    </Card>
  );
}
