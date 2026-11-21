import { Injectable } from '@nestjs/common';
import { DatabaseService, Executor } from '../database/database.service';
import { colunasDaRegra } from '../rules/motor/tipos';
import {
  ConfiguracaoExecutada,
  ResultadoRegraRegistro,
  SimulacaoRegistro,
  StatusSimulacao,
} from './simulacao.tipos';
import { ResultadoTarefaSimulacao } from './tarefa-simulacao';

const COLUNAS = `id, versao_id, dataset_id, conjunto_id, conjunto_revisao, configuracao_executada, status, mensagem,
  limite_ms, aceita_em, concluida_em, invalidada_em, consolidada_em, hash_entrada_conferido, total_linhas,
  total_linhas_com_violacao, total_previsto_alteradas, total_previsto_removidas, previa, criado_por`;

@Injectable()
export class SimulacaoRepository {
  constructor(private readonly banco: DatabaseService) {}

  async registrar(configuracao: ConfiguracaoExecutada, usuarioId: string): Promise<SimulacaoRegistro> {
    return (await this.banco.consultarUm<SimulacaoRegistro>(
      `INSERT INTO simulacao (versao_id, dataset_id, conjunto_id, conjunto_revisao, configuracao_executada, status,
         limite_ms, criado_por)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'EM_EXECUCAO', $6, $7) RETURNING ${COLUNAS}`,
      [
        configuracao.versao.id,
        configuracao.versao.datasetId,
        configuracao.conjunto.id,
        configuracao.conjunto.revisao,
        JSON.stringify(configuracao),
        configuracao.limiteMs,
        usuarioId,
      ],
    )) as SimulacaoRegistro;
  }

  buscar(id: string, executor?: Executor, bloquear = false): Promise<SimulacaoRegistro | null> {
    return this.banco.consultarUm<SimulacaoRegistro>(
      `SELECT ${COLUNAS} FROM simulacao WHERE id = $1${bloquear ? ' FOR UPDATE' : ''}`,
      [id],
      executor,
    );
  }

  listarPorVersao(versaoId: string): Promise<SimulacaoRegistro[]> {
    return this.banco.consultar<SimulacaoRegistro>(
      `SELECT ${COLUNAS} FROM simulacao WHERE versao_id = $1 ORDER BY aceita_em DESC`,
      [versaoId],
    );
  }

  listarResultados(simulacaoId: string, executor?: Executor): Promise<ResultadoRegraRegistro[]> {
    return this.banco.consultar<ResultadoRegraRegistro>(
      `SELECT simulacao_id, ordem, regra_id, regra_revisao, nome, dimensao, colunas, total_avaliados, linhas_violadas,
              total_violacoes, percentual_aprovacao, acao, linhas_previstas
         FROM resultado_regra WHERE simulacao_id = $1 ORDER BY ordem`,
      [simulacaoId],
      executor,
    );
  }

  /** Grava o resultado somente se a simulação ainda estiver em execução (não invalidada). */
  async concluir(
    id: string,
    configuracao: ConfiguracaoExecutada,
    resultado: ResultadoTarefaSimulacao,
  ): Promise<boolean> {
    return this.banco.transacao(async (tx) => {
      const atualizada = await this.banco.consultar(
        `UPDATE simulacao SET status = 'CONCLUIDA', concluida_em = now(), hash_entrada_conferido = $2, total_linhas = $3,
           total_linhas_com_violacao = $4, total_previsto_alteradas = $5, total_previsto_removidas = $6, previa = $7::jsonb
         WHERE id = $1 AND status = 'EM_EXECUCAO' RETURNING id`,
        [
          id,
          resultado.hashConferido,
          resultado.totalLinhas,
          resultado.totalLinhasComViolacao,
          resultado.totalPrevistoAlteradas,
          resultado.totalPrevistoRemovidas,
          JSON.stringify(resultado.previa),
        ],
        tx,
      );
      if (atualizada.length === 0) {
        return false;
      }
      const regras = new Map(configuracao.regras.map((r) => [r.regraId, r]));
      for (const r of resultado.resultados) {
        const regra = regras.get(r.regraId)!;
        const aprovadas = r.totalAvaliados - r.linhasVioladas.length;
        const percentual =
          r.totalAvaliados === 0 ? 100 : Math.round((10000 * aprovadas) / r.totalAvaliados) / 100;
        await this.banco.consultar(
          `INSERT INTO resultado_regra (simulacao_id, ordem, regra_id, regra_revisao, nome, dimensao, colunas,
             total_avaliados, linhas_violadas, total_violacoes, percentual_aprovacao, acao, linhas_previstas)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::int[], $10, $11, $12, $13)`,
          [
            id,
            r.ordem,
            r.regraId,
            r.revisao,
            r.nome,
            r.dimensao,
            JSON.stringify(colunasDaRegra(regra.configuracao)),
            r.totalAvaliados,
            r.linhasVioladas,
            r.linhasVioladas.length,
            percentual,
            regra.configuracao.acao?.tipo ?? null,
            resultado.linhasPrevistasPorRegra[r.regraId] ?? 0,
          ],
          tx,
        );
      }
      return true;
    });
  }

  async encerrarSemResultado(id: string, status: StatusSimulacao, mensagem: string): Promise<void> {
    await this.banco.consultar(
      `UPDATE simulacao SET status = $2, mensagem = $3, concluida_em = now() WHERE id = $1 AND status = 'EM_EXECUCAO'`,
      [id, status, mensagem],
    );
  }

  /** Invalida simulações não aplicadas dos conjuntos revisados (RF002, pós-condição). */
  async invalidarPorConjuntos(conjuntoIds: string[], tx: Executor): Promise<number> {
    const linhas = await this.banco.consultar(
      `UPDATE simulacao SET status = 'INVALIDADA', invalidada_em = now(),
         mensagem = 'Configuração do conjunto alterada após a simulação; execute nova simulação.'
       WHERE conjunto_id = ANY($1::uuid[]) AND status IN ('EM_EXECUCAO', 'CONCLUIDA') RETURNING id`,
      [conjuntoIds],
      tx,
    );
    return linhas.length;
  }

  async marcarInterrompidas(): Promise<number> {
    const linhas = await this.banco.consultar(
      `UPDATE simulacao SET status = 'FALHA', concluida_em = now(),
         mensagem = 'Execução interrompida pelo reinício da API; execute nova simulação.'
       WHERE status = 'EM_EXECUCAO' RETURNING id`,
    );
    return linhas.length;
  }

  async consolidar(id: string, tx: Executor): Promise<void> {
    await this.banco.consultar(
      `UPDATE simulacao SET status = 'CONSOLIDADA', consolidada_em = now() WHERE id = $1 AND status = 'CONCLUIDA'`,
      [id],
      tx,
    );
  }
}
