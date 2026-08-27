import type { AuthRequest } from '../middlewares/auth.middleware.js';

export interface RequestActor {
  id: string;
  email: string | null;
  role: string | null;
}

/**
 * Narrows `req.user` (set by verifyToken from the DB, see auth.middleware.ts) into the
 * `{ id, email, role }` shape audit entries need. Centralizes what used to be three identical
 * inline narrowing blocks in users.controller.ts that only ever read `.id`.
 */
export function extractRequestActor(req: AuthRequest): RequestActor | null {
  const user = req.user;
  if (typeof user !== 'object' || user === null || !('id' in user) || typeof user.id !== 'string') {
    return null;
  }

  const email = 'email' in user && typeof user.email === 'string' ? user.email : null;
  const role = 'role' in user && typeof user.role === 'string' ? user.role : null;

  return { id: user.id, email, role };
}
