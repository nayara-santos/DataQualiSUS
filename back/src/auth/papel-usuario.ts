/** Perfis previstos na P1, seção 8.3, e na P2 (MOD-10, PapelUsuario). */
export enum PapelUsuario {
  ANALISTA = 'ANALISTA',
  GESTOR = 'GESTOR',
  EQUIPE_TECNICA = 'EQUIPE_TECNICA',
}

/** Usuário vinculado à sessão validada no servidor (UC-08). */
export interface UsuarioAutenticado {
  id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
  sessaoId: string;
  csrfToken: string;
}
