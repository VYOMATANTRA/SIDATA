// Shared test infra: a chainable Express Response recorder. Controllers under test call
// res.status(code).json(body) / res.cookie(...) / res.clearCookie(...) exactly once per
// branch, so `status`/`body` self-overwrite from method to recorded value on first call —
// letting tests read `res.status`/`res.body` back as plain values instead of inspecting
// call history.

import type { Response } from 'express';

export interface FakeCookie {
  value: string;
  options?: Record<string, unknown>;
}

export interface FakeRes {
  status: number | undefined;
  body: unknown;
  cookies: Record<string, FakeCookie>;
  clearedCookies: Array<{ name: string; options?: Record<string, unknown> }>;
}

export function fakeRes(): FakeRes & Response {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- self-mutating recorder; the exported shape (FakeRes & Response) is what callers see.
  const res: any = {
    status(code: number) {
      res.status = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
    cookie(name: string, value: string, options?: Record<string, unknown>) {
      res.cookies[name] = { value, options };
      return res;
    },
    clearCookie(name: string, options?: Record<string, unknown>) {
      res.clearedCookies.push({ name, options });
      return res;
    },
    cookies: {},
    clearedCookies: [],
    body: undefined,
  };

  return res as FakeRes & Response;
}
