import { PapelUsuario } from './papel-usuario';

/**
 * Operações protegidas da API. Cada rota declara exatamente uma operação; rotas sem operação
 * declarada são negadas por padrão pelo AutorizacaoGuard.
 */
export enum Operacao {
  SESSAO_PROPRIA = 'SESSAO_PROPRIA',
  // RF001 — Manter datasets
  DATASET_IMPORTAR = 'DATASET_IMPORTAR',
  DATASET_LISTAR = 'DATASET_LISTAR',
  DATASET_CONSULTAR = 'DATASET_CONSULTAR',
  DATASET_EDITAR_METADADOS = 'DATASET_EDITAR_METADADOS',
  DATASET_NOVA_VERSAO = 'DATASET_NOVA_VERSAO',
  DATASET_EXCLUIR = 'DATASET_EXCLUIR',
  // RF002 — Configurar regras visuais (inclui consulta aos vocabulários disponíveis)
  REGRA_CONSULTAR = 'REGRA_CONSULTAR',
  REGRA_MANTER = 'REGRA_MANTER',
  CONJUNTO_CONSULTAR = 'CONJUNTO_CONSULTAR',
  CONJUNTO_MANTER = 'CONJUNTO_MANTER',
  CONJUNTO_ASSOCIAR = 'CONJUNTO_ASSOCIAR',
  VOCABULARIO_CONSULTAR = 'VOCABULARIO_CONSULTAR',
  // RF003 — Validar regras de tratamento (simulação)
  SIMULACAO_EXECUTAR = 'SIMULACAO_EXECUTAR',
  SIMULACAO_CONSULTAR = 'SIMULACAO_CONSULTAR',
  // RF004 — Aplicar regras de tratamento
  TRATAMENTO_APLICAR = 'TRATAMENTO_APLICAR',
  // RF005 — Diagnóstico
  DIAGNOSTICO_CONSULTAR = 'DIAGNOSTICO_CONSULTAR',
  DIAGNOSTICO_EXPORTAR = 'DIAGNOSTICO_EXPORTAR',
  // RF006 — Auditoria
  AUDITORIA_CONSULTAR = 'AUDITORIA_CONSULTAR',
  AUDITORIA_EXPORTAR = 'AUDITORIA_EXPORTAR',
}

const TODOS = [PapelUsuario.ANALISTA, PapelUsuario.GESTOR, PapelUsuario.EQUIPE_TECNICA];
const ANALISTA = [PapelUsuario.ANALISTA];
const ANALISTA_GESTOR = [PapelUsuario.ANALISTA, PapelUsuario.GESTOR];

/**
 * Matriz perfil × operação da P1, seção 8.3, e do UC-08 da P2:
 * analista RF001–RF006; gestor RF005–RF006; equipe técnica RF006; RF007 comum aos três.
 */
export const MATRIZ_PERMISSOES: Readonly<Record<Operacao, readonly PapelUsuario[]>> = {
  [Operacao.SESSAO_PROPRIA]: TODOS,
  [Operacao.DATASET_IMPORTAR]: ANALISTA,
  [Operacao.DATASET_LISTAR]: ANALISTA,
  [Operacao.DATASET_CONSULTAR]: ANALISTA,
  [Operacao.DATASET_EDITAR_METADADOS]: ANALISTA,
  [Operacao.DATASET_NOVA_VERSAO]: ANALISTA,
  [Operacao.DATASET_EXCLUIR]: ANALISTA,
  [Operacao.REGRA_CONSULTAR]: ANALISTA,
  [Operacao.REGRA_MANTER]: ANALISTA,
  [Operacao.CONJUNTO_CONSULTAR]: ANALISTA,
  [Operacao.CONJUNTO_MANTER]: ANALISTA,
  [Operacao.CONJUNTO_ASSOCIAR]: ANALISTA,
  [Operacao.VOCABULARIO_CONSULTAR]: ANALISTA,
  [Operacao.SIMULACAO_EXECUTAR]: ANALISTA,
  [Operacao.SIMULACAO_CONSULTAR]: ANALISTA,
  [Operacao.TRATAMENTO_APLICAR]: ANALISTA,
  [Operacao.DIAGNOSTICO_CONSULTAR]: ANALISTA_GESTOR,
  [Operacao.DIAGNOSTICO_EXPORTAR]: ANALISTA_GESTOR,
  [Operacao.AUDITORIA_CONSULTAR]: TODOS,
  [Operacao.AUDITORIA_EXPORTAR]: TODOS,
};

/** verificarPermissao(perfil, operação) da interface do AutorizacaoGuard (P2, seção 2). */
export function verificarPermissao(papel: PapelUsuario, operacao: Operacao | undefined): boolean {
  if (!operacao) {
    return false;
  }
  return MATRIZ_PERMISSOES[operacao]?.includes(papel) ?? false;
}

/** Operações liberadas para o perfil, devolvidas na sessão para a interface ocultar ações vedadas. */
export function operacoesDoPapel(papel: PapelUsuario): Operacao[] {
  return (Object.keys(MATRIZ_PERMISSOES) as Operacao[]).filter((operacao) =>
    MATRIZ_PERMISSOES[operacao].includes(papel),
  );
}
