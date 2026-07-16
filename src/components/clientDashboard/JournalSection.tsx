'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen } from 'lucide-react';

export default function JournalSection() {
  return (
    <div className="mt-6">
      <Card>
        <CardHeader>
          <CardTitle>Client Journal Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-gray-500">
            <BookOpen className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p>No journal entries yet</p>
            <p className="text-sm mt-2">Client journal entries will appear here</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
