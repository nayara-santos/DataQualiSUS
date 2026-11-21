/** Enumerações do modelo (P2, MOD-10) e configuração das regras armazenada como JSON (ADR-002). */
export enum DimensaoQualidade {
  UNICIDADE = 'UNICIDADE',
  COMPLETUDE = 'COMPLETUDE',
  VALIDADE = 'VALIDADE',
}

/** Tipos declarados pelo analista (P1, seção 8.3). Códigos clínicos são texto. */
export enum TipoColuna {
  TEXTO = 'TEXTO',
  DECIMAL = 'DECIMAL',
  DATA = 'DATA',
}

export enum Combinador {
  E = 'E',
  OU = 'OU',
}

/** TipoAcao: catálogo fechado de quatro ações (P1, seção 8.3). */
export enum TipoAcao {
  APARAR_ESPACOS = 'APARAR_ESPACOS',
  CONVERTER_CAIXA = 'CONVERTER_CAIXA',
  PREENCHER_VAZIO = 'PREENCHER_VAZIO',
  REMOVER_REPETICOES = 'REMOVER_REPETICOES',
}

export enum Caixa {
  MAIUSCULAS = 'MAIUSCULAS',
  MINUSCULAS = 'MINUSCULAS',
}

export interface ColunaTipada {
  nome: string;
  tipo: TipoColuna;
}

export interface Condicao {
  coluna: string;
  tipo: TipoColuna;
  operador: string;
  valor?: string;
  valores?: string[];
  vocabularioId?: string;
}

export interface ConfiguracaoAcao {
  tipo: TipoAcao;
  coluna?: string;
  caixa?: Caixa;
  valor?: string;
}

export interface ConfiguracaoUnicidade {
  dimensao: DimensaoQualidade.UNICIDADE;
  colunas: ColunaTipada[];
  acao?: ConfiguracaoAcao;
}

export interface ConfiguracaoCompletude {
  dimensao: DimensaoQualidade.COMPLETUDE;
  colunas: ColunaTipada[];
  marcadoresAusencia?: string[];
  acao?: ConfiguracaoAcao;
}

export interface ConfiguracaoValidade {
  dimensao: DimensaoQualidade.VALIDADE;
  combinador: Combinador;
  condicoes: Condicao[];
  acao?: ConfiguracaoAcao;
}

export type ConfiguracaoRegra = ConfiguracaoUnicidade | ConfiguracaoCompletude | ConfiguracaoValidade;

/** Regra pronta para execução: identificação da revisão + configuração validada. */
export interface RegraExecutavel {
  regraId: string;
  revisao: number;
  nome: string;
  ordem: number;
  configuracao: ConfiguracaoRegra;
}

/** Colunas referenciadas por uma configuração, com o tipo declarado. */
export function colunasDaRegra(configuracao: ConfiguracaoRegra): ColunaTipada[] {
  if (configuracao.dimensao === DimensaoQualidade.VALIDADE) {
    const vistas = new Map<string, ColunaTipada>();
    for (const c of configuracao.condicoes) {
      vistas.set(c.coluna, { nome: c.coluna, tipo: c.tipo });
    }
    return [...vistas.values()];
  }
  return configuracao.colunas;
}

/** Ações que escrevem em uma coluna (a remoção de repetições remove linhas). */
export const ACOES_DE_ESCRITA: readonly TipoAcao[] = [
  TipoAcao.APARAR_ESPACOS,
  TipoAcao.CONVERTER_CAIXA,
  TipoAcao.PREENCHER_VAZIO,
];
