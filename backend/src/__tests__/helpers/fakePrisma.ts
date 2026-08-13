// Shared test infra: installs stubs onto the real `prisma` singleton for the models the
// OTP/auth mechanism touches (user, role, emailOtp, refreshToken), driven by a small
// declarative state object instead of per-test save/restore boilerplate.
//
// Every standard CRUD method on those models is replaced — either with behavior derived
// from `state`, or (for methods a given test never declares a need for) with a stub that
// throws "unexpected DB call". That's what makes assertions like "the OTP table was never
// queried" meaningful: if code under test reaches a method the test didn't anticipate, the
// test fails loudly instead of silently hitting a real (absent) database.
//
// `overrides` is the escape hatch for anything state-derived behavior can't express —
// forcing a specific call to throw, to assert error-handling branches.

import prisma from '../../utils/prisma.js';

type AnyRecord = Record<string, unknown>;
type AnyFn = (...args: unknown[]) => unknown;

const MODELS = ['user', 'role', 'emailOtp', 'refreshToken'] as const;
type ModelName = (typeof MODELS)[number];

// The standard Prisma Client CRUD surface. Anything a test doesn't wire via state/overrides
// falls back to a throwing stub, rather than silently falling through to the real DB adapter.
const METHODS = [
  'findUnique',
  'findFirst',
  'findMany',
  'create',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
  'count',
] as const;

export interface FakePrismaState {
  user?: AnyRecord | null;
  role?: AnyRecord | null;
  otp?: AnyRecord | null;
  overrides?: Partial<Record<ModelName, Partial<Record<string, AnyFn>>>>;
}

export interface FakePrismaHandle {
  state: { user: AnyRecord | null; role: AnyRecord | null; otp: AnyRecord | null };
  calls: Record<string, Record<string, unknown[][]>>;
  restore: () => void;
}

let otpIdCounter = 0;
let refreshTokenIdCounter = 0;
let newUserIdCounter = 0;

export function fakePrisma(initial: FakePrismaState = {}): FakePrismaHandle {
  const state = {
    user: initial.user ?? null,
    role: initial.role ?? { id: 'role-user', name: 'user' },
    otp: initial.otp ?? null,
  };

  const calls: Record<string, Record<string, unknown[][]>> = {};
  const originals: Array<{ model: ModelName; method: string; fn: unknown }> = [];

  function record(model: ModelName, method: string, args: unknown[]) {
    calls[model] ??= {};
    calls[model][method] ??= [];
    calls[model][method]!.push(args);
  }

  // Behavior derived from `state` for the methods each controller actually calls.
  // Anything not listed here for a given model falls back to the throwing default below.
  const derived: Partial<Record<ModelName, Partial<Record<string, AnyFn>>>> = {
    user: {
      findUnique: () => (state.user ? { ...state.user, role: { ...state.role } } : null),
      update: (...args: unknown[]) => {
        const { data } = args[0] as { data: AnyRecord };
        if (!state.user) throw new Error('fakePrisma: user.update called with no user in state');
        Object.assign(state.user, data);
        return { ...state.user };
      },
      create: (...args: unknown[]) => {
        const { data } = args[0] as { data: AnyRecord };
        state.user = {
          id: `new-user-${++newUserIdCounter}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        return { ...state.user };
      },
    },
    role: {
      findUnique: () => (state.role ? { ...state.role } : null),
    },
    emailOtp: {
      findFirst: () => (state.otp ? { ...state.otp } : null),
      create: (...args: unknown[]) => {
        const { data } = args[0] as { data: AnyRecord };
        state.otp = { id: `otp-${++otpIdCounter}`, attempts: 0, createdAt: new Date(), ...data };
        return { ...state.otp };
      },
      update: (...args: unknown[]) => {
        const { data } = args[0] as { data: AnyRecord };
        if (!state.otp) throw new Error('fakePrisma: emailOtp.update called with no otp in state');
        const increment = data.attempts as { increment?: number } | undefined;
        if (increment && typeof increment === 'object' && 'increment' in increment) {
          state.otp.attempts = (state.otp.attempts as number) + (increment.increment ?? 0);
        } else {
          Object.assign(state.otp, data);
        }
        return { ...state.otp };
      },
      delete: () => {
        state.otp = null;
        return {};
      },
      deleteMany: () => {
        const count = state.otp ? 1 : 0;
        state.otp = null;
        return { count };
      },
    },
    refreshToken: {
      create: (...args: unknown[]) => {
        const { data } = args[0] as { data: AnyRecord };
        return { id: ++refreshTokenIdCounter, createdAt: new Date(), isRevoked: false, ...data };
      },
    },
  };

  for (const model of MODELS) {
    const target = (prisma as unknown as Record<string, Record<string, AnyFn>>)[model]!;

    for (const method of METHODS) {
      originals.push({ model, method, fn: target[method] });

      const override = initial.overrides?.[model]?.[method];
      const fallback = derived[model]?.[method];

      target[method] = (async (...args: unknown[]) => {
        record(model, method, args);

        if (override) return override(...args);
        if (fallback) return fallback(...args);

        throw new Error(
          `fakePrisma: unexpected DB call prisma.${model}.${method}() — not stubbed for this test. ` +
            `Pass state or an override if this call is expected.`,
        );
      }) as unknown as AnyFn;
    }
  }

  return {
    state,
    calls,
    restore() {
      for (const { model, method, fn } of originals) {
        (prisma as unknown as Record<string, Record<string, AnyFn>>)[model]![method] = fn as AnyFn;
      }
    },
  };
}
