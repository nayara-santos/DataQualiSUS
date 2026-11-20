/** SituacaoCadastro (MOD-10/MOD-15). */
export enum SituacaoDataset {
  ATIVO = 'ATIVO',
  EXCLUIDO_LOGICAMENTE = 'EXCLUIDO_LOGICAMENTE',
}

export enum OrigemVersao {
  IMPORTACAO = 'IMPORTACAO',
  TRATAMENTO = 'TRATAMENTO',
}

export interface DatasetRegistro {
  id: string;
  nome: string;
  descricao: string;
  situacao: SituacaoDataset;
  criado_por: string;
  criado_em: Date;
  atualizado_em: Date;
  excluido_em: Date | null;
  excluido_por: string | null;
}

export interface VersaoRegistro {
  id: string;
  dataset_id: string;
  numero: number;
  versao_predecessora_id: string | null;
  origem: OrigemVersao;
  hash_sha256: string;
  caminho_arquivo: string;
  nome_arquivo_original: string | null;
  tamanho_bytes: string | number;
  separador: ',' | ';';
  colunas: string[];
  total_registros: number;
  total_colunas: number;
  criado_por: string;
  criado_em: Date;
}

export interface VersaoDto {
  id: string;
  datasetId: string;
  numero: number;
  versaoPredecessoraId: string | null;
  origem: OrigemVersao;
  hashSha256: string;
  tamanhoBytes: number;
  separador: ',' | ';';
  colunas: string[];
  totalRegistros: number;
  totalColunas: number;
  nomeArquivoOriginal: string | null;
  criadoPor: string;
  criadoEm: string;
}

export interface DatasetDto {
  id: string;
  nome: string;
  descricao: string;
  situacao: SituacaoDataset;
  criadoPor: string;
  criadoEm: string;
  atualizadoEm: string;
  excluidoEm: string | null;
  versaoAtual: VersaoDto | null;
  totalVersoes: number;
}

export function paraVersaoDto(v: VersaoRegistro): VersaoDto {
  return {
    id: v.id,
    datasetId: v.dataset_id,
    numero: v.numero,
    versaoPredecessoraId: v.versao_predecessora_id,
    origem: v.origem,
    hashSha256: v.hash_sha256,
    tamanhoBytes: Number(v.tamanho_bytes),
    separador: v.separador,
    colunas: v.colunas,
    totalRegistros: v.total_registros,
    totalColunas: v.total_colunas,
    nomeArquivoOriginal: v.nome_arquivo_original,
    criadoPor: v.criado_por,
    criadoEm: new Date(v.criado_em).toISOString(),
  };
}

export function paraDatasetDto(
  d: DatasetRegistro,
  versaoAtual: VersaoRegistro | null,
  totalVersoes: number,
): DatasetDto {
  return {
    id: d.id,
    nome: d.nome,
    descricao: d.descricao,
    situacao: d.situacao,
    criadoPor: d.criado_por,
    criadoEm: new Date(d.criado_em).toISOString(),
    atualizadoEm: new Date(d.atualizado_em).toISOString(),
    excluidoEm: d.excluido_em ? new Date(d.excluido_em).toISOString() : null,
    versaoAtual: versaoAtual ? paraVersaoDto(versaoAtual) : null,
    totalVersoes,
  };
}

export interface DatasetDetalheDto extends DatasetDto {
  versoes: VersaoDto[];
}

export interface PaginaRegistrosDto {
  versaoId: string;
  colunas: string[];
  pagina: number;
  tamanho: number;
  totalRegistros: number;
  registros: { linha: number; valores: Record<string, string> }[];
}
