import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { CONFIGURACAO, Configuracao } from '../config/configuracao';

/** Executor aceito pelos repositórios: o pool (fora de transação) ou um cliente em transação. */
export type Executor = Pool | PoolClient;

/**
 * Acesso ao PostgreSQL. Todas as consultas são parametrizadas (ADR-006); nenhum SQL é montado
 * a partir de regras ou de conteúdo dos datasets (ADR-002).
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  readonly pool: Pool;

  constructor(@Inject(CONFIGURACAO) configuracao: Configuracao) {
    this.pool = new Pool({ connectionString: configuracao.bancoUrl, max: 10 });
    this.pool.on('error', (erro) => this.logger.error(`Erro em conexão ociosa do pool: ${erro.message}`));
  }

  async consultar<T extends QueryResultRow>(
    sql: string,
    parametros: unknown[] = [],
    executor: Executor = this.pool,
  ): Promise<T[]> {
    const resultado = await executor.query<T>(sql, parametros);
    return resultado.rows;
  }

  async consultarUm<T extends QueryResultRow>(
    sql: string,
    parametros: unknown[] = [],
    executor: Executor = this.pool,
  ): Promise<T | null> {
    const linhas = await this.consultar<T>(sql, parametros, executor);
    return linhas[0] ?? null;
  }

  /**
   * Unidade de trabalho: executa a função em uma transação e faz COMMIT ao final
   * ou ROLLBACK integral em qualquer falha (ADR-004).
   */
  async transacao<T>(trabalho: (cliente: PoolClient) => Promise<T>): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      const resultado = await trabalho(cliente);
      await cliente.query('COMMIT');
      return resultado;
    } catch (erro) {
      await cliente.query('ROLLBACK').catch(() => undefined);
      throw erro;
    } finally {
      cliente.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
