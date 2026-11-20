import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { chmod, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises';
import * as path from 'path';
import { CONFIGURACAO, Configuracao } from '../config/configuracao';

export interface ArquivoGravado {
  hash: string;
  caminho: string;
  tamanhoBytes: number;
}

export function calcularSha256(conteudo: Buffer): string {
  return createHash('sha256').update(conteudo).digest('hex');
}

const NOME_VALIDO = /^[0-9a-f]{64}\.csv$/;

/**
 * Armazenamento de arquivos (ADR-003): cada versão é um arquivo CSV imutável nomeado pelo
 * SHA-256 do conteúdo. O nome nunca deriva do arquivo enviado pelo usuário (RNF005).
 */
@Injectable()
export class ArmazenamentoArquivosService implements OnModuleInit {
  private readonly logger = new Logger(ArmazenamentoArquivosService.name);
  readonly diretorio: string;

  constructor(@Inject(CONFIGURACAO) configuracao: Configuracao) {
    this.diretorio = path.resolve(configuracao.armazenamentoDir);
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.diretorio, { recursive: true });
  }

  private resolver(caminho: string): string {
    if (!NOME_VALIDO.test(caminho)) {
      throw new Error('Caminho de arquivo de versão inválido.');
    }
    return path.join(this.diretorio, caminho);
  }

  /**
   * Grava o conteúdo em caminho definitivo endereçado pelo hash, por escrita em arquivo
   * temporário seguida de renomeação. Conteúdo idêntico reutiliza o arquivo existente.
   */
  async gravar(conteudo: Buffer): Promise<ArquivoGravado> {
    const hash = calcularSha256(conteudo);
    const caminho = `${hash}.csv`;
    const destino = this.resolver(caminho);
    try {
      const existente = await readFile(destino);
      if (calcularSha256(existente) === hash) {
        return { hash, caminho, tamanhoBytes: conteudo.length };
      }
      this.logger.warn(`Arquivo ${caminho} divergente do hash; será regravado.`);
      await chmod(destino, 0o644);
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw erro;
      }
    }
    await mkdir(this.diretorio, { recursive: true });
    const temporario = path.join(this.diretorio, `.tmp-${randomBytes(8).toString('hex')}`);
    await writeFile(temporario, conteudo, { mode: 0o444 });
    await rename(temporario, destino);
    return { hash, caminho, tamanhoBytes: conteudo.length };
  }

  async ler(caminho: string): Promise<Buffer> {
    return readFile(this.resolver(caminho));
  }

  /** Confere a integridade dos bytes de uma versão (CT001/CT003/CT004). */
  async verificarIntegridade(caminho: string, hashEsperado: string): Promise<boolean> {
    try {
      return calcularSha256(await this.ler(caminho)) === hashEsperado;
    } catch {
      return false;
    }
  }

  /**
   * Coleta de arquivos órfãos (ADR-003/ADR-004, DA02 da P3): remove arquivos que nenhuma versão
   * referencia e que são mais antigos que a carência, preservando gravações em andamento.
   */
  async coletarOrfaos(referenciados: Set<string>, carenciaMs: number): Promise<string[]> {
    const removidos: string[] = [];
    const agora = Date.now();
    for (const nome of await readdir(this.diretorio)) {
      const completo = path.join(this.diretorio, nome);
      const temporario = nome.startsWith('.tmp-');
      if (!temporario && (!NOME_VALIDO.test(nome) || referenciados.has(nome))) {
        continue;
      }
      const info = await stat(completo);
      if (agora - info.mtimeMs < carenciaMs) {
        continue;
      }
      await rm(completo, { force: true });
      removidos.push(nome);
    }
    return removidos;
  }
}
