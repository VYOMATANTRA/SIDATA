# Password Change — Frontend Integration Guide

This document describes everything the frontend needs to wire up **self-service password change** for logged-in users against the `POST /api/profile/change-password` endpoint.

---

## Endpoint Reference

| Property | Value |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/profile/change-password` |
| **Auth required** | Yes — Bearer access token in `Authorization` header |
| **CSRF required** | Yes — `x-csrf-token` header |
| **Bot check** | Yes — Cloudflare Turnstile token |
| **Rate limit** | 10 requests / 15 min per IP (HTTP `429` when exceeded) |

### Request Body

```json
{
  "currentPassword": "string (required)",
  "newPassword": "string (required)",
  "turnstileToken": "string (required — Turnstile widget response)"
}
```

> **Note**: Do **not** send a `userId` in the body. The backend derives identity exclusively from the JWT to prevent IDOR. Any `userId` field in the body is silently ignored.

### Successful Response — `200 OK`

```json
{
  "message": "Kata sandi berhasil diperbarui. Silakan login kembali.",
  "sessionInvalidated": true
}
```

When `sessionInvalidated: true`, the frontend **must** redirect the user to `/login`. The backend has revoked all refresh tokens; the current access token will expire within ~15 minutes and cannot be renewed.

### Error Responses

| HTTP | `error` field value (Indonesian) | Cause |
|---|---|---|
| `400` | `Kata sandi saat ini wajib diisi.` | `currentPassword` missing |
| `400` | `Kata sandi baru wajib diisi.` | `newPassword` missing |
| `400` | `Kata sandi baru minimal harus 8 karakter (Standar NIST).` | New password < 8 chars |
| `400` | `Kata sandi baru terlalu panjang (maksimal 128 karakter).` | New password > 128 chars |
| `400` | `Kata sandi baru tidak boleh sama dengan kata sandi lama.` | Old == New |
| `400` | `Kata sandi baru terlalu lemah atau umum digunakan.` + `suggestions[]` | zxcvbn score < 2 |
| `400` | `Akun Anda menggunakan autentikasi pihak ketiga (OAuth)…` | OAuth-only account |
| `400` | `Verifikasi anti-bot (Turnstile) gagal. Silakan coba lagi.` | Bad/missing Turnstile token |
| `401` | `Kredensial tidak valid.` | Wrong current password or user not found |
| `401` | `Akses ditolak.` | Missing / expired access token |
| `403` | `Token tidak valid atau sudah kedaluwarsa.` | JWT validation failure |
| `403` | `CSRF token tidak valid` | Missing / bad CSRF token |
| `429` | *(express-rate-limit default)* | Rate limit exceeded |
| `500` | `Terjadi kesalahan internal server.` | Unexpected server error |

---

## Step-by-Step: Wiring the Form

### 1 — Fetch a fresh CSRF token

```ts
// Call once when the page/modal mounts.
const { csrfToken } = await fetch('/api/auth/csrf-token', {
  credentials: 'include',
}).then(r => r.json());
```

Store it in component state. Re-fetch if the user navigates away and comes back.

### 2 — Add a Turnstile widget

```html
<!-- In your form template -->
<div id="turnstile-container"></div>
```

```ts
// Vanilla JS embed:
turnstile.render('#turnstile-container', {
  sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
  callback: (token) => { turnstileToken.value = token; },
  'error-callback': () => { turnstileToken.value = ''; },
  'expired-callback': () => { turnstileToken.value = ''; },
});
```

> **Important**: Always reset the Turnstile widget after any failed submission (`turnstile.reset()`). A widget token is single-use on the backend.

### 3 — Submit the form

```ts
async function handleSubmit() {
  if (!validate()) return; // See frontend validations below

  try {
    const response = await fetch('/api/profile/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'x-csrf-token': csrfToken,
      },
      credentials: 'include',
      body: JSON.stringify({
        currentPassword,
        newPassword,
        turnstileToken,
      }),
    });

    const data = await response.json();

    if (response.ok && data.sessionInvalidated) {
      // Clear access token from memory, redirect to login
      clearSession();
      router.push('/login?reason=password_changed');
      return;
    }

    if (!response.ok) {
      errorMessage.value = data.error ?? 'Terjadi kesalahan.';
      if (data.suggestions?.length) {
        passwordSuggestions.value = data.suggestions;
      }
      turnstile.reset(); // Always reset widget on failure
    }
  } catch {
    errorMessage.value = 'Gagal menghubungi server. Periksa koneksi Anda.';
  }
}
```

---

## Required Frontend Validations

Run these **before** the API call to provide instant feedback. The backend enforces all of them too — frontend validation is UX only, not a security boundary.

### Validation Rules

| Rule | Requirement | Notes |
|---|---|---|
| Current password present | Non-empty string | No trim — spaces are valid in passwords |
| New password present | Non-empty string | |
| New password min length | >= 8 characters | NIST SP 800-63B minimum |
| New password max length | <= 128 characters | Prevent bcrypt preimage DoS |
| New != Current (string level) | Must differ | Quick UX check; backend also checks |
| Confirm password matches new | Must match | Only on frontend — backend receives only `newPassword` |
| Password strength | `zxcvbn(newPassword).score >= 2` | Use `zxcvbn` npm package |
| No current email in password | Pass `[userEmail]` as user inputs to zxcvbn | Penalises email-derived passwords |

### Recommended zxcvbn Integration

```ts
import zxcvbn from 'zxcvbn';

