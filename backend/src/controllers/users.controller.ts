import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
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
    const newUser = await createAdminUser(req.body);
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

    console.error('Error saat membuat pengguna:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const reactivateUser = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const updatedUser = await reactivateExistingUser(id);
    return res.status(200).json({
      message: 'Pengguna berhasil diaktifkan kembali.',
      user: updatedUser,
    });
  } catch (error) {
    if (error instanceof UserServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error('Error saat mengaktifkan kembali pengguna:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const updateUserRole = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const { roleId } = req.body;
    const requestingUserId =
      typeof req.user === 'object' && req.user !== null ? (req.user as { id?: string }).id : null;

    const updatedUser = await updateUserRoleService({ id, roleId, requestingUserId });
    return res.status(200).json({
      message: 'Role pengguna berhasil diperbarui.',
      user: updatedUser,
    });
  } catch (error) {
    if (error instanceof UserServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error('Error saat memperbarui role pengguna:', error);
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
    const requestingUserId =
      typeof req.user === 'object' && req.user !== null ? (req.user as { id?: string }).id : null;

    await changeUserPasswordService({ id, password, requestingUserId });
    return res.status(200).json({ message: 'Password pengguna berhasil diperbarui.' });
  } catch (error) {
    if (error instanceof UserServiceError) {
      return res.status(error.statusCode).json({
        error: error.message,
        ...(error.suggestions ? { suggestions: error.suggestions } : {}),
      });
    }

    console.error('Error saat mengubah password pengguna:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const deleteUser = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const requestingUserId =
      typeof req.user === 'object' && req.user !== null ? (req.user as { id?: string }).id : null;

    await deleteUserService({ id, requestingUserId });
    return res.status(200).json({ message: 'Pengguna berhasil dinonaktifkan.' });
  } catch (error) {
    if (error instanceof UserServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error('Error saat menghapus pengguna:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};
