import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { extractRequestActor } from '../utils/actor.js';
import { extractRequestContext } from '../utils/requestContext.js';
import {
  UserServiceError,
  getUsersList,
  getRolesList,
  createAdminUser,
  reactivateExistingUser,
  updateUserRoleService,
  changeUserPasswordService,
  deleteUserService,
} from '../services/users.service.js';

export const getUsers = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const users = await getUsersList();
    return res.status(200).json({ users });
  } catch (error) {
    console.error('Error saat mengambil daftar pengguna:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const getRoles = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const roles = await getRolesList();
    return res.status(200).json({ roles });
  } catch (error) {
    console.error('Error saat mengambil daftar role:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const createUser = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const newUser = await createAdminUser(
      req.body,
      extractRequestActor(req),
      extractRequestContext(req),
    );
    return res.status(201).json({
      message: 'Pengguna berhasil dibuat.',
      user: newUser,
    });
  } catch (error) {
    if (error instanceof UserServiceError) {
      return res.status(error.statusCode).json({
        error: error.message,
        ...(error.suggestions ? { suggestions: error.suggestions } : {}),
      });
    }

    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ error: 'Email ini sudah dipakai' });
    }

    console.error(
      'Error saat membuat pengguna:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const reactivateUser = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const updatedUser = await reactivateExistingUser(
      id,
      extractRequestActor(req),
      extractRequestContext(req),
    );
    return res.status(200).json({
      message: 'Pengguna berhasil diaktifkan kembali.',
      user: updatedUser,
    });
  } catch (error) {
    if (error instanceof UserServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error(
      'Error saat mengaktifkan kembali pengguna:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const updateUserRole = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const { roleId } = req.body;
    const actor = extractRequestActor(req);

    const updatedUser = await updateUserRoleService({
      id,
      roleId,
      requestingUserId: actor?.id ?? null,
      actor,
      context: extractRequestContext(req),
    });
    return res.status(200).json({
      message: 'Role pengguna berhasil diperbarui.',
      user: updatedUser,
    });
  } catch (error) {
    if (error instanceof UserServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error(
      'Error saat memperbarui role pengguna:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const changeUserPassword = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const actor = extractRequestActor(req);

    await changeUserPasswordService({
      id,
      password,
      requestingUserId: actor?.id ?? null,
      actor,
      context: extractRequestContext(req),
    });
    return res.status(200).json({ message: 'Password pengguna berhasil diperbarui.' });
  } catch (error) {
    if (error instanceof UserServiceError) {
      return res.status(error.statusCode).json({
        error: error.message,
        ...(error.suggestions ? { suggestions: error.suggestions } : {}),
      });
    }

    console.error(
      'Error saat mengubah password pengguna:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const deleteUser = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const actor = extractRequestActor(req);

    await deleteUserService({
      id,
      requestingUserId: actor?.id ?? null,
      actor,
      context: extractRequestContext(req),
    });
    return res.status(200).json({ message: 'Pengguna berhasil dinonaktifkan.' });
  } catch (error) {
    if (error instanceof UserServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error(
      'Error saat menghapus pengguna:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};
