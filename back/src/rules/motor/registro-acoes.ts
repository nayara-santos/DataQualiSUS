import { estaVazio } from './conversao';
import { Caixa, ConfiguracaoAcao, DimensaoQualidade, TipoAcao, TipoColuna } from './tipos';

export interface DefinicaoAcao {
  tipo: TipoAcao;
  rotulo: string;
  dimensoes: readonly DimensaoQualidade[];
  /** Tipos de coluna aceitos pela ação de escrita; vazio para a remoção de repetições. */
  tiposColuna: readonly TipoColuna[];
  /** Transforma o valor de uma célula; a remoção de repetições é tratada pelo motor. */
  transformar?(valor: string, acao: ConfiguracaoAcao): string;
}

/**
 * Registro do catálogo fechado de ações (P1, seção 8.3; ADR-002). Nenhuma ação infere valores
 * ou gera códigos clínicos: o preenchimento usa somente o literal configurado pelo analista.
 */
export const REGISTRO_ACOES: Readonly<Record<TipoAcao, DefinicaoAcao>> = {
  [TipoAcao.APARAR_ESPACOS]: {
    tipo: TipoAcao.APARAR_ESPACOS,
    rotulo: 'Aparar espaços nas extremidades',
    dimensoes: [DimensaoQualidade.COMPLETUDE, DimensaoQualidade.VALIDADE],
    tiposColuna: [TipoColuna.TEXTO],
    transformar: (valor) => valor.trim(),
  },
  [TipoAcao.CONVERTER_CAIXA]: {
    tipo: TipoAcao.CONVERTER_CAIXA,
    rotulo: 'Converter para maiúsculas ou minúsculas',
    dimensoes: [DimensaoQualidade.COMPLETUDE, DimensaoQualidade.VALIDADE],
    tiposColuna: [TipoColuna.TEXTO],
    transformar: (valor, acao) =>
      acao.caixa === Caixa.MINUSCULAS ? valor.toLocaleLowerCase('pt-BR') : valor.toLocaleUpperCase('pt-BR'),
  },
  [TipoAcao.PREENCHER_VAZIO]: {
    tipo: TipoAcao.PREENCHER_VAZIO,
    rotulo: 'Preencher campo vazio com literal',
    dimensoes: [DimensaoQualidade.COMPLETUDE, DimensaoQualidade.VALIDADE],
    tiposColuna: [TipoColuna.TEXTO, TipoColuna.DECIMAL, TipoColuna.DATA],
    transformar: (valor, acao) => (estaVazio(valor) ? (acao.valor ?? valor) : valor),
  },
  [TipoAcao.REMOVER_REPETICOES]: {
    tipo: TipoAcao.REMOVER_REPETICOES,
    rotulo: 'Remover repetições mantendo a primeira ocorrência',
    dimensoes: [DimensaoQualidade.UNICIDADE],
    tiposColuna: [],
  },
};
