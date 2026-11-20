import { mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { Configuracao } from '../config/configuracao';
import { ArmazenamentoArquivosService, calcularSha256 } from './armazenamento-arquivos.service';

describe('ArmazenamentoArquivosService (ADR-003)', () => {
  let diretorio: string;
  let servico: ArmazenamentoArquivosService;

  beforeEach(async () => {
    diretorio = await mkdtemp(path.join(tmpdir(), 'dq-armazenamento-'));
    servico = new ArmazenamentoArquivosService({ armazenamentoDir: diretorio } as Configuracao);
    await servico.onModuleInit();
  });

  afterEach(() => rm(diretorio, { recursive: true, force: true }));

  it('grava o arquivo nomeado pelo SHA-256 e somente leitura', async () => {
    const conteudo = Buffer.from('a,b\n1,2\n');
    const gravado = await servico.gravar(conteudo);
    expect(gravado).toEqual({
      hash: calcularSha256(conteudo),
      caminho: `${calcularSha256(conteudo)}.csv`,
      tamanhoBytes: 8,
    });
    const completo = path.join(diretorio, gravado.caminho);
    expect(await readFile(completo)).toEqual(conteudo);
    expect((await stat(completo)).mode & 0o222).toBe(0);
    expect(await readdir(diretorio)).toEqual([gravado.caminho]);
  });

  it('reutiliza o arquivo quando o conteúdo é idêntico', async () => {
    const a = await servico.gravar(Buffer.from('x\n1\n'));
    const b = await servico.gravar(Buffer.from('x\n1\n'));
    expect(b).toEqual(a);
    expect(await readdir(diretorio)).toHaveLength(1);
  });

  it('confere a integridade e detecta adulteração', async () => {
    const gravado = await servico.gravar(Buffer.from('x\n1\n'));
    await expect(servico.verificarIntegridade(gravado.caminho, gravado.hash)).resolves.toBe(true);
    await expect(servico.verificarIntegridade(gravado.caminho, '0'.repeat(64))).resolves.toBe(false);
    await expect(servico.verificarIntegridade(`${'f'.repeat(64)}.csv`, 'f'.repeat(64))).resolves.toBe(false);
  });

  it('recusa caminhos fora do padrão de hash (ex.: ../)', async () => {
    await expect(servico.ler('../segredo.csv')).rejects.toThrow('inválido');
    await expect(servico.ler(`${'a'.repeat(64)}.csv/../../x`)).rejects.toThrow('inválido');
  });

  it('coleta somente órfãos e temporários antigos', async () => {
    const referenciado = await servico.gravar(Buffer.from('ref\n1\n'));
    const orfao = await servico.gravar(Buffer.from('orfao\n1\n'));
    const recente = await servico.gravar(Buffer.from('recente\n1\n'));
    await writeFile(path.join(diretorio, '.tmp-abc'), 'x');
    await writeFile(path.join(diretorio, 'leia-me.txt'), 'outro arquivo');
    const antigo = new Date(Date.now() - 2 * 3600_000);
    for (const nome of [orfao.caminho, referenciado.caminho, '.tmp-abc', 'leia-me.txt']) {
      await utimes(path.join(diretorio, nome), antigo, antigo);
    }
    const removidos = await servico.coletarOrfaos(new Set([referenciado.caminho]), 3600_000);
    expect(removidos.sort()).toEqual(['.tmp-abc', orfao.caminho].sort());
    expect((await readdir(diretorio)).sort()).toEqual(
      [referenciado.caminho, recente.caminho, 'leia-me.txt'].sort(),
    );
  });
});
