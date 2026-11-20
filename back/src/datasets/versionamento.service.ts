import { Injectable } from '@nestjs/common';
import { Executor } from '../database/database.service';
import { ArmazenamentoArquivosService, ArquivoGravado } from './armazenamento-arquivos.service';
import { DatasetRepository } from './dataset.repository';
import { OrigemVersao, VersaoRegistro } from './dataset.tipos';
import { escreverCsv } from './leitor-csv';
import { Separador } from './limites-csv';

/**
 * VersionamentoService (P2, seção 2): grava arquivos imutáveis e registra versões derivadas.
 * Versões são somente inseridas, com referência à predecessora (ADR-005).
 */
@Injectable()
export class VersionamentoService {
  constructor(
    private readonly armazenamento: ArmazenamentoArquivosService,
    private readonly repositorio: DatasetRepository,
  ) {}

  /** gravarArquivo(registros): serializa registros tratados e grava o arquivo endereçado pelo hash. */
  gravarArquivo(colunas: string[], registros: string[][], separador: Separador): Promise<ArquivoGravado> {
    return this.armazenamento.gravar(escreverCsv(colunas, registros, separador));
  }

  /** criarVersaoDerivada(entrada, hash, tx): registra a versão tratada vinculada à de entrada. */
  criarVersaoDerivada(
    entrada: VersaoRegistro,
    arquivo: ArquivoGravado,
    dados: { totalRegistros: number; criadoPor: string },
    executor: Executor,
  ): Promise<VersaoRegistro> {
    return this.repositorio.inserirVersao(
      {
        datasetId: entrada.dataset_id,
        versaoPredecessoraId: entrada.id,
        origem: OrigemVersao.TRATAMENTO,
        hash: arquivo.hash,
        caminho: arquivo.caminho,
        nomeArquivoOriginal: null,
        tamanhoBytes: arquivo.tamanhoBytes,
        separador: entrada.separador,
        colunas: entrada.colunas,
        totalRegistros: dados.totalRegistros,
        criadoPor: dados.criadoPor,
      },
      executor,
    );
  }
}
