import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { calcularSha256 } from '../datasets/armazenamento-arquivos.service';
import { RegraExecutavel } from '../rules/motor/tipos';
import { executarTarefaSimulacao } from './tarefa-simulacao';

describe('executarTarefaSimulacao', () => {
  let diretorio: string;
  const conteudo = Buffer.from('id,nome\n1, Ana \n1,Ana\n2,\n');
  const regras = [
    {
      regraId: 'u',
      revisao: 1,
      nome: 'U',
      ordem: 1,
      configuracao: {
        dimensao: 'UNICIDADE',
        colunas: [{ nome: 'id', tipo: 'TEXTO' }],
        acao: { tipo: 'REMOVER_REPETICOES' },
      },
    },
    {
      regraId: 'c',
      revisao: 2,
      nome: 'C',
      ordem: 2,
      configuracao: {
        dimensao: 'COMPLETUDE',
        colunas: [{ nome: 'nome', tipo: 'TEXTO' }],
        acao: { tipo: 'APARAR_ESPACOS', coluna: 'nome' },
      },
    },
  ] as RegraExecutavel[];

  beforeAll(async () => {
    diretorio = await mkdtemp(path.join(tmpdir(), 'dq-tarefa-'));
    await writeFile(path.join(diretorio, 'v.csv'), conteudo);
  });
  afterAll(() => rm(diretorio, { recursive: true, force: true }));

  const dados = (extra = {}) => ({
    caminhoArquivo: path.join(diretorio, 'v.csv'),
    hashEsperado: calcularSha256(conteudo),
    separador: ',' as const,
    colunasEsperadas: ['id', 'nome'],
    regras,
    vocabularios: {},
    ...extra,
  });

  it('avalia, prevê ações e totaliza linhas distintas sem alterar o arquivo', async () => {
    const resultado = await executarTarefaSimulacao(dados());
    expect(resultado.hashConferido).toBe(calcularSha256(conteudo));
    expect(resultado.totalLinhas).toBe(3);
    expect(resultado.resultados.map((r) => [r.regraId, r.linhasVioladas])).toEqual([
      ['u', [2]],
      ['c', [3]],
    ]);
    expect(resultado.totalLinhasComViolacao).toBe(2);
    expect(resultado.totalPrevistoAlteradas).toBe(1);
    expect(resultado.totalPrevistoRemovidas).toBe(1);
    expect(resultado.linhasPrevistasPorRegra).toEqual({ u: 1, c: 1 });
    expect(resultado.previa.map((p) => p.linha)).toEqual([1, 2]);
  });

  it('recusa arquivo com hash divergente', async () => {
    await expect(executarTarefaSimulacao(dados({ hashEsperado: '0'.repeat(64) }))).rejects.toThrow(
      'integridade',
    );
  });

  it('recusa cabeçalho divergente do registrado', async () => {
    await expect(executarTarefaSimulacao(dados({ colunasEsperadas: ['id', 'outro'] }))).rejects.toThrow(
      'cabeçalho',
    );
  });
});
