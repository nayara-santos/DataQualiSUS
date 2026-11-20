import { HttpStatus, Injectable } from '@nestjs/common';
import * as path from 'path';
import { ErroNegocio } from '../common/erros/erro-negocio';
import { DatabaseService } from '../database/database.service';
import { ArmazenamentoArquivosService } from './armazenamento-arquivos.service';
import { DatasetRepository } from './dataset.repository';
import { DatasetDto, OrigemVersao, paraDatasetDto } from './dataset.tipos';
import { caractereSeparador, SeparadorCsv } from './limites-csv';
import { ValidadorCsv } from './validador-csv';

export interface ArquivoRecebido {
  originalname: string;
  buffer: Buffer;
  size: number;
}

/** Nome original guardado apenas como metadado: sem diretórios nem caracteres de controle. */
export function sanitizarNomeArquivo(nome: string | undefined): string | null {
  if (!nome) {
    return null;
  }
  const base = Array.from(path.posix.basename(path.win32.basename(nome)))
    .filter((caractere) => caractere.charCodeAt(0) > 0x1f && caractere.charCodeAt(0) !== 0x7f)
    .join('');
  return base.slice(0, 255) || null;
}

/** DatasetService (P2, seção 2; UC-01). */
@Injectable()
export class DatasetService {
  constructor(
    protected readonly banco: DatabaseService,
    protected readonly repositorio: DatasetRepository,
    protected readonly validador: ValidadorCsv,
    protected readonly armazenamento: ArmazenamentoArquivosService,
  ) {}

  /**
   * Valida o arquivo e o registra pela primeira vez (UC-01, passos 2 a 4). Entradas inválidas são
   * rejeitadas antes de qualquer gravação; dataset e versão 1 são inseridos na mesma transação,
   * de modo que nenhuma falha deixa cadastro parcial (RNF001, fluxo 3b).
   */
  async importar(
    arquivo: ArquivoRecebido | undefined,
    metadados: { nome: string; descricao?: string; separador?: SeparadorCsv },
    usuarioId: string,
  ): Promise<DatasetDto> {
    const { conteudo, colunas, totalRegistros, separador } = await this.validarArquivo(
      arquivo,
      metadados.separador,
    );
    const gravado = await this.armazenamento.gravar(conteudo);
    return this.banco.transacao(async (tx) => {
      const dataset = await this.repositorio.inserirDataset(
        { nome: metadados.nome.trim(), descricao: metadados.descricao?.trim() ?? '', criadoPor: usuarioId },
        tx,
      );
      const versao = await this.repositorio.inserirVersao(
        {
          datasetId: dataset.id,
          versaoPredecessoraId: null,
          origem: OrigemVersao.IMPORTACAO,
          hash: gravado.hash,
          caminho: gravado.caminho,
          nomeArquivoOriginal: sanitizarNomeArquivo(arquivo?.originalname),
          tamanhoBytes: gravado.tamanhoBytes,
          separador,
          colunas,
          totalRegistros,
          criadoPor: usuarioId,
        },
        tx,
      );
      return paraDatasetDto(dataset, versao, 1);
    });
  }

  protected async validarArquivo(
    arquivo: ArquivoRecebido | undefined,
    separadorInformado: SeparadorCsv | undefined,
  ): Promise<{ conteudo: Buffer; colunas: string[]; totalRegistros: number; separador: ',' | ';' }> {
    if (!arquivo) {
      throw new ErroNegocio(
        'ARQUIVO_AUSENTE',
        'Selecione um arquivo CSV para importar.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const separador = caractereSeparador(separadorInformado);
    const resultado = await this.validador.validar(arquivo.buffer, {
      separador,
      nomeArquivo: arquivo.originalname,
    });
    if (!resultado.valido) {
      throw new ErroNegocio(resultado.motivo, resultado.mensagem);
    }
    return {
      conteudo: arquivo.buffer,
      colunas: resultado.colunas,
      totalRegistros: resultado.totalRegistros,
      separador,
    };
  }
}
