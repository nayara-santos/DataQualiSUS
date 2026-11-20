import { HttpStatus, Injectable } from '@nestjs/common';
import * as path from 'path';
import { ConflitoEstado, ErroNegocio, RecursoNaoEncontrado } from '../common/erros/erro-negocio';
import { DatabaseService } from '../database/database.service';
import { ArmazenamentoArquivosService } from './armazenamento-arquivos.service';
import { DatasetRepository } from './dataset.repository';
import {
  DatasetDetalheDto,
  DatasetDto,
  DatasetRegistro,
  OrigemVersao,
  PaginaRegistrosDto,
  paraDatasetDto,
  paraVersaoDto,
  SituacaoDataset,
  VersaoDto,
  VersaoRegistro,
} from './dataset.tipos';
import { lerCsv } from './leitor-csv';
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

  /** Listagem ativa: datasets excluídos logicamente não aparecem (RN04). */
  async listar(): Promise<DatasetDto[]> {
    const datasets = await this.repositorio.listarAtivos();
    const totais = await this.repositorio.contarVersoes(datasets.map((d) => d.id));
    return Promise.all(
      datasets.map(async (d) =>
        paraDatasetDto(d, await this.repositorio.buscarVersaoAtual(d.id), totais.get(d.id) ?? 0),
      ),
    );
  }

  /** Consulta de dados, versões e metadados (UC-01, passo 5), inclusive de dataset excluído. */
  async consultar(id: string): Promise<DatasetDetalheDto> {
    const dataset = await this.obterDataset(id);
    const versoes = await this.repositorio.listarVersoes(id);
    return {
      ...paraDatasetDto(dataset, versoes[versoes.length - 1] ?? null, versoes.length),
      versoes: versoes.map(paraVersaoDto),
    };
  }

  async listarVersoes(id: string): Promise<VersaoDto[]> {
    await this.obterDataset(id);
    return (await this.repositorio.listarVersoes(id)).map(paraVersaoDto);
  }

  /** Fluxo 5a: altera nome ou descrição sem tocar no conteúdo nem nas versões. */
  async atualizarMetadados(id: string, dados: { nome?: string; descricao?: string }): Promise<DatasetDto> {
    if (dados.nome === undefined && dados.descricao === undefined) {
      throw new ErroNegocio(
        'METADADOS_AUSENTES',
        'Informe o nome ou a descrição a atualizar.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const dataset = await this.obterDataset(id);
    this.exigirAtivo(dataset);
    const atualizado = await this.repositorio.atualizarMetadados(id, {
      nome: dados.nome?.trim(),
      descricao: dados.descricao?.trim(),
    });
    if (!atualizado) {
      throw this.erroExcluido();
    }
    const versoes = await this.repositorio.listarVersoes(id);
    return paraDatasetDto(atualizado, versoes[versoes.length - 1] ?? null, versoes.length);
  }

  /**
   * Fluxo 5b: novo conteúdo gera nova versão vinculada à versão mais recente, sem sobrescrever
   * o original. O dataset é bloqueado durante a numeração da versão.
   */
  async importarNovaVersao(
    id: string,
    arquivo: ArquivoRecebido | undefined,
    separadorInformado: SeparadorCsv | undefined,
    usuarioId: string,
  ): Promise<VersaoDto> {
    this.exigirAtivo(await this.obterDataset(id));
    const { conteudo, colunas, totalRegistros, separador } = await this.validarArquivo(
      arquivo,
      separadorInformado,
    );
    const gravado = await this.armazenamento.gravar(conteudo);
    return this.banco.transacao(async (tx) => {
      const dataset = await this.repositorio.bloquearDataset(id, tx);
      if (!dataset) {
        throw new RecursoNaoEncontrado('Dataset não encontrado.');
      }
      this.exigirAtivo(dataset);
      const anterior = await this.repositorio.buscarVersaoAtual(id, tx);
      const versao = await this.repositorio.inserirVersao(
        {
          datasetId: id,
          versaoPredecessoraId: anterior?.id ?? null,
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
      await this.repositorio.atualizarMetadados(id, {}, tx);
      return paraVersaoDto(versao);
    });
  }

  /** Fluxo 5c: exclusão lógica preserva arquivo original, versões e extratos (RN04, MOD-15). */
  async excluirLogicamente(id: string, usuarioId: string): Promise<DatasetDto> {
    const dataset = await this.obterDataset(id);
    this.exigirAtivo(dataset);
    const excluido = await this.repositorio.marcarExcluido(id, usuarioId);
    if (!excluido) {
      throw this.erroExcluido();
    }
    const versoes = await this.repositorio.listarVersoes(id);
    return paraDatasetDto(excluido, versoes[versoes.length - 1] ?? null, versoes.length);
  }

  /** Consulta paginada dos registros de uma versão, lidos do arquivo imutável. */
  async consultarRegistros(
    datasetId: string,
    versaoId: string,
    pagina: number,
    tamanho: number,
  ): Promise<PaginaRegistrosDto> {
    const versao = await this.obterVersaoDoDataset(datasetId, versaoId);
    const conteudo = await this.armazenamento.ler(versao.caminho_arquivo);
    const { colunas, registros } = await lerCsv(conteudo, versao.separador);
    const inicio = (pagina - 1) * tamanho;
    return {
      versaoId,
      colunas,
      pagina,
      tamanho,
      totalRegistros: registros.length,
      registros: registros.slice(inicio, inicio + tamanho).map((valores, indice) => ({
        linha: inicio + indice + 1,
        valores: Object.fromEntries(colunas.map((coluna, i) => [coluna, valores[i]])),
      })),
    };
  }

  async obterDataset(id: string): Promise<DatasetRegistro> {
    const dataset = await this.repositorio.buscarPorId(id);
    if (!dataset) {
      throw new RecursoNaoEncontrado('Dataset não encontrado.');
    }
    return dataset;
  }

  async obterVersaoDoDataset(datasetId: string, versaoId: string): Promise<VersaoRegistro> {
    await this.obterDataset(datasetId);
    const versao = await this.repositorio.buscarVersao(versaoId);
    if (!versao || versao.dataset_id !== datasetId) {
      throw new RecursoNaoEncontrado('Versão não encontrada para este dataset.');
    }
    return versao;
  }

  /** Dataset excluído logicamente fica indisponível para novas operações (RF001). */
  exigirAtivo(dataset: DatasetRegistro): void {
    if (dataset.situacao !== SituacaoDataset.ATIVO) {
      throw this.erroExcluido();
    }
  }

  private erroExcluido(): ConflitoEstado {
    return new ConflitoEstado(
      'DATASET_EXCLUIDO',
      'O dataset foi excluído logicamente e está indisponível para novas operações.',
    );
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
