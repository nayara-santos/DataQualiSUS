import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AuditoriaService } from '../audit/auditoria.service';
import { ConflitoEstado, ErroNegocio, RecursoNaoEncontrado } from '../common/erros/erro-negocio';
import { DatabaseService } from '../database/database.service';
import { ArmazenamentoArquivosService, calcularSha256 } from '../datasets/armazenamento-arquivos.service';
import { DatasetRepository } from '../datasets/dataset.repository';
import { paraVersaoDto, VersaoDto } from '../datasets/dataset.tipos';
import { lerCsv } from '../datasets/leitor-csv';
import { VersionamentoService } from '../datasets/versionamento.service';
import { aplicarAcoes } from '../rules/motor/motor-regras';
import { SimulacaoRepository } from '../simulations/simulacao.repository';
import { SimulacaoService } from '../simulations/simulacao.service';

/** ResultadoTratamento (P2, seção 2): identificadores da versão e da operação (UC-04, passo 6). */
export interface ResultadoTratamento {
  simulacaoId: string;
  extratoId: string;
  instanteUtc: string;
  versaoEntrada: { id: string; numero: number; hashSha256: string };
  versaoSaida: VersaoDto;
  totalLinhasAlteradas: number;
  totalLinhasRemovidas: number;
  totalLinhasAfetadas: number;
}

/**
 * TratamentoService (P2, seção 2; UC-04; ADR-004): aplica, mediante confirmação explícita, as
 * ações do catálogo da simulação vigente, sobre uma cópia dos registros, e confirma nova versão,
 * extrato, alterações e mudança de status da simulação em uma única transação.
 */
@Injectable()
export class TratamentoService {
  private readonly logger = new Logger(TratamentoService.name);

  constructor(
    private readonly banco: DatabaseService,
    private readonly simulacoes: SimulacaoRepository,
    private readonly simulacaoService: SimulacaoService,
    private readonly datasets: DatasetRepository,
    private readonly armazenamento: ArmazenamentoArquivosService,
    private readonly versionamento: VersionamentoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async aplicar(simulacaoId: string, confirmado: boolean, usuarioId: string): Promise<ResultadoTratamento> {
    if (confirmado !== true) {
      throw new ErroNegocio(
        'CONFIRMACAO_OBRIGATORIA',
        'Confirme explicitamente a aplicação das ações revisadas na prévia.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.banco.transacao(async (tx) => {
      // (1) Bloqueia a simulação para impedir dupla aplicação e confere a vigência sob o bloqueio.
      const simulacao = await this.simulacoes.buscar(simulacaoId, tx, true);
      if (!simulacao) {
        throw new RecursoNaoEncontrado('Simulação não encontrada.');
      }
      const vigencia = await this.simulacaoService.validarVigencia(simulacao, tx);
      if (!vigencia.vigente) {
        throw new ConflitoEstado(vigencia.codigo!, vigencia.motivo!);
      }
      const previstoAlteradas = simulacao.total_previsto_alteradas ?? 0;
      const previstoRemovidas = simulacao.total_previsto_removidas ?? 0;
      if (previstoAlteradas + previstoRemovidas === 0) {
        throw new ErroNegocio(
          'SEM_ALTERACOES',
          'A simulação não prevê alterações: nenhuma versão ou extrato foi criado.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      await this.datasets.bloquearDataset(simulacao.dataset_id, tx);
      const entrada = await this.datasets.buscarVersao(simulacao.versao_id, tx);
      if (!entrada) {
        throw new RecursoNaoEncontrado('Versão de entrada não encontrada.');
      }

      // (2) Aplica as ações na ordem exibida sobre uma cópia e grava o arquivo da nova versão.
      const conteudo = await this.armazenamento.ler(entrada.caminho_arquivo);
      if (calcularSha256(conteudo) !== entrada.hash_sha256) {
        throw new ConflitoEstado(
          'INTEGRIDADE_VIOLADA',
          'A integridade do arquivo de entrada não confere; nada foi aplicado.',
        );
      }
      const { colunas, registros } = await lerCsv(conteudo, entrada.separador);
      const configuracao = simulacao.configuracao_executada;
      const resultado = aplicarAcoes(colunas, registros, configuracao.regras);
      if (
        resultado.linhasAlteradas.length !== previstoAlteradas ||
        resultado.linhasRemovidas.length !== previstoRemovidas
      ) {
        throw new ConflitoEstado(
          'PREVIA_DIVERGENTE',
          'O resultado da aplicação diverge da prévia simulada; execute nova simulação.',
        );
      }
      const arquivo = await this.versionamento.gravarArquivo(colunas, resultado.registros, entrada.separador);

      // (3) Na mesma transação: versão derivada, extrato, alterações e status CONSOLIDADA.
      const versaoSaida = await this.versionamento.criarVersaoDerivada(
        entrada,
        arquivo,
        { totalRegistros: resultado.registros.length, criadoPor: usuarioId },
        tx,
      );
      const regrasOrdenadas = [...configuracao.regras].sort((a, b) => a.ordem - b.ordem);
      const extrato = await this.auditoria.registrarExtrato(
        {
          simulacaoId: simulacao.id,
          datasetId: simulacao.dataset_id,
          usuarioId,
          versaoEntradaId: entrada.id,
          versaoSaidaId: versaoSaida.id,
          conjuntoId: simulacao.conjunto_id,
          conjuntoRevisao: simulacao.conjunto_revisao,
          revisoesRegras: regrasOrdenadas.map((r) => ({
            regraId: r.regraId,
            revisao: r.revisao,
            nome: r.nome,
            ordem: r.ordem,
          })),
          acoesAplicadas: regrasOrdenadas
            .filter((r) => r.configuracao.acao)
            .map((r) => ({
              ordem: r.ordem,
              regraId: r.regraId,
              acao: r.configuracao.acao!.tipo,
              coluna: r.configuracao.acao!.coluna ?? null,
            })),
          totalLinhasAlteradas: resultado.linhasAlteradas.length,
          totalLinhasRemovidas: resultado.linhasRemovidas.length,
        },
        resultado.alteracoes,
        tx,
      );
      await this.simulacoes.consolidar(simulacao.id, tx);
      this.logger.log(
        `Tratamento confirmado: simulação ${simulacao.id}, versão ${versaoSaida.id}, extrato ${extrato.id}.`,
      );
      return {
        simulacaoId: simulacao.id,
        extratoId: extrato.id,
        instanteUtc: extrato.instanteUtc,
        versaoEntrada: { id: entrada.id, numero: entrada.numero, hashSha256: entrada.hash_sha256 },
        versaoSaida: paraVersaoDto(versaoSaida),
        totalLinhasAlteradas: resultado.linhasAlteradas.length,
        totalLinhasRemovidas: resultado.linhasRemovidas.length,
        totalLinhasAfetadas: resultado.totalLinhasAfetadas,
      };
    });
  }
}
