import { ConfiguracaoRegra, DimensaoQualidade } from './motor/tipos';

export enum SituacaoCadastro {
  ATIVO = 'ATIVO',
  EXCLUIDO_LOGICAMENTE = 'EXCLUIDO_LOGICAMENTE',
}

export interface RegraRegistro {
  id: string;
  nome: string;
  descricao: string;
  dimensao: DimensaoQualidade;
  revisao_atual: number;
  situacao: SituacaoCadastro;
  criado_por: string;
  criado_em: Date;
  atualizado_em: Date;
  configuracao: ConfiguracaoRegra;
}

export interface RevisaoRegraRegistro {
  regra_id: string;
  revisao: number;
  nome: string;
  descricao: string;
  dimensao: DimensaoQualidade;
  configuracao: ConfiguracaoRegra;
  criado_por: string;
  criado_em: Date;
}

export interface ItemConjunto {
  regraId: string;
  regraRevisao: number;
  ordem: number;
}

export interface ConjuntoRegistro {
  id: string;
  nome: string;
  descricao: string;
  revisao_atual: number;
  situacao: SituacaoCadastro;
  criado_por: string;
  criado_em: Date;
  atualizado_em: Date;
  itens: ItemConjunto[];
}

export interface RevisaoConjuntoRegistro {
  conjunto_id: string;
  revisao: number;
  nome: string;
  descricao: string;
  itens: ItemConjunto[];
  motivo: string;
  criado_por: string;
  criado_em: Date;
}

export interface RegraDto {
  id: string;
  nome: string;
  descricao: string;
  dimensao: DimensaoQualidade;
  revisao: number;
  situacao: SituacaoCadastro;
  configuracao: ConfiguracaoRegra;
  criadoEm: string;
  atualizadoEm: string;
}

export interface RegraNoConjuntoDto {
  ordem: number;
  regraId: string;
  revisao: number;
  nome: string;
  dimensao: DimensaoQualidade;
  configuracao: ConfiguracaoRegra;
}

export interface ConjuntoDto {
  id: string;
  nome: string;
  descricao: string;
  revisao: number;
  situacao: SituacaoCadastro;
  regras: RegraNoConjuntoDto[];
  datasets: string[];
  criadoEm: string;
  atualizadoEm: string;
}

export function paraRegraDto(r: RegraRegistro): RegraDto {
  return {
    id: r.id,
    nome: r.nome,
    descricao: r.descricao,
    dimensao: r.dimensao,
    revisao: r.revisao_atual,
    situacao: r.situacao,
    configuracao: r.configuracao,
    criadoEm: new Date(r.criado_em).toISOString(),
    atualizadoEm: new Date(r.atualizado_em).toISOString(),
  };
}

/** Configuração congelada de um conjunto em uma revisão, usada pela simulação (MOD-12). */
export interface ConjuntoParaExecucao {
  conjuntoId: string;
  nome: string;
  revisao: number;
  regras: RegraNoConjuntoDto[];
}
