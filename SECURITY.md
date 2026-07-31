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

Instead, use GitHub's private vulnerability reporting for this repository:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability** to open a private advisory.
3. Include as much detail as possible: affected component (frontend/backend), reproduction
   steps, potential impact, and any suggested remediation.

We aim to acknowledge new reports within a few business days and will work with you to confirm
the issue, assess impact, and coordinate a fix and disclosure timeline before any public
advisory is published.

## Scope

This policy covers the SIDATA application code in this repository (`frontend/`, `backend/`,
and deployment configuration such as `docker-compose.yml`). Issues in third-party dependencies
should generally be reported upstream, but feel free to flag them to us as well if they affect
this project directly.
