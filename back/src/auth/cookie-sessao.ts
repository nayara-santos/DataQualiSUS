import { CookieOptions } from 'express';

export const NOME_COOKIE_SESSAO = 'dq_sessao';

/** Cookie HttpOnly, Secure e SameSite=Lax conforme ADR-006. */
export function opcoesCookieSessao(expiraEm?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api',
    ...(expiraEm ? { expires: expiraEm } : {}),
  };
}
