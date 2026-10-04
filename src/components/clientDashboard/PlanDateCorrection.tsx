'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
export function PlanDateCorrection({planId,canCorrect,onCorrected}:{planId:string;canCorrect:boolean;onCorrected:()=>void}){
 const [start,setStart]=useState(''),[end,setEnd]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div role="alert" className="my-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
  <p className="font-semibold">Plan dates need confirmation</p>
  <p>The original dates could not be imported safely. This plan cannot be edited or published until an administrator confirms its actual dates.</p>
  {canCorrect&&<form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{const response=await fetch(`/api/client-meal-plans/${planId}/correct-dates`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({startDate:start,endDate:end})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to save dates');onCorrected();}catch(e){setError(e instanceof Error?e.message:'Unable to save dates');}finally{setBusy(false);}}}>
   <label>Confirmed start date<Input aria-label="Confirmed start date" type="date" required value={start} onChange={e=>setStart(e.target.value)}/></label>
   <label>Confirmed end date<Input aria-label="Confirmed end date" type="date" required value={end} min={start} onChange={e=>setEnd(e.target.value)}/></label>
   <Button type="submit" disabled={busy||!start||!end}>{busy?'Saving…':'Confirm dates'}</Button>
  </form>}
  {error&&<p className="mt-2 text-red-700">{error}</p>}
 </div>;
}
