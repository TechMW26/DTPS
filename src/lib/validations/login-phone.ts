import {parsePhoneNumberFromString} from 'libphonenumber-js/max';
import metadata from 'libphonenumber-js/metadata.max.json';

/** National lengths from the same numbering-plan metadata used for validation. */
export function loginPhoneLengths(callingCode: string): number[] {
  const data = metadata as unknown as {country_calling_codes: Record<string,string[]>; countries: Record<string,unknown[]>};
  const countries = data.country_calling_codes[callingCode.replace(/^\+/, '')] || [];
  return [...new Set(countries.flatMap(country => {
    const plan=data.countries[country];
    const types=plan?.[11] as (unknown[] | number)[] | undefined;
    return [types?.[0],types?.[1]].flatMap(type => Array.isArray(type) ? ((type[1] || plan[3]) as number[]) : []);
  }))].sort((a,b) => a-b);
}
export function loginPhoneMaxLength(callingCode: string): number {
  return Math.min(15-callingCode.replace(/\D/g,'').length, Math.max(0,...loginPhoneLengths(callingCode)));
}
export function validateLoginPhone(value: string, callingCode?: string) {
  const parsed = parsePhoneNumberFromString(value);
  if (!parsed || (callingCode && `+${parsed.countryCallingCode}` !== callingCode) || !parsed.isValid() || !loginPhoneLengths(`+${parsed.countryCallingCode}`).includes(parsed.nationalNumber.length)) {
    return {isValid:false, error:'Enter a valid phone number for the selected country code.'};
  }
  return {isValid:true, normalized:String(parsed.number)};
}
export function cleanLoginPhoneInput(value: string, callingCode: string): string {
  // Full international pastes preserve the national number without duplicating the dial code.
  const digits=value.replace(/\D/g,'');
  const prefix=callingCode.replace('+','');
  let national=value.trim().startsWith('+') && digits.startsWith(prefix) ? digits.slice(prefix.length) : digits;
  const data=metadata as unknown as {country_calling_codes:Record<string,string[]>;countries:Record<string,unknown[]>};
  const countries=data.country_calling_codes[prefix] || [];
  if(countries.length && countries.every(country=>data.countries[country]?.[5]==='0'))national=national.replace(/^0/,'');
  return national.slice(0,loginPhoneMaxLength(callingCode));
}
