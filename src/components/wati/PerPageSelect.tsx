"use client";

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface PerPageSelectProps {
  perPage: number;
  className?: string;
}

export default function PerPageSelect({ perPage, className }: PerPageSelectProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value || String(perPage);
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set('perPage', value);
    // reset to first page when perPage changes
    params.set('page', '1');
    router.push(`/wati-contacts?${params.toString()}`);
  };

  return (
    <select
      className={className}
      defaultValue={perPage}
      onChange={onChange}
      name="perPage"
      aria-label="Players per page"
    >
      <option value={10}>10</option>
      <option value={25}>25</option>
      <option value={50}>50</option>
    </select>
  );
}


