import {cleanLoginPhoneInput,loginPhoneMaxLength,validateLoginPhone} from '@/lib/validations/login-phone';
describe('login country phone rules',()=>{
 it.each([['+91',10],['+1',10],['+971',9],['+65',8]])('uses numbering metadata for %s',(code,length)=>{expect(loginPhoneMaxLength(code)).toBe(length);});
 it('rejects incomplete and overlong Indian numbers',()=>{expect(validateLoginPhone('+91987654321','+91').isValid).toBe(false);expect(validateLoginPhone('+9198765432101','+91').isValid).toBe(false);expect(validateLoginPhone('+919876543210','+91').isValid).toBe(true);});
 it('validates international numbering plans and preserves significant Italian zeros',()=>{expect(validateLoginPhone('+14155552671','+1').isValid).toBe(true);expect(validateLoginPhone('+393123456789','+91').isValid).toBe(false);expect(validateLoginPhone('+390236618300','+39').normalized).toBe('+390236618300');});
 it('handles national trunk prefixes without losing significant zeros',()=>{expect(cleanLoginPhoneInput('07911123456','+44')).toBe('7911123456');expect(cleanLoginPhoneInput('0236618300','+39')).toBe('0236618300');});
 it('limits typing and handles a full international paste',()=>{expect(cleanLoginPhoneInput('98765432109999','+91')).toBe('9876543210');expect(cleanLoginPhoneInput('+91 98765 43210','+91')).toBe('9876543210');});
 it('normalizes complete formatted clipboard text before applying national length limits',()=>{expect(cleanLoginPhoneInput('+1 (415) 555-2671','+1')).toBe('4155552671');expect(cleanLoginPhoneInput('+44 7911 123456','+44')).toBe('7911123456');});
});