function validate(): boolean {
  if (!currentPassword) {
    return setError('Kata sandi saat ini wajib diisi.');
  }
  if (!newPassword || newPassword.length < 8) {
    return setError('Kata sandi baru minimal 8 karakter.');
  }
  if (newPassword.length > 128) {
    return setError('Kata sandi baru maksimal 128 karakter.');
  }
  if (newPassword === currentPassword) {
    return setError('Kata sandi baru tidak boleh sama dengan yang lama.');
  }
  if (newPassword !== confirmPassword) {
    return setError('Konfirmasi kata sandi tidak cocok.');
  }

  const result = zxcvbn(newPassword, [userEmail]);
  if (result.score < 2) {
    setError('Kata sandi terlalu lemah.');
    setSuggestions(result.feedback.suggestions);
    return false;
  }

  return true;
}
```

### Password Strength Meter UX

Map `zxcvbn` score to a visual bar:

| Score | Label | Color |
|---|---|---|
| 0 | Sangat Lemah | Red |
| 1 | Lemah | Orange |
| 2 | Cukup | Yellow |
| 3 | Kuat | Light Green |
| 4 | Sangat Kuat | Green |

Only allow form submission at score >= 2.

---

## Account Type Guard

If the currently logged-in user authenticated via Google OAuth and has no local password, the backend will return a `400` error. You can check this upfront using the `/api/auth/me` response (or your Pinia store) — if `auth_provider !== 'local'`, hide the password-change form entirely and show a message like:

> "Akun Anda terhubung melalui Google. Ganti kata sandi melalui pengaturan akun Google Anda."

---

## Post-Success UX

After a `200` response with `sessionInvalidated: true`:

1. **Clear the access token** from memory (Pinia store, `ref`, etc.)
2. **Do not call `/api/auth/refresh`** — the refresh token is revoked
3. **Redirect to `/login`** with a query param for a contextual message:
   ```
   /login?reason=password_changed
   ```
4. On the login page, detect `?reason=password_changed` and show:
   > "Kata sandi Anda berhasil diperbarui. Silakan login kembali."

---

## Security Notes for Frontend Developers

**Never** log passwords, access tokens, or CSRF tokens to the console, even in development.

**Do not** cache or store the Turnstile token — it is single-use. Always read it fresh from the widget callback for each submission.

The `confirmPassword` field is **frontend-only** — do not send it to the API. It exists solely to catch user typos before the form is submitted.

The access token issued before the password change is still technically valid for up to 15 minutes after a successful change. This is an accepted trade-off (access tokens are short-lived by design). The refresh token is immediately revoked, so no new access tokens can be issued.
