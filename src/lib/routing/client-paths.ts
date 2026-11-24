/**
 * True only for the client app at /user and its sub-pages.
 * A plain startsWith('/user') also matched the admin /users page, which sent
 * admins clicking "Users" to the wrong place.
 */
export function isClientUserPath(pathname: string): boolean {
  return pathname === '/user' || pathname.startsWith('/user/');
}
