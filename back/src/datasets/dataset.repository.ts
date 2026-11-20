import { Injectable } from '@nestjs/common';
import { DatabaseService, Executor } from '../database/database.service';
import { DatasetRegistro, OrigemVersao, SituacaoDataset, VersaoRegistro } from './dataset.tipos';

const COLUNAS_DATASET =
  'id, nome, descricao, situacao, criado_por, criado_em, atualizado_em, excluido_em, excluido_por';
const COLUNAS_VERSAO = `id, dataset_id, numero, versao_predecessora_id, origem, hash_sha256, caminho_arquivo,
  nome_arquivo_original, tamanho_bytes, separador, colunas, total_registros, total_colunas, criado_por, criado_em`;

export interface NovaVersao {
  datasetId: string;
  versaoPredecessoraId: string | null;
  origem: OrigemVersao;
  hash: string;
  caminho: string;
  nomeArquivoOriginal: string | null;
  tamanhoBytes: number;
  separador: ',' | ';';
  colunas: string[];
  totalRegistros: number;
  criadoPor: string;
}

/** Repositório de datasets e versões (consultas parametrizadas, ADR-006). */
@Injectable()
export class DatasetRepository {
  constructor(private readonly banco: DatabaseService) {}

  async inserirDataset(
    dados: { nome: string; descricao: string; criadoPor: string },
    executor: Executor,
  ): Promise<DatasetRegistro> {
    return (await this.banco.consultarUm<DatasetRegistro>(
      `INSERT INTO dataset (nome, descricao, criado_por) VALUES ($1, $2, $3) RETURNING ${COLUNAS_DATASET}`,
      [dados.nome, dados.descricao, dados.criadoPor],
      executor,
    )) as DatasetRegistro;
  }

  /** Bloqueia o dataset durante a criação de versão para numerar sem concorrência. */
  bloquearDataset(id: string, executor: Executor): Promise<DatasetRegistro | null> {
    return this.banco.consultarUm<DatasetRegistro>(
      `SELECT ${COLUNAS_DATASET} FROM dataset WHERE id = $1 FOR UPDATE`,
      [id],
      executor,
    );
  }

  async inserirVersao(dados: NovaVersao, executor: Executor): Promise<VersaoRegistro> {
    return (await this.banco.consultarUm<VersaoRegistro>(
      `INSERT INTO versao_dataset (dataset_id, numero, versao_predecessora_id, origem, hash_sha256, caminho_arquivo,
         nome_arquivo_original, tamanho_bytes, separador, colunas, total_registros, total_colunas, criado_por)
       VALUES ($1, (SELECT coalesce(max(numero), 0) + 1 FROM versao_dataset WHERE dataset_id = $1),
         $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
       RETURNING ${COLUNAS_VERSAO}`,
      [
        dados.datasetId,
        dados.versaoPredecessoraId,
        dados.origem,
        dados.hash,
        dados.caminho,
        dados.nomeArquivoOriginal,
        dados.tamanhoBytes,
        dados.separador,
        JSON.stringify(dados.colunas),
        dados.totalRegistros,
        dados.colunas.length,
        dados.criadoPor,
      ],
      executor,
    )) as VersaoRegistro;
  }

  buscarPorId(id: string, executor?: Executor): Promise<DatasetRegistro | null> {
    return this.banco.consultarUm<DatasetRegistro>(
      `SELECT ${COLUNAS_DATASET} FROM dataset WHERE id = $1`,
      [id],
      executor,
    );
  }

  listarAtivos(): Promise<DatasetRegistro[]> {
    return this.banco.consultar<DatasetRegistro>(
      `SELECT ${COLUNAS_DATASET} FROM dataset WHERE situacao = $1 ORDER BY criado_em DESC, nome`,
      [SituacaoDataset.ATIVO],
    );
  }

  buscarVersao(versaoId: string, executor?: Executor): Promise<VersaoRegistro | null> {
    return this.banco.consultarUm<VersaoRegistro>(
      `SELECT ${COLUNAS_VERSAO} FROM versao_dataset WHERE id = $1`,
      [versaoId],
      executor,
    );
  }

  listarVersoes(datasetId: string): Promise<VersaoRegistro[]> {
    return this.banco.consultar<VersaoRegistro>(
      `SELECT ${COLUNAS_VERSAO} FROM versao_dataset WHERE dataset_id = $1 ORDER BY numero`,
      [datasetId],
    );
  }

  buscarVersaoAtual(datasetId: string, executor?: Executor): Promise<VersaoRegistro | null> {
    return this.banco.consultarUm<VersaoRegistro>(
      `SELECT ${COLUNAS_VERSAO} FROM versao_dataset WHERE dataset_id = $1 ORDER BY numero DESC LIMIT 1`,
      [datasetId],
      executor,
    );
  }

  async contarVersoes(datasetIds: string[]): Promise<Map<string, number>> {
    const linhas = await this.banco.consultar<{ dataset_id: string; total: string }>(
      'SELECT dataset_id, count(*) AS total FROM versao_dataset WHERE dataset_id = ANY($1::uuid[]) GROUP BY dataset_id',
      [datasetIds],
    );
    return new Map(linhas.map((l) => [l.dataset_id, Number(l.total)]));
  }

  async atualizarMetadados(
    id: string,
    dados: { nome?: string; descricao?: string },
    executor?: Executor,
  ): Promise<DatasetRegistro | null> {
    return this.banco.consultarUm<DatasetRegistro>(
      `UPDATE dataset SET nome = coalesce($2, nome), descricao = coalesce($3, descricao), atualizado_em = now()
        WHERE id = $1 AND situacao = 'ATIVO' RETURNING ${COLUNAS_DATASET}`,
      [id, dados.nome ?? null, dados.descricao ?? null],
      executor,
    );
  }

  marcarExcluido(id: string, usuarioId: string, executor?: Executor): Promise<DatasetRegistro | null> {
    return this.banco.consultarUm<DatasetRegistro>(
      `UPDATE dataset SET situacao = 'EXCLUIDO_LOGICAMENTE', excluido_em = now(), excluido_por = $2,
          atualizado_em = now()
        WHERE id = $1 AND situacao = 'ATIVO' RETURNING ${COLUNAS_DATASET}`,
      [id, usuarioId],
      executor,
    );
  }

  async listarCaminhosReferenciados(): Promise<Set<string>> {
    const linhas = await this.banco.consultar<{ caminho_arquivo: string }>(
      'SELECT DISTINCT caminho_arquivo FROM versao_dataset',
    );
    return new Set(linhas.map((l) => l.caminho_arquivo));
  }
}
