import 'dotenv/config';

export const PORT = process.env.PORT;
export const VITE_API_URL = process.env.VITE_API_URL;

export const JWT_SECRET = process.env.JWT_SECRET as string;
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;
