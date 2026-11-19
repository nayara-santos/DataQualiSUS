import { readdir, readFile } from 'fs/promises';
import * as path from 'path';
import { Client } from 'pg';

/** Diretório padrão das migrações SQL versionadas em /database/migrations. */
export const DIRETORIO_MIGRACOES = path.resolve(__dirname, '..', '..', '..', 'database', 'migrations');

/**
 * Aplica, em ordem alfabética, os arquivos .sql ainda não registrados em schema_migracoes.
 * Cada arquivo roda em sua própria transação.
 */
export async function aplicarMigracoes(
  urlBanco: string,
  diretorio: string = process.env.MIGRACOES_DIR || DIRETORIO_MIGRACOES,
): Promise<string[]> {
  const cliente = new Client({ connectionString: urlBanco });
  await cliente.connect();
  const aplicadas: string[] = [];
  try {
    await cliente.query(`CREATE TABLE IF NOT EXISTS schema_migracoes (
      nome TEXT PRIMARY KEY,
      aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const jaAplicadas = new Set(
      (await cliente.query<{ nome: string }>('SELECT nome FROM schema_migracoes')).rows.map((l) => l.nome),
    );
    const arquivos = (await readdir(diretorio)).filter((nome) => nome.endsWith('.sql')).sort();
    for (const arquivo of arquivos) {
      if (jaAplicadas.has(arquivo)) {
        continue;
      }
      const sql = await readFile(path.join(diretorio, arquivo), 'utf8');
      await cliente.query('BEGIN');
      try {
        await cliente.query(sql);
        await cliente.query('INSERT INTO schema_migracoes (nome) VALUES ($1)', [arquivo]);
        await cliente.query('COMMIT');
        aplicadas.push(arquivo);
      } catch (erro) {
        await cliente.query('ROLLBACK');
        throw new Error(`Falha ao aplicar a migração ${arquivo}: ${(erro as Error).message}`);
      }
    }
    return aplicadas;
  } finally {
    await cliente.end();
  }
}
