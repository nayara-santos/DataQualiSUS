import { LinhaPrevia } from '../rules/motor/motor-regras';
import { ColunaTipada, DimensaoQualidade, RegraExecutavel, TipoAcao } from '../rules/motor/tipos';

/** StatusSimulacao (MOD-10). */
export enum StatusSimulacao {
  EM_EXECUCAO = 'EM_EXECUCAO',
  CONCLUIDA = 'CONCLUIDA',
  TEMPO_ESGOTADO = 'TEMPO_ESGOTADO',
  FALHA = 'FALHA',
  INVALIDADA = 'INVALIDADA',
  CONSOLIDADA = 'CONSOLIDADA',
}

/** configuracaoExecutada (MOD-12): tudo o que é necessário para reconstituir a execução. */
export interface ConfiguracaoExecutada {
  versao: {
    id: string;
    datasetId: string;
    numero: number;
    hashSha256: string;
    colunas: string[];
    separador: ',' | ';';
    totalRegistros: number;
  };
  conjunto: { id: string; nome: string; revisao: number };
  regras: RegraExecutavel[];
  vocabularios: {
    id: string;
    nome: string;
    versao: string;
    origem: string;
    licenca: string;
    hashArquivo: string;
  }[];
  limiteMs: number;
}

export interface SimulacaoRegistro {
  id: string;
  versao_id: string;
  dataset_id: string;
  conjunto_id: string;
  conjunto_revisao: number;
  configuracao_executada: ConfiguracaoExecutada;
  status: StatusSimulacao;
  mensagem: string | null;
  limite_ms: number;
  aceita_em: Date;
  concluida_em: Date | null;
  invalidada_em: Date | null;
  consolidada_em: Date | null;
  hash_entrada_conferido: string | null;
  total_linhas: number | null;
  total_linhas_com_violacao: number | null;
  total_previsto_alteradas: number | null;
  total_previsto_removidas: number | null;
  previa: LinhaPrevia[] | null;
  criado_por: string;
}

export interface ResultadoRegraRegistro {
  simulacao_id: string;
  ordem: number;
  regra_id: string;
  regra_revisao: number;
  nome: string;
  dimensao: DimensaoQualidade;
  colunas: ColunaTipada[];
  total_avaliados: number;
  linhas_violadas: number[];
  total_violacoes: number;
  percentual_aprovacao: string;
  acao: TipoAcao | null;
  linhas_previstas: number;
}

export interface ResultadoRegraDto {
  ordem: number;
  regraId: string;
  revisao: number;
  nome: string;
  dimensao: DimensaoQualidade;
  colunas: string[];
  totalAvaliados: number;
  totalViolacoes: number;
  linhasVioladas: number[];
  percentualAprovacao: number;
  acao: TipoAcao | null;
  linhasPrevistas: number;
}

export interface SimulacaoDto {
  id: string;
  status: StatusSimulacao;
  mensagem: string | null;
  datasetId: string;
  versaoId: string;
  versaoNumero: number;
  conjunto: { id: string; nome: string; revisao: number };
  aceitaEm: string;
  concluidaEm: string | null;
  limiteMs: number;
  vigente: boolean;
  motivoNaoVigente: string | null;
  aplicavel: boolean;
  hashEntrada: string;
  hashEntradaConferido: string | null;
  totalLinhas: number | null;
  totalLinhasComViolacao: number | null;
  totalPrevistoAlteradas: number | null;
  totalPrevistoRemovidas: number | null;
  totalPrevistoAfetadas: number | null;
  resultados: ResultadoRegraDto[];
  previa: LinhaPrevia[];
  configuracaoExecutada: ConfiguracaoExecutada;
}

export interface Vigencia {
  vigente: boolean;
  codigo?: string;
  motivo?: string;
}
