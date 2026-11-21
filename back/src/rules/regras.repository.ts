import { Injectable } from '@nestjs/common';
import { DatabaseService, Executor } from '../database/database.service';
import { ConfiguracaoRegra, DimensaoQualidade } from './motor/tipos';
import {
  ConjuntoRegistro,
  ItemConjunto,
  RegraRegistro,
  RevisaoConjuntoRegistro,
  RevisaoRegraRegistro,
} from './regras.tipos';

const SELECT_REGRA = `SELECT r.id, r.nome, r.descricao, r.dimensao, r.revisao_atual, r.situacao, r.criado_por,
  r.criado_em, r.atualizado_em, rr.configuracao
  FROM regra r JOIN regra_revisao rr ON rr.regra_id = r.id AND rr.revisao = r.revisao_atual`;

const SELECT_CONJUNTO = `SELECT c.id, c.nome, c.descricao, c.revisao_atual, c.situacao, c.criado_por, c.criado_em,
  c.atualizado_em, cr.itens
  FROM conjunto_regras c JOIN conjunto_revisao cr ON cr.conjunto_id = c.id AND cr.revisao = c.revisao_atual`;

/** Persistência de regras, conjuntos, revisões e associações (ADR-005). */
@Injectable()
export class RegrasRepository {
  constructor(private readonly banco: DatabaseService) {}

  // ---- Regras ----

  async inserirRegra(
    dados: {
      nome: string;
      descricao: string;
      dimensao: DimensaoQualidade;
      configuracao: ConfiguracaoRegra;
      usuarioId: string;
    },
    tx: Executor,
  ): Promise<string> {
    const linha = (await this.banco.consultarUm<{ id: string }>(
      'INSERT INTO regra (nome, descricao, dimensao, criado_por) VALUES ($1, $2, $3, $4) RETURNING id',
      [dados.nome, dados.descricao, dados.dimensao, dados.usuarioId],
      tx,
    )) as { id: string };
    await this.inserirRevisaoRegra(linha.id, 1, dados, tx);
    return linha.id;
  }

