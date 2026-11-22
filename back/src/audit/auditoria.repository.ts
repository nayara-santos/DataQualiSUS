import { Injectable } from '@nestjs/common';
import { DatabaseService, Executor } from '../database/database.service';
import { Alteracao } from '../rules/motor/motor-regras';
import { AlteracaoDto, ExtratoRegistro, NovoExtrato } from './auditoria.tipos';

const LOTE = 5000;

const SELECT_EXTRATO = `SELECT e.id, e.operacao, e.simulacao_id, e.dataset_id, d.nome AS dataset_nome,
  d.situacao AS dataset_situacao, e.usuario_id, e.instante_utc, e.versao_entrada_id, ve.numero AS versao_entrada_numero,
  ve.hash_sha256 AS versao_entrada_hash, e.versao_saida_id, vs.numero AS versao_saida_numero,
  vs.hash_sha256 AS versao_saida_hash, e.conjunto_id, e.conjunto_revisao, e.revisoes_regras, e.acoes_aplicadas,
  e.total_linhas_alteradas, e.total_linhas_removidas, e.total_linhas_afetadas,
  (SELECT count(*) FROM alteracao_registro a WHERE a.extrato_id = e.id) AS total_alteracoes
  FROM extrato_auditoria e
  JOIN dataset d ON d.id = e.dataset_id
  JOIN versao_dataset ve ON ve.id = e.versao_entrada_id
  JOIN versao_dataset vs ON vs.id = e.versao_saida_id`;

/** Repositório somente de inserção e consulta: não há operações de edição ou remoção. */
@Injectable()
export class AuditoriaRepository {
  constructor(private readonly banco: DatabaseService) {}

  async inserirExtrato(dados: NovoExtrato, tx: Executor): Promise<{ id: string; instante_utc: Date }> {
    return (await this.banco.consultarUm<{ id: string; instante_utc: Date }>(
      `INSERT INTO extrato_auditoria (operacao, simulacao_id, dataset_id, usuario_id, versao_entrada_id, versao_saida_id,
         conjunto_id, conjunto_revisao, revisoes_regras, acoes_aplicadas, total_linhas_alteradas, total_linhas_removidas,
         total_linhas_afetadas)
       VALUES ('TRATAMENTO', $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12)
       RETURNING id, instante_utc`,
      [
        dados.simulacaoId,
        dados.datasetId,
        dados.usuarioId,
        dados.versaoEntradaId,
        dados.versaoSaidaId,
        dados.conjuntoId,
        dados.conjuntoRevisao,
        JSON.stringify(dados.revisoesRegras),
        JSON.stringify(dados.acoesAplicadas),
        dados.totalLinhasAlteradas,
        dados.totalLinhasRemovidas,
        dados.totalLinhasAlteradas + dados.totalLinhasRemovidas,
      ],
      tx,
    )) as { id: string; instante_utc: Date };
  }

  async inserirAlteracoes(extratoId: string, alteracoes: Alteracao[], tx: Executor): Promise<void> {
    for (let inicio = 0; inicio < alteracoes.length; inicio += LOTE) {
      const lote = alteracoes.slice(inicio, inicio + LOTE);
      await this.banco.consultar(
        `INSERT INTO alteracao_registro (extrato_id, linha, tipo, regra_id, regra_revisao, acao, coluna, valor_anterior,
           valor_novo, linha_representante)
         SELECT $1, * FROM unnest($2::int[], $3::text[], $4::uuid[], $5::int[], $6::text[], $7::text[], $8::text[],
           $9::text[], $10::int[])`,
        [
          extratoId,
          lote.map((a) => a.linha),
          lote.map((a) => a.tipo),
          lote.map((a) => a.regraId),
          lote.map((a) => a.regraRevisao),
          lote.map((a) => a.acao),
          lote.map((a) => a.coluna),
          lote.map((a) => a.valorAnterior),
          lote.map((a) => a.valorNovo),
          lote.map((a) => a.linhaRepresentante),
        ],
        tx,
      );
    }
  }

  buscarExtrato(id: string): Promise<ExtratoRegistro | null> {
    return this.banco.consultarUm<ExtratoRegistro>(`${SELECT_EXTRATO} WHERE e.id = $1`, [id]);
  }

  listarPorDataset(datasetId: string): Promise<ExtratoRegistro[]> {
    return this.banco.consultar<ExtratoRegistro>(
      `${SELECT_EXTRATO} WHERE e.dataset_id = $1 ORDER BY e.instante_utc DESC`,
      [datasetId],
    );
  }

  async listarAlteracoes(extratoId: string, deslocamento: number, limite: number): Promise<AlteracaoDto[]> {
    const linhas = await this.banco.consultar<{
      linha: number;
      tipo: AlteracaoDto['tipo'];
      regra_id: string;
      regra_revisao: number;
      acao: AlteracaoDto['acao'];
      coluna: string | null;
      valor_anterior: string | null;
      valor_novo: string | null;
      linha_representante: number | null;
    }>(
      `SELECT linha, tipo, regra_id, regra_revisao, acao, coluna, valor_anterior, valor_novo, linha_representante
         FROM alteracao_registro WHERE extrato_id = $1 ORDER BY linha, id OFFSET $2 LIMIT $3`,
      [extratoId, deslocamento, limite],
    );
    return linhas.map((l) => ({
      linha: l.linha,
      tipo: l.tipo,
      regraId: l.regra_id,
      regraRevisao: l.regra_revisao,
      acao: l.acao,
      coluna: l.coluna,
      valorAnterior: l.valor_anterior,
      valorNovo: l.valor_novo,
      linhaRepresentante: l.linha_representante,
    }));
  }

  /** Datasets com intervenções registradas, inclusive os excluídos logicamente (UC-06). */
  listarDatasetsAuditados(): Promise<
    { id: string; nome: string; situacao: string; total_extratos: string; ultimo: Date }[]
  > {
    return this.banco.consultar(
      `SELECT d.id, d.nome, d.situacao, count(e.id) AS total_extratos, max(e.instante_utc) AS ultimo
         FROM dataset d JOIN extrato_auditoria e ON e.dataset_id = d.id
        GROUP BY d.id, d.nome, d.situacao ORDER BY max(e.instante_utc) DESC`,
    );
  }
}
