import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { extractRequestActor, type RequestActor } from '../utils/actor.js';
import { extractRequestContext } from '../utils/requestContext.js';
import { sendHierarchyError, parseExpectedUpdatedAtQuery } from '../utils/hierarchyAuthoring.js';
import type { AuditRequestContext } from '../services/audit.service.js';

interface AuthoringHandlerOptions {
  /** Used in the server log line when an unexpected error occurs. */
  errorLabel: string;
  successStatus?: number;
  run: (
    req: AuthRequest,
    actor: RequestActor,
    context: AuditRequestContext,
  ) => Promise<Record<string, unknown>>;
}

/**
 * Shared wrapper for the Cerita authoring controllers: resolves the audit actor (401 without
 * one), runs the service call, and maps `HierarchyServiceError` to `{error, code?, details?}`
 * with its status. Anything else is logged without the payload and returned as a plain 500.
 */
export function authoringHandler(options: AuthoringHandlerOptions) {
  return async (req: AuthRequest, res: Response): Promise<Response | void> => {
    try {
      const actor = extractRequestActor(req);
      if (!actor) {
        return res.status(401).json({ error: 'Akses ditolak. Pengguna belum terautentikasi.' });
      }
      const payload = await options.run(req, actor, extractRequestContext(req));
      return res.status(options.successStatus ?? 200).json(payload);
    } catch (error) {
      if (sendHierarchyError(res, error)) {
        return;
      }
      console.error(
        `Error saat ${options.errorLabel}:`,
        error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
      );
      return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
    }
  };
}

/** `expectedUpdatedAt` for DELETE endpoints travels in the query string (no request body). */
export function expectedUpdatedAtFromQuery(req: AuthRequest): string {
  return parseExpectedUpdatedAtQuery(req.query?.['expectedUpdatedAt']);
}

export function paramOf(req: AuthRequest, name: string): string {
  const value = req.params[name];
  return typeof value === 'string' ? value : '';
}
