// Single source of truth for valid roles. The `users.role` column has no
// DB-level CHECK constraint (see schema.js migration) specifically so that
// adding a role never requires a schema migration — add it here, wire up
// what it can access, done. 'admin' is special: requireRole() (auth.js)
// always lets it through regardless of which role a route asks for, so
// granting admin never requires touching every requireRole() call site.
export const ROLES = ['tester', 'lead', 'admin'];

// The role every self-registered account starts as. Not necessarily
// ROLES[0] forever — kept as an explicit constant so registration doesn't
// silently change behavior if ROLES is reordered later.
export const DEFAULT_ROLE = 'tester';

export function isValidRole(role) {
  return ROLES.includes(role);
}
