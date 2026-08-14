// Shared test infra: `sendOtpEmail` (utils/mailer.ts) calls the global `fetch` against the
// Resend REST API directly — no injected client to mock — so this swaps `globalThis.fetch`
// for the duration of a test. It captures the real, randomly-generated OTP out of the
// request body (embedded in the subject line) so tests can drive a genuine resend -> verify
// round trip without predicting the code in advance.
//
// Both of mailer.ts's failure branches `console.log`/`console.error` unconditionally
// (including the raw OTP) — silenced by default so failure-path tests don't spam output.

export interface FakeMailerOptions {
  /** Whether the simulated Resend API call reports success. Default true. */
  ok?: boolean;
  /** Whether `fetch` itself throws (network failure) instead of resolving. Default false. */
  reject?: boolean;
  /** Silence mailer.ts's console.log/console.error during this stub's lifetime. Default true. */
  silenceConsole?: boolean;
}

export interface FakeMailerSend {
  to: string;
  otp: string;
  subject: string;
}

export interface FakeMailerHandle {
  sent: FakeMailerSend[];
  readonly lastOtp: string | undefined;
  restore: () => void;
}

export function fakeMailer(options: FakeMailerOptions = {}): FakeMailerHandle {
  const { ok = true, reject = false, silenceConsole = true } = options;

  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalError = console.error;

  if (silenceConsole) {
    console.log = () => {};
    console.error = () => {};
  }

  const sent: FakeMailerSend[] = [];

  globalThis.fetch = (async (_url: string, init?: Parameters<typeof fetch>[1]) => {
    const body = JSON.parse((init?.body as string) ?? '{}') as { to: string[]; subject: string };
    const otp = body.subject.match(/(\d{6})/)?.[1] ?? '';
    sent.push({ to: body.to[0]!, otp, subject: body.subject });

    if (reject) {
      throw new Error('fakeMailer: simulated network failure');
    }

    return {
      ok,
      json: async () => (ok ? {} : { message: 'fakeMailer: simulated Resend API failure' }),
    } as Response;
  }) as typeof fetch;

  return {
    sent,
    get lastOtp() {
      return sent.at(-1)?.otp;
    },
    restore() {
      globalThis.fetch = originalFetch;
      if (silenceConsole) {
        console.log = originalLog;
        console.error = originalError;
      }
    },
  };
}
