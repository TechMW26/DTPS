/** Proxies may return HTML (including a security challenge) for an API request.
 * Never retry OTP mutations automatically: a code may already have been sent.
 */
export async function readOtpResponse(response: Response): Promise<any> {
  const body = await response.text();
  if (response.headers.get('x-vercel-mitigated') === 'challenge' ||
      /<title>\s*Vercel Security Checkpoint/i.test(body)) {
    throw new Error('A security check interrupted sign-in. Please reopen DTPS in Safari or your browser, complete any security check, then try again.');
  }
  try {
    const data = JSON.parse(body);
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch { /* Report the service failure instead of Safari's JSON syntax error. */ }
  throw new Error(response.status === 429
    ? 'Too many verification requests. Please wait a minute before trying again.'
    : 'The sign-in service returned an unexpected response. Please refresh the page and try again.');
}
