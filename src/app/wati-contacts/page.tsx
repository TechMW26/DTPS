import React from 'react';
import { headers } from 'next/headers';
import PerPageSelect from '@/components/wati/PerPageSelect';
import { COUNTRY_CODES, COUNTRY_CODE_OPTIONS } from '@/lib/constants/countries';

async function fetchContacts(search: string, limit: number, skip: number) {
  const hdrs = await headers();
  const host = hdrs.get('x-forwarded-host') || hdrs.get('host');
  const proto = hdrs.get('x-forwarded-proto') || 'http';
  const base = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000');
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  params.set('limit', String(limit));
  params.set('skip', String(skip));
  params.set('sort', 'level');
  const url = `${base}/api/wati-contacts?${params.toString()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load contacts');
  return res.json();
}

export default async function WatiContactsPage({ searchParams }: { searchParams: Promise<{ q?: string, code?: string, page?: string, perPage?: string }> }) {
  const s = await searchParams;
  const rawQuery = s?.q || '';
  const selectedCodeFromParams = s?.code || '+91';
  const normalizedCode = COUNTRY_CODES.some((c) => c.code === selectedCodeFromParams) ? selectedCodeFromParams : '+91';
  const q = rawQuery ? `${normalizedCode}${rawQuery.replace(/\D/g, '')}` : '';
  const selectedCode = normalizedCode;
  const qWithoutCode = q.startsWith(normalizedCode) ? q.slice(normalizedCode.length).trim() : rawQuery;
  const perPage = Math.max(1, Math.min(Number(s?.perPage || 10), 50));
  const page = Math.max(1, Number(s?.page || 1));
  const skip = (page - 1) * perPage;
  const { items, total } = await fetchContacts(q, perPage, skip);

  return (
    <div className="p-4 sm:p-6">
      {/* <h1 className="text-2xl font-semibold mb-4">WATI Contacts</h1> */}
      <form className="mb-4 md:flex md:items-center md:w-[30%] md:mx-auto gap-2 sm:gap-3 justify-center " action="/wati-contacts" method="get">
        <div className="flex items-center border rounded w-full  sm:max-w-lg md:max-w-xl">
          <select name="code" defaultValue={selectedCode} className="px-2 py-1.5 text-xs text-gray-500 bg-transparent border-r outline-none">
            {COUNTRY_CODE_OPTIONS.map((country) => (
              <option key={`${country.code}-${country.country}`} value={country.code}>
                {country.flag} {country.code}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="q"
            defaultValue={qWithoutCode}
            placeholder="Your registered whatsapp number"
            className="px-3 py-1.5 placeholder:text-xs flex-1 outline-none text-sm"
          />
        </div>
        <button className="px-8 sm:px-4 md:mt-0 mt-3 flex mx-auto md:mx-0 w-full md:w-fit   justify-center md:justify-start py-1.5 bg-blue-600 text-white rounded text-sm " type="submit">Search</button>
      </form>
      <h2 className="text-xl sm:text-2xl font-semibold text-center my-4 sm:my-6">Leader Board (Top 10 players)</h2>
      <div className="overflow-x-auto border rounded mx-auto max-w-full md:max-w-3xl mb-4 sm:mb-6">
        <table className="min-w-full table-fixed text-xs sm:text-sm">
          <thead className="bg-gray-50 text-xs sm:text-sm">
            <tr>
              <th className="text-left px-2 py-2 w-12 sm:w-20 whitespace-nowrap">Rank</th>
              <th className="text-left px-2 py-2 whitespace-nowrap">Name</th>
              <th className="text-left px-2 py-2 w-12 sm:w-20 whitespace-nowrap">Level</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c: any, idx: number) => (
              <tr key={c._id} className="border-t">
                <td className="px-2 py-2">{skip + idx + 1}</td>
                <td className="px-2 py-2">{c.fullName || c.firstName || '-'}</td>
                <td className="px-2 py-2 font-semibold">{typeof c.level === 'number' ? c.level : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="max-w-3xl hidden sm:flex mx-auto mt-5 sm:mt-6 flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 px-2">
        {/* <div className="text-xs sm:text-sm text-gray-600 self-start sm:self-auto">Total: {total}</div> */}
        <form action="/wati-contacts" method="get" className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <input type="hidden" name="q" value={q} />
          <button aria-label="Previous page" title="Previous" className="h-9 px-4 sm:h-8 sm:px-3 flex items-center justify-center border rounded-full disabled:opacity-50 text-base sm:text-sm bg-white hover:bg-gray-50" name="page" value={Math.max(1, page - 1)} disabled={page <= 1}>
            <span aria-hidden>‹</span>
          </button>
          <span className="text-xs sm:text-sm">Page {page} of {Math.max(1, Math.ceil(total / perPage))}</span>
          <button aria-label="Next page" title="Next" className="h-9 px-4 sm:h-8 sm:px-3 flex items-center justify-center border rounded-full disabled:opacity-50 text-base sm:text-sm bg-white hover:bg-gray-50" name="page" value={page + 1} disabled={skip + items.length >= total}>
            <span aria-hidden>›</span>
          </button>
          <span className="hidden sm:inline sm:ml-4 text-sm text-gray-600">Player Per Page</span>
          <PerPageSelect perPage={perPage} className="border px-2 sm:px-3 py-2 rounded w-20 sm:w-24 text-xs sm:text-sm" />
        </form>
      </div>
    </div>
  );
}

