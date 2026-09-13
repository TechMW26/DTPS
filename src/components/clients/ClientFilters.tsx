'use client';

import { useId, useRef, useState } from 'react';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EMPTY_CLIENT_FILTERS, type ClientFilterValues } from './client-filter-values';
import '@/components/admin/user-filters.css';
import './client-filters.css';

type Key = keyof ClientFilterValues;
type Option = [string, string];
interface Props {
  draft: ClientFilterValues;
  applied: ClientFilterValues;
  onChange: (value: ClientFilterValues) => void;
  onApply: () => void;
  onClear: () => void;
  onRemove: (keys: Key[]) => void;
  search: string;
  onSearch: (value: string) => void;
  dietitians: { _id: string; firstName: string; lastName: string }[];
  tags: { _id: string; name: string }[];
  total: number;
  loading: boolean;
  failed?: boolean;
}
const statusOptions: Option[] = [['lead','Lead'],['active','Active'],['inactive','Inactive'],['hold','On hold']];
const timingOptions: Option[] = [['ongoing','Ongoing plans'],['dateRange','Date range']];
const planStatusOptions: Option[] = [['active','Active'],['draft','Draft'],['completed','Completed'],['paused','Paused'],['cancelled','Cancelled']];
const sharedOptions: Option[] = [['yes','Shared'],['no','Not shared']];
const ranges: [Key, Key, string][] = [
  ['dtAssignedFrom','dtAssignedTo','Dietitian assignment'],
  ['hcAssignedFrom','hcAssignedTo','Health counselor assignment'],
  ['planDurationFrom','planDurationTo','Plan dates'],
  ['lastActivityDTFrom','lastActivityDTTo','Dietitian activity'],
  ['lastActivityHCFrom','lastActivityHCTo','Health counselor activity'],
];
const dateLabel = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-GB', { day:'numeric', month:'short', year:'numeric', timeZone:'UTC' }).format(date);
};
export function ClientFilters({draft, applied, onChange, onApply, onClear, onRemove, search, onSearch, dietitians, tags, total, loading, failed}: Props) {
  const id = useId();
  const [expanded, setExpanded] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const dirty = (Object.keys(EMPTY_CLIENT_FILTERS) as Key[]).some(key => draft[key] !== applied[key]);
  const invalidRanges = ranges.filter(([from,to]) => (from !== 'planDurationFrom' || draft.planDuration === 'dateRange') && draft[from] && draft[to] && draft[from] > draft[to]);
  const staffOptions: Option[] = dietitians.map(person => [person._id, `${person.firstName} ${person.lastName}`.trim()] as Option).sort((a,b)=>a[1].localeCompare(b[1]));
  const tagOptions: Option[] = tags.map(tag => [tag._id,tag.name] as Option).sort((a,b)=>a[1].localeCompare(b[1]));
  const update = (key: Key, value: string) => onChange({...draft, [key]:value, ...(key === 'planDuration' && value !== 'dateRange' ? {planDurationFrom:'',planDurationTo:''} : {})});
  const select = (key: Key, label: string, all: string, options: Option[]) => <div className="user-filter-field">
    <label htmlFor={`${id}-${key}`}>{label}</label>
    <Select value={draft[key] || '_all'} onValueChange={value=>update(key,value === '_all' ? '' : value)}>
      <SelectTrigger id={`${id}-${key}`} className="user-filter-control"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="_all">{all}</SelectItem>{options.map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
  const range = (from: Key, to: Key, label: string) => {
    const invalid = !!(draft[from] && draft[to] && draft[from] > draft[to]);
    return <fieldset className="client-filter-range"><legend>{label}</legend><div className="user-filter-pair">
      {([from,to] as Key[]).map((key,index)=><div key={key} className="user-filter-field">
        <label htmlFor={`${id}-${key}`}>{from === 'planDurationFrom' ? index ? 'Ends on or before' : 'Starts on or after' : index ? 'To' : 'From'}</label>
        <Input id={`${id}-${key}`} aria-label={`${label} ${index ? 'to' : 'from'}`} aria-invalid={invalid} aria-describedby={invalid ? `${id}-date-error` : undefined} className="user-filter-control" type="date" value={draft[key]} min={index ? draft[from] || undefined : undefined} max={!index ? draft[to] || undefined : undefined} onChange={event=>update(key,event.target.value)} />
      </div>)}
    </div></fieldset>;
  };
  const chips: {keys: Key[]; label:string}[] = [];
  for (const [key,label,options] of [
    ['status','Client status',statusOptions], ['tagId','Tag',tagOptions],
    ['primaryDietitian','Primary dietitian',staffOptions], ['secondaryDietitian','Secondary dietitian',staffOptions],
    ['planDuration','Plan timing',timingOptions], ['planStatus','Plan status',planStatusOptions], ['planShared','Plan sharing',sharedOptions],
  ] as [Key,string,Option[]][]) {
    if(applied[key]) chips.push({keys:key === 'planDuration' ? [key,'planDurationFrom','planDurationTo'] : [key],label:`${label}: ${options.find(option=>option[0]===applied[key])?.[1] || 'Selected option'}`});
  }
  if(applied.planName) chips.push({keys:['planName'],label:`Plan: ${applied.planName}`});
  for(const [from,to,label] of ranges) {
    if(from === 'planDurationFrom' && applied.planDuration !== 'dateRange') continue;
    if(applied[from] || applied[to]) chips.push({keys:[from,to],label:`${label}: ${applied[from] ? dateLabel(applied[from]) : 'Any date'} – ${applied[to] ? dateLabel(applied[to]) : 'Any date'}`});
  }
  const count = chips.length + (search.trim() ? 1 : 0);
  const hasValues = count > 0 || Object.values(draft).some(Boolean);
  return <section className="user-filters client-filters" aria-labelledby={`${id}-title`}>
    <div className="user-filter-heading"><div><h2 id={`${id}-title`}><SlidersHorizontal size={16} aria-hidden="true"/> Find clients</h2><p>Search your clients, or combine filters to narrow the list.</p></div><button type="button" className="user-filter-reset" disabled={!hasValues} onClick={onClear}>Clear all</button></div>
    <div className="user-filter-primary client-filter-primary">
      <div className="user-filter-field user-filter-search"><label htmlFor={`${id}-search`}>Search clients</label><div className="user-filter-search-box"><Search size={18} aria-hidden="true"/><Input ref={searchRef} id={`${id}-search`} type="search" className="user-filter-control" placeholder="Name, email, phone or ID" value={search} onChange={event=>onSearch(event.target.value)}/>{search && <button type="button" aria-label="Clear search" onClick={()=>{onSearch('');searchRef.current?.focus();}}><X size={16}/></button>}</div></div>
      {select('status','Client status','All statuses',statusOptions)}
      {select('tagId','Tag','Any tag',tagOptions)}
      <button ref={toggleRef} type="button" className="user-filter-more" aria-expanded={expanded} aria-controls={`${id}-advanced`} onClick={()=>setExpanded(!expanded)}>More filters {chips.length>0 && <span className="user-filter-count">{chips.length}</span>}<ChevronDown size={16} aria-hidden="true"/></button>
    </div>
    <div id={`${id}-advanced`} className="client-filter-advanced" hidden={!expanded}>
      <section className="client-filter-group" aria-labelledby={`${id}-team`}><h3 id={`${id}-team`}>Care team & assignment</h3><div className="client-filter-columns">
        <div className="client-filter-stack">{select('primaryDietitian','Primary dietitian','All dietitians',staffOptions)}{range('dtAssignedFrom','dtAssignedTo','Dietitian assigned')}</div>
        <div className="client-filter-stack">{select('secondaryDietitian','Secondary dietitian','All dietitians',staffOptions)}{range('hcAssignedFrom','hcAssignedTo','Health counselor assigned')}</div>
      </div></section>
      <section className="client-filter-group" aria-labelledby={`${id}-plan`}><h3 id={`${id}-plan`}>Meal plan</h3><div className="client-filter-plan">
        <div className="user-filter-field"><label htmlFor={`${id}-planName`}>Plan name</label><Input id={`${id}-planName`} className="user-filter-control" placeholder="Search plan name" value={draft.planName} onChange={event=>update('planName',event.target.value)}/></div>
        {select('planDuration','Plan timing','Any time',timingOptions)}{select('planStatus','Plan status','Any status',planStatusOptions)}{select('planShared','Plan sharing','Any sharing',sharedOptions)}
      </div>{draft.planDuration==='dateRange' && <div className="client-filter-plan-dates">{range('planDurationFrom','planDurationTo','Plan dates')}</div>}</section>
      <section className="client-filter-group" aria-labelledby={`${id}-activity`}><h3 id={`${id}-activity`}>Last team activity</h3><div className="client-filter-columns">{range('lastActivityDTFrom','lastActivityDTTo','Dietitian activity')}{range('lastActivityHCFrom','lastActivityHCTo','Health counselor activity')}</div></section>
    </div>
    {invalidRanges.length>0 && <p role="alert" id={`${id}-date-error`} className="user-filter-error">Check {invalidRanges.map(range=>range[2].toLowerCase()).join(', ')}: “To” must be on or after “From”.</p>}
    <div className="client-filter-apply"><Button type="button" disabled={!dirty || invalidRanges.length>0} onClick={onApply}>Apply filters</Button><p aria-live="polite">{dirty ? 'You have unapplied changes.' : 'Filters are up to date.'} <span>Search updates as you type.</span></p></div>
    <div className="user-filter-summary"><p role="status">{loading ? 'Updating results…' : failed ? 'Could not update results. Please try refreshing.' : `${total.toLocaleString('en-IN')} ${total===1?'client':'clients'}${count ? ' matching your filters' : ' in your list'}`}</p>
      {count>0 && <ul aria-label="Active filters">{search.trim() && <li><button type="button" aria-label={`Remove search: ${search.trim()}`} onClick={()=>{onSearch('');searchRef.current?.focus();}}><span>Search: {search.trim()}</span><X size={14} aria-hidden="true"/></button></li>}{chips.map(chip=><li key={chip.keys[0]}><button type="button" aria-label={`Remove ${chip.label}`} onClick={()=>{onRemove(chip.keys);toggleRef.current?.focus();}}><span>{chip.label}</span><X size={14} aria-hidden="true"/></button></li>)}</ul>}
    </div>
  </section>;
}