  private async inserirRevisaoRegra(
    regraId: string,
    revisao: number,
    dados: {
      nome: string;
      descricao: string;
      dimensao: DimensaoQualidade;
      configuracao: ConfiguracaoRegra;
      usuarioId: string;
    },
    tx: Executor,
  ): Promise<void> {
    await this.banco.consultar(
      `INSERT INTO regra_revisao (regra_id, revisao, nome, descricao, dimensao, configuracao, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        regraId,
        revisao,
        dados.nome,
        dados.descricao,
        dados.dimensao,
        JSON.stringify(dados.configuracao),
        dados.usuarioId,
      ],
      tx,
    );
  }

  /** Cria a próxima revisão da regra e devolve seu número. */
  async revisarRegra(
    regraId: string,
    dados: {
      nome: string;
      descricao: string;
      dimensao: DimensaoQualidade;
      configuracao: ConfiguracaoRegra;
      usuarioId: string;
    },
    tx: Executor,
  ): Promise<number> {
    const linha = (await this.banco.consultarUm<{ revisao_atual: number }>(
      `UPDATE regra SET revisao_atual = revisao_atual + 1, nome = $2, descricao = $3, dimensao = $4, atualizado_em = now()
        WHERE id = $1 RETURNING revisao_atual`,
      [regraId, dados.nome, dados.descricao, dados.dimensao],
      tx,
    )) as { revisao_atual: number };
    await this.inserirRevisaoRegra(regraId, linha.revisao_atual, dados, tx);
    return linha.revisao_atual;
  }

  buscarRegra(id: string, executor?: Executor, bloquear = false): Promise<RegraRegistro | null> {
    return this.banco.consultarUm<RegraRegistro>(
      `${SELECT_REGRA} WHERE r.id = $1${bloquear ? ' FOR UPDATE OF r' : ''}`,
      [id],
      executor,
    );
  }

  buscarRegras(ids: string[], executor?: Executor): Promise<RegraRegistro[]> {
    return this.banco.consultar<RegraRegistro>(
      `${SELECT_REGRA} WHERE r.id = ANY($1::uuid[])`,
      [ids],
      executor,
    );
  }

  listarRegrasAtivas(): Promise<RegraRegistro[]> {
    return this.banco.consultar<RegraRegistro>(`${SELECT_REGRA} WHERE r.situacao = 'ATIVO' ORDER BY r.nome`);
  }

  listarRevisoesRegra(id: string): Promise<RevisaoRegraRegistro[]> {
    return this.banco.consultar<RevisaoRegraRegistro>(
      `SELECT regra_id, revisao, nome, descricao, dimensao, configuracao, criado_por, criado_em
         FROM regra_revisao WHERE regra_id = $1 ORDER BY revisao`,
      [id],
    );
  }

  buscarRevisoesRegra(
    pares: { regraId: string; revisao: number }[],
    executor?: Executor,
  ): Promise<RevisaoRegraRegistro[]> {
    return this.banco.consultar<RevisaoRegraRegistro>(
      `SELECT rr.regra_id, rr.revisao, rr.nome, rr.descricao, rr.dimensao, rr.configuracao, rr.criado_por, rr.criado_em
         FROM regra_revisao rr
         JOIN unnest($1::uuid[], $2::int[]) AS p(regra_id, revisao)
           ON p.regra_id = rr.regra_id AND p.revisao = rr.revisao`,
      [pares.map((p) => p.regraId), pares.map((p) => p.revisao)],
      executor,
    );
  }

  async excluirRegra(id: string, tx: Executor): Promise<void> {
    await this.banco.consultar(
      "UPDATE regra SET situacao = 'EXCLUIDO_LOGICAMENTE', atualizado_em = now() WHERE id = $1",
      [id],
      tx,
    );
  }

  // ---- Conjuntos ----

  async inserirConjunto(
    dados: { nome: string; descricao: string; itens: ItemConjunto[]; usuarioId: string },
    tx: Executor,
  ): Promise<string> {
    const linha = (await this.banco.consultarUm<{ id: string }>(
      'INSERT INTO conjunto_regras (nome, descricao, criado_por) VALUES ($1, $2, $3) RETURNING id',
      [dados.nome, dados.descricao, dados.usuarioId],
      tx,
    )) as { id: string };
    await this.inserirRevisaoConjunto(linha.id, 1, { ...dados, motivo: 'CRIACAO' }, tx);
    return linha.id;
  }

  private async inserirRevisaoConjunto(
    conjuntoId: string,
    revisao: number,
    dados: { nome: string; descricao: string; itens: ItemConjunto[]; motivo: string; usuarioId: string },
    tx: Executor,
  ): Promise<void> {
    await this.banco.consultar(
      `INSERT INTO conjunto_revisao (conjunto_id, revisao, nome, descricao, itens, motivo, criado_por)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [
        conjuntoId,
        revisao,
        dados.nome,
        dados.descricao,
        JSON.stringify(dados.itens),
        dados.motivo,
        dados.usuarioId,
      ],
      tx,
    );
  }

  async revisarConjunto(
    conjuntoId: string,
    dados: { nome: string; descricao: string; itens: ItemConjunto[]; motivo: string; usuarioId: string },
    tx: Executor,
  ): Promise<number> {
    const linha = (await this.banco.consultarUm<{ revisao_atual: number }>(
      `UPDATE conjunto_regras SET revisao_atual = revisao_atual + 1, nome = $2, descricao = $3, atualizado_em = now()
        WHERE id = $1 RETURNING revisao_atual`,
      [conjuntoId, dados.nome, dados.descricao],
      tx,
    )) as { revisao_atual: number };
    await this.inserirRevisaoConjunto(conjuntoId, linha.revisao_atual, dados, tx);
    return linha.revisao_atual;
  }

