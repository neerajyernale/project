# ADR-006 — JWT access token + rotating refresh cookie

**Status:** Proposed · **Date:** 2026-09-25

## Context
The prototype has no authentication. The system needs stateless horizontal scaling, and the SPA must not keep long-lived credentials where scripts can read them.

## Decision
- **Access token:** JWT signed with RS256 (private key from the secret store), 15-minute lifetime, held **in memory** in `@wms/core` `AuthSession`. Claims: `sub`, `tid` (tenant), `jti`, `perm_ver`.
- **Refresh token:** opaque random value in an `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` cookie. Stored hashed in PostgreSQL, rotated on every refresh; presenting a rotated token revokes the whole token family (theft detection).
- `/auth/refresh` also requires a custom header (`X-Requested-With`) as CSRF defence alongside SameSite.
- Passwords: BCrypt or Argon2id, with the work factor set by measurement on production hardware.
- Permissions resolved server-side per request (cached, ADR-008); `perm_ver` in the token forces re-evaluation after role changes.
- Login and refresh are rate-limited; failed-login lockout with backoff.

## Alternatives considered
- *Tokens in localStorage:* readable by any XSS, which matters more because the framework is EOL (ADR-001).
- *Server sessions:* sticky or shared session store needed for scaling; would introduce Redis early.
- *External IdP (Keycloak/OIDC):* a good future option for enterprise SSO. The token shape above is compatible with it, so this can be revisited per customer.

## Consequences
- Page reload performs one refresh call to restore the session.
- Logout revokes the refresh family server-side; access tokens expire within 15 minutes.
