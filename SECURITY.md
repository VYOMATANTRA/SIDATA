# Security Policy

## Supported Versions

SIDATA is developed on `main` without a formal release/version schedule. Security fixes are
applied to `main`; there is currently no maintained older branch.

| Version | Supported |
|---------|-----------|
| `main`  | ✅ |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or
pull requests.**

Instead, report it by email to **andinaufalnurfadhil120@gmail.com**.

Include as much detail as possible: affected component (frontend/backend), reproduction steps,
potential impact, and any suggested remediation.

We aim to acknowledge new reports within a few business days and will work with you to confirm
the issue, assess impact, and coordinate a fix and disclosure timeline before any public
advisory is published.

## Scope

This policy covers the SIDATA application code in this repository (`frontend/`, `backend/`,
and deployment configuration such as `docker-compose.yml`). Issues in third-party dependencies
should generally be reported upstream, but feel free to flag them to us as well if they affect
this project directly.

## Hardening: audit log integrity

`audit_logs` (see `docs/SPEC.md` §3) is meant to be append-only, including against a compromised
application process. That guarantee depends on `backend/scripts/grants/audit-logs-grants.sql`
being applied in every deployment — it strips the app's runtime MySQL user down to `SELECT`,
`INSERT`, and column-scoped `UPDATE` (acknowledge fields only) on that table, with no `DELETE`.
An in-app Prisma client extension (`backend/src/utils/prisma.ts`) enforces the same restriction
at the application layer, but that alone is not a security boundary — it only stops careless
application code, not a compromised process with direct DB access. If you find a way to bypass
either layer, or a deployment missing the grant script, please report it per the process above.
