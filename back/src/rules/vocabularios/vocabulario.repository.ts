import { Injectable } from '@nestjs/common';
import { DatabaseService, Executor } from '../../database/database.service';
import { VocabularioPreparado } from './importador-vocabulario';
import { VocabularioRegistro } from './vocabulario.tipos';

const COLUNAS = 'id, nome, origem, versao, licenca, hash_arquivo, total_codigos, importado_em';
const LOTE = 5000;

@Injectable()
export class VocabularioRepository {
  constructor(private readonly banco: DatabaseService) {}

  listar(): Promise<VocabularioRegistro[]> {
    return this.banco.consultar<VocabularioRegistro>(
      `SELECT ${COLUNAS} FROM vocabulario ORDER BY nome, versao`,
    );
  }

  buscarPorId(id: string, executor?: Executor): Promise<VocabularioRegistro | null> {
    return this.banco.consultarUm<VocabularioRegistro>(
      `SELECT ${COLUNAS} FROM vocabulario WHERE id = $1`,
      [id],
      executor,
    );
  }

  buscarPorIds(ids: string[]): Promise<VocabularioRegistro[]> {
    return this.banco.consultar<VocabularioRegistro>(
      `SELECT ${COLUNAS} FROM vocabulario WHERE id = ANY($1::uuid[])`,
      [ids],
    );
  }

  async contem(id: string, codigo: string): Promise<boolean> {
    const linha = await this.banco.consultarUm(
      'SELECT 1 FROM vocabulario_codigo WHERE vocabulario_id = $1 AND codigo = $2',
      [id, codigo],
    );
    return linha !== null;
  }

  async listarCodigos(id: string): Promise<string[]> {
    const linhas = await this.banco.consultar<{ codigo: string }>(
      'SELECT codigo FROM vocabulario_codigo WHERE vocabulario_id = $1',
      [id],
    );
    return linhas.map((l) => l.codigo);
  }

  async inserir(preparado: VocabularioPreparado, executor: Executor): Promise<VocabularioRegistro> {
    const { metadados } = preparado;
    const vocabulario = (await this.banco.consultarUm<VocabularioRegistro>(
      `INSERT INTO vocabulario (nome, origem, versao, licenca, hash_arquivo, total_codigos)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUNAS}`,
      [
        metadados.nome,
        metadados.origem,
        metadados.versao,
        metadados.licenca,
        preparado.hashArquivo,
        preparado.codigos.length,
      ],
      executor,
    )) as VocabularioRegistro;
    for (let inicio = 0; inicio < preparado.codigos.length; inicio += LOTE) {
      const lote = preparado.codigos.slice(inicio, inicio + LOTE);
      await this.banco.consultar(
        `INSERT INTO vocabulario_codigo (vocabulario_id, codigo, descricao)
         SELECT $1, codigo, descricao FROM unnest($2::text[], $3::text[]) AS t(codigo, descricao)`,
        [vocabulario.id, lote.map((c) => c.codigo), lote.map((c) => c.descricao)],
        executor,
      );
    }
    return vocabulario;
  }
}