  buscarConjunto(id: string, executor?: Executor, bloquear = false): Promise<ConjuntoRegistro | null> {
    return this.banco.consultarUm<ConjuntoRegistro>(
      `${SELECT_CONJUNTO} WHERE c.id = $1${bloquear ? ' FOR UPDATE OF c' : ''}`,
      [id],
      executor,
    );
  }

  listarConjuntosAtivos(): Promise<ConjuntoRegistro[]> {
    return this.banco.consultar<ConjuntoRegistro>(
      `${SELECT_CONJUNTO} WHERE c.situacao = 'ATIVO' ORDER BY c.nome`,
    );
  }

  /** Conjuntos ativos cuja revisão atual contém a regra. */
  listarConjuntosComRegra(regraId: string, tx: Executor): Promise<ConjuntoRegistro[]> {
    return this.banco.consultar<ConjuntoRegistro>(
      `${SELECT_CONJUNTO} WHERE c.situacao = 'ATIVO' AND cr.itens @> $1::jsonb ORDER BY c.id FOR UPDATE OF c`,
      [JSON.stringify([{ regraId }])],
      tx,
    );
  }

  listarRevisoesConjunto(id: string): Promise<RevisaoConjuntoRegistro[]> {
    return this.banco.consultar<RevisaoConjuntoRegistro>(
      `SELECT conjunto_id, revisao, nome, descricao, itens, motivo, criado_por, criado_em
         FROM conjunto_revisao WHERE conjunto_id = $1 ORDER BY revisao`,
      [id],
    );
  }

  buscarRevisaoConjunto(
    id: string,
    revisao: number,
    executor?: Executor,
  ): Promise<RevisaoConjuntoRegistro | null> {
    return this.banco.consultarUm<RevisaoConjuntoRegistro>(
      `SELECT conjunto_id, revisao, nome, descricao, itens, motivo, criado_por, criado_em
         FROM conjunto_revisao WHERE conjunto_id = $1 AND revisao = $2`,
      [id, revisao],
      executor,
    );
  }

  async excluirConjunto(id: string, tx: Executor): Promise<void> {
    await this.banco.consultar(
      "UPDATE conjunto_regras SET situacao = 'EXCLUIDO_LOGICAMENTE', atualizado_em = now() WHERE id = $1",
      [id],
      tx,
    );
  }

  // ---- Associação com datasets ----

  async associar(conjuntoId: string, datasetId: string, usuarioId: string): Promise<void> {
    await this.banco.consultar(
      `INSERT INTO conjunto_dataset (conjunto_id, dataset_id, associado_por) VALUES ($1, $2, $3)
       ON CONFLICT (conjunto_id, dataset_id) DO NOTHING`,
      [conjuntoId, datasetId, usuarioId],
    );
  }

  async desassociar(conjuntoId: string, datasetId: string): Promise<boolean> {
    const linhas = await this.banco.consultar(
      'DELETE FROM conjunto_dataset WHERE conjunto_id = $1 AND dataset_id = $2 RETURNING conjunto_id',
      [conjuntoId, datasetId],
    );
    return linhas.length > 0;
  }

  async datasetsAssociados(conjuntoIds: string[]): Promise<Map<string, string[]>> {
    const linhas = await this.banco.consultar<{ conjunto_id: string; dataset_id: string }>(
      'SELECT conjunto_id, dataset_id FROM conjunto_dataset WHERE conjunto_id = ANY($1::uuid[]) ORDER BY associado_em',
      [conjuntoIds],
    );
    const mapa = new Map<string, string[]>();
    for (const l of linhas) {
      mapa.set(l.conjunto_id, [...(mapa.get(l.conjunto_id) ?? []), l.dataset_id]);
    }
    return mapa;
  }

  async estaAssociado(conjuntoId: string, datasetId: string, executor?: Executor): Promise<boolean> {
    const linha = await this.banco.consultarUm(
      'SELECT 1 FROM conjunto_dataset WHERE conjunto_id = $1 AND dataset_id = $2',
      [conjuntoId, datasetId],
      executor,
    );
    return linha !== null;
  }
}
