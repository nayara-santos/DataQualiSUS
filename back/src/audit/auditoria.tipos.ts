import { TipoAlteracao } from '../rules/motor/motor-regras';
import { TipoAcao } from '../rules/motor/tipos';

export interface NovoExtrato {
  simulacaoId: string;
  datasetId: string;
  usuarioId: string;
  versaoEntradaId: string;
  versaoSaidaId: string;
  conjuntoId: string;
  conjuntoRevisao: number;
  revisoesRegras: { regraId: string; revisao: number; nome: string; ordem: number }[];
  acoesAplicadas: { ordem: number; regraId: string; acao: TipoAcao; coluna: string | null }[];
  totalLinhasAlteradas: number;
  totalLinhasRemovidas: number;
}

export interface ExtratoRegistro {
  id: string;
  operacao: string;
  simulacao_id: string;
  dataset_id: string;
  dataset_nome: string;
  dataset_situacao: string;
  usuario_id: string;
  instante_utc: Date;
  versao_entrada_id: string;
  versao_entrada_numero: number;
  versao_entrada_hash: string;
  versao_saida_id: string;
  versao_saida_numero: number;
  versao_saida_hash: string;
  conjunto_id: string;
  conjunto_revisao: number;
  revisoes_regras: NovoExtrato['revisoesRegras'];
  acoes_aplicadas: NovoExtrato['acoesAplicadas'];
  total_linhas_alteradas: number;
  total_linhas_removidas: number;
  total_linhas_afetadas: number;
  total_alteracoes: string;
}

export interface AlteracaoDto {
  linha: number;
  tipo: TipoAlteracao;
  regraId: string;
  regraRevisao: number;
  acao: TipoAcao;
  coluna: string | null;
  valorAnterior: string | null;
  valorNovo: string | null;
  linhaRepresentante: number | null;
}

/** ExtratoDTO (ADR-007): mesmo objeto usado pela tela T07 e pela exportação em PDF. */
export interface ExtratoDto {
  id: string;
  operacao: string;
  simulacaoId: string;
  dataset: { id: string; nome: string; situacao: string };
  usuarioId: string;
  instanteUtc: string;
  versaoEntrada: { id: string; numero: number; hashSha256: string };
  versaoSaida: { id: string; numero: number; hashSha256: string };
  conjunto: { id: string; revisao: number };
  revisoesRegras: NovoExtrato['revisoesRegras'];
  acoesAplicadas: NovoExtrato['acoesAplicadas'];
  totalLinhasAlteradas: number;
  totalLinhasRemovidas: number;
  totalLinhasAfetadas: number;
  totalAlteracoes: number;
}

export interface ExtratoDetalheDto extends ExtratoDto {
  alteracoes: { pagina: number; tamanho: number; total: number; itens: AlteracaoDto[] };
}
