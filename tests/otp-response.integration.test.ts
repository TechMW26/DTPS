import {readOtpResponse} from '@/lib/auth/otp-response';

describe('OTP response handling', () => {
  it('preserves successful and rejected JSON responses', async () => {
    await expect(readOtpResponse(new Response('{"success":true,"codeLength":4}'))).resolves.toEqual({success:true,codeLength:4});
    await expect(readOtpResponse(new Response('{"success":false,"error":"Expired"}',{status:400}))).resolves.toEqual({success:false,error:'Expired'});
  });
  it('identifies a security checkpoint without exposing HTML or retrying', async () => {
    await expect(readOtpResponse(new Response('<html><title>Vercel Security Checkpoint</title></html>',{status:403}))).rejects.toThrow('security check');
  });
  it('handles empty, invalid and non-object responses', async () => {
    for (const body of ['', '<html>Unavailable</html>', 'null', '[]']) {
      await expect(readOtpResponse(new Response(body,{status:503}))).rejects.toThrow('unexpected response');
    }
  });
  it('explains non-JSON rate limits', async () => {
    await expect(readOtpResponse(new Response('Limit exceeded',{status:429}))).rejects.toThrow('wait a minute');
  });
});
