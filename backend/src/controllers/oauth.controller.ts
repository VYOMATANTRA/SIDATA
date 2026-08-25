import type { Request, Response } from 'express';
import { CodeChallengeMethod } from 'google-auth-library';
import prisma from '../utils/prisma.js';
import { issueSession } from '../utils/session.js';
import {
  getOAuth2Client,
  generateOAuthState,
  createPkcePair,
  setOAuthCookies,
  clearOAuthCookies,
  verifyGoogleIdToken,
} from '../utils/oauth.js';
import { decryptCookieValue } from '../utils/cookieSecurity.js';
import {
  GOOGLE_CALLBACK_URL,
  GOOGLE_OAUTH_SUCCESS_REDIRECT,
  GOOGLE_OAUTH_FAILURE_REDIRECT,
} from '../configs/index.js';

function buildFailureRedirect(reason: string): string {
  const url = new URL(GOOGLE_OAUTH_FAILURE_REDIRECT);
  url.searchParams.set('reason', reason);
  return url.toString();
}

export const googleLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const state = generateOAuthState();
    const { verifier, challenge } = createPkcePair();

    setOAuthCookies(res, { state, verifier });

    const client = getOAuth2Client();
    const authorizeUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      state,
      code_challenge: challenge,
      code_challenge_method: CodeChallengeMethod.S256,
      redirect_uri: GOOGLE_CALLBACK_URL,
    });

    res.redirect(authorizeUrl);
  } catch (error) {
    console.error('Error saat inisiasi Google OAuth:', error);
    res.redirect(buildFailureRedirect('init_error'));
  }
};

export const googleCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, error: queryError } = req.query;

    if (queryError) {
      clearOAuthCookies(res);
      return res.redirect(buildFailureRedirect(String(queryError)));
    }

    const rawStateCookie = req.cookies?.oauth_state;
    const rawVerifierCookie = req.cookies?.oauth_verifier;

    const savedState = decryptCookieValue(rawStateCookie);
    const savedVerifier = decryptCookieValue(rawVerifierCookie);

    if (!savedState || !state || savedState !== state) {
      clearOAuthCookies(res);
      return res.redirect(buildFailureRedirect('invalid_state'));
    }

    if (!savedVerifier || !code) {
      clearOAuthCookies(res);
      return res.redirect(buildFailureRedirect('missing_code_or_verifier'));
    }

    const client = getOAuth2Client();
    const { tokens } = await client.getToken({
      code: String(code),
      codeVerifier: savedVerifier,
      redirect_uri: GOOGLE_CALLBACK_URL,
    });

    if (!tokens.id_token) {
      clearOAuthCookies(res);
      return res.redirect(buildFailureRedirect('missing_id_token'));
    }

    const googleProfile = await verifyGoogleIdToken(tokens.id_token);

    // 1. Check if user exists by provider_id
    let user = await prisma.user.findFirst({
      where: {
        auth_provider: 'google',
        provider_id: googleProfile.sub,
      },
      include: { role: true },
    });

    if (user && user.deletedAt != null) {
      clearOAuthCookies(res);
      return res.redirect(buildFailureRedirect('account_deactivated'));
    }

    // 2. Auto-link if user exists by email
    if (!user) {
      const existingUser = await prisma.user.findUnique({
        where: { email: googleProfile.email },
        include: { role: true },
      });

      if (existingUser) {
        if (existingUser.deletedAt != null) {
          clearOAuthCookies(res);
          return res.redirect(buildFailureRedirect('account_deactivated'));
        }

        user = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            auth_provider: 'google',
            provider_id: googleProfile.sub,
            email_verified: true,
            password_hash: null,
            requires_password_change: false,
          },
          include: { role: true },
        });

        // The local password is being retired in favor of Google sign-in — revoke any
        // refresh tokens issued under it and clear requires_password_change so any
        // pending first-login setup token cannot be used to reinstate a local password.
        // Without this, a session obtained via a compromised password would keep working
        // via /api/auth/refresh even after the account moves to Google-only auth.
        await prisma.refreshToken.updateMany({
          where: { userId: existingUser.id, isRevoked: false },
          data: { isRevoked: true },
        });
      }
    }

    // 3. Create new user if not found
    if (!user) {
      const userRole = await prisma.role.findUnique({
        where: { name: 'user' },
      });

      if (!userRole) {
        clearOAuthCookies(res);
        return res.redirect(buildFailureRedirect('default_role_not_found'));
      }

      try {
        user = await prisma.user.create({
          data: {
            email: googleProfile.email,
            auth_provider: 'google',
            provider_id: googleProfile.sub,
            password_hash: null,
            email_verified: true,
            roleId: userRole.id,
          },
          include: { role: true },
        });
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'P2002') {
          const createdUser = await prisma.user.findFirst({
            where: {
              OR: [
                { email: googleProfile.email },
                { auth_provider: 'google', provider_id: googleProfile.sub },
              ],
            },
            include: { role: true },
          });

          if (createdUser) {
            if (createdUser.deletedAt != null) {
              clearOAuthCookies(res);
              return res.redirect(buildFailureRedirect('account_deactivated'));
            }
            user = createdUser;
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }

    await issueSession(res, {
      id: user.id,
      email: user.email,
      role: user.role.name,
    });

    clearOAuthCookies(res);
    res.redirect(GOOGLE_OAUTH_SUCCESS_REDIRECT);
  } catch (error) {
    console.error('Error saat callback Google OAuth:', error);
    clearOAuthCookies(res);
    res.redirect(buildFailureRedirect('callback_error'));
  }
};
