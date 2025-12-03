import type { IronSessionOptions } from 'iron-session';

export type SessionData = {
  user?: {
    uid: string;
    email?: string | null;
  };
  isLoggedIn: boolean;
};

export const sessionOptions: IronSessionOptions = {
  cookieName: 'offertehulp_session',
  password: process.env.SECRET_COOKIE_PASSWORD as string,
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  },
};
