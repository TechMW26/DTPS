'use client';

import { useId, useRef, useState } from 'react';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import './user-filters.css';
import './all-client-filters.css';

export interface AllClientFilterValues {
  search: string;
  assignment: string;
  onboarding: string;
  status: string;
  dietitian: string;
  healthCounselor: string;
  dateFrom: string;
  dateTo: string;
}
export const EMPTY_ALL_CLIENT_FILTERS: AllClientFilterValues = {
  search: '', assignment: 'all', onboarding: 'all', status: 'all', dietitian: 'all', healthCounselor: 'all', dateFrom: '', dateTo: '',
};
interface StaffOption { _id: string; firstName: string; lastName: string }
interface Props {
  value: AllClientFilterValues;
  onChange: (value: AllClientFilterValues) => void;
  dietitians: StaffOption[];
  healthCounselors: StaffOption[];
  loading?: boolean;
  total: number;
  failed?: boolean;
}
const assignments = [['all', 'All clients'], ['true', 'Assigned'], ['false', 'Unassigned']];
const statuses = [['all', 'All statuses'], ['lead', 'Lead'], ['active', 'Active'], ['inactive', 'Inactive'], ['hold', 'On hold']];
const onboarding = [['all', 'All onboarding'], ['done', 'Completed'], ['pending', 'Pending']];
const staffOptions = (staff: StaffOption[]) => [...staff].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)).map(person => [person._id, `${person.firstName} ${person.lastName}`.trim()]);
const readableDate = (date: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

export function AllClientFilters({ value, onChange, dietitians, healthCounselors, loading, total, failed }: Props) {
  const id = useId();
  const moreButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(true);
  const update = (key: keyof AllClientFilterValues, next: string) => onChange({ ...value, [key]: next });
  const dietitianOptions = [['all', 'All dietitians'], ...staffOptions(dietitians)];
  const counselorOptions = [['all', 'All health counselors'], ...staffOptions(healthCounselors)];
  const dateError = !!(value.dateFrom && value.dateTo && value.dateFrom > value.dateTo);
  const active: { key: keyof AllClientFilterValues; text: string }[] = [];
  if (value.search.trim()) active.push({ key: 'search', text: `Search: ${value.search.trim()}` });
  for (const [key, label, options] of [
    ['assignment', 'Assignment', assignments], ['status', 'Status', statuses], ['onboarding', 'Onboarding', onboarding],
    ['dietitian', 'Dietitian', dietitianOptions], ['healthCounselor', 'Counselor', counselorOptions],
  ] as const) {
    if (value[key] !== 'all') active.push({ key, text: `${label}: ${options.find(option => option[0] === value[key])?.[1] || 'Selected staff member'}` });
  }
  if (value.dateFrom) active.push({ key: 'dateFrom', text: `Joined from: ${readableDate(value.dateFrom)}` });
  if (value.dateTo) active.push({ key: 'dateTo', text: `Joined to: ${readableDate(value.dateTo)}` });
  const extraCount = active.filter(item => ['dietitian', 'healthCounselor', 'onboarding', 'dateFrom', 'dateTo'].includes(item.key)).length;

  const select = (key: 'assignment' | 'status' | 'dietitian' | 'healthCounselor' | 'onboarding', label: string, options: string[][]) => (
    <div className="user-filter-field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <Select value={value[key]} onValueChange={next => update(key, next)}>
        <SelectTrigger id={`${id}-${key}`} className="user-filter-control"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([option, name]) => <SelectItem key={option} value={option}>{name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );

  return (
    <section className="user-filters all-client-filters" aria-labelledby={`${id}-title`}>
      <div className="user-filter-heading">
        <div><h2 id={`${id}-title`}><SlidersHorizontal size={16} aria-hidden="true" /> Find clients</h2><p>Combine filters to find the clients you need.</p></div>
        <button type="button" className="user-filter-reset" disabled={!active.length} onClick={() => onChange({ ...EMPTY_ALL_CLIENT_FILTERS })}>Clear all</button>
      </div>
      <div className="user-filter-primary">
        <div className="user-filter-field user-filter-search">
          <label htmlFor={`${id}-search`}>Search clients</label>
          <div className="user-filter-search-box">
            <Search size={18} aria-hidden="true" />
            <Input ref={searchInput} id={`${id}-search`} type="search" placeholder="Name, email, phone or ID" value={value.search} onChange={event => update('search', event.target.value)} className="user-filter-control" />
            {value.search && <button type="button" aria-label="Clear search" onClick={() => { update('search', ''); searchInput.current?.focus(); }}><X size={16} /></button>}
          </div>
        </div>
        {select('status', 'Client status', statuses)}
        {select('assignment', 'Assignment', assignments)}
        <button ref={moreButton} type="button" className="user-filter-more" aria-expanded={expanded} aria-controls={`${id}-advanced`} onClick={() => setExpanded(!expanded)}>
          More filters {extraCount > 0 && <span className="user-filter-count">{extraCount}</span>}<ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>
      <div id={`${id}-advanced`} hidden={!expanded} className="user-filter-advanced all-client-filter-advanced">
        <fieldset><legend>Care team</legend><div className="user-filter-pair">
          {select('dietitian', 'Primary dietitian', dietitianOptions)}
          {select('healthCounselor', 'Primary health counselor', counselorOptions)}
        </div></fieldset>
        <fieldset><legend>Getting started</legend>{select('onboarding', 'Onboarding', onboarding)}</fieldset>
        <fieldset><legend>Joined date</legend><div className="user-filter-pair">
          <div className="user-filter-field"><label htmlFor={`${id}-from`}>From</label><Input id={`${id}-from`} className="user-filter-control" type="date" value={value.dateFrom} max={value.dateTo || undefined} aria-invalid={dateError} aria-describedby={dateError ? `${id}-date-error` : undefined} onChange={event => update('dateFrom', event.target.value)} /></div>
          <div className="user-filter-field"><label htmlFor={`${id}-to`}>To</label><Input id={`${id}-to`} className="user-filter-control" type="date" value={value.dateTo} min={value.dateFrom || undefined} aria-invalid={dateError} aria-describedby={dateError ? `${id}-date-error` : undefined} onChange={event => update('dateTo', event.target.value)} /></div>
        </div></fieldset>
      </div>
      {dateError && <p id={`${id}-date-error`} role="alert" className="user-filter-error">Choose a “To” date on or after “From”. Results keep the last valid date range.</p>}
      <div className="user-filter-summary">
        <p role="status" aria-live="polite">{dateError ? 'Check the date range' : loading ? 'Updating results…' : failed ? 'Could not update results' : `${total.toLocaleString('en-IN')} ${total === 1 ? 'client' : 'clients'}${active.length ? ' matching your filters' : ' in the directory'}`}</p>
        {active.length > 0 && <ul aria-label="Active filters">{active.map(filter => <li key={filter.key}><button type="button" aria-label={`Remove ${filter.text}`} onClick={() => { update(filter.key, EMPTY_ALL_CLIENT_FILTERS[filter.key]); moreButton.current?.focus(); }}><span>{filter.text}</span><X size={14} aria-hidden="true" /></button></li>)}</ul>}
      </div>
    </section>
  );
}
