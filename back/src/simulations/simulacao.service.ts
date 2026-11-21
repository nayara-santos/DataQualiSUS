import * as path from 'path';
import { HttpStatus, Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ErroNegocio, RecursoNaoEncontrado } from '../common/erros/erro-negocio';
import { CONFIGURACAO, Configuracao } from '../config/configuracao';
import { Executor } from '../database/database.service';
import { ArmazenamentoArquivosService } from '../datasets/armazenamento-arquivos.service';
import { DatasetRepository } from '../datasets/dataset.repository';
import { SituacaoDataset } from '../datasets/dataset.tipos';
import { ConjuntoService } from '../rules/conjunto.service';
import { RegraExecutavel } from '../rules/motor/tipos';
import { verificarColunas } from '../rules/motor/validacao-configuracao';
import { NotificadorRevisaoConjunto } from '../rules/notificador-revisao';
import { VocabularioService } from '../rules/vocabularios/vocabulario.service';
import { ExecutorComLimite } from './executor-com-limite';
import { SimulacaoRepository } from './simulacao.repository';
import {
  ConfiguracaoExecutada,
  ResultadoRegraRegistro,
  SimulacaoDto,
  SimulacaoRegistro,
  StatusSimulacao,
  Vigencia,
} from './simulacao.tipos';
import { DadosTarefaSimulacao, ResultadoTarefaSimulacao } from './tarefa-simulacao';

export const EXECUTOR_SIMULACAO = Symbol('EXECUTOR_SIMULACAO');

/**
 * SimulacaoService (P2, seção 2; UC-03): registra a configuração executada, aciona o
 * ExecutorComLimite e controla a vigência. Nenhum conteúdo persistido é alterado (RF003).
 */
@Injectable()
export class SimulacaoService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SimulacaoService.name);
  private readonly execucoes = new Map<string, Promise<void>>();

  constructor(
    private readonly repositorio: SimulacaoRepository,
    private readonly datasets: DatasetRepository,
    private readonly conjuntos: ConjuntoService,
    private readonly vocabularios: VocabularioService,
    private readonly armazenamento: ArmazenamentoArquivosService,
    private readonly notificador: NotificadorRevisaoConjunto,
    @Inject(EXECUTOR_SIMULACAO) private readonly executor: ExecutorComLimite,
    @Inject(CONFIGURACAO) private readonly configuracao: Configuracao,
  ) {}

  async onModuleInit(): Promise<void> {
    this.notificador.registrar((conjuntoIds, tx) => this.invalidar(conjuntoIds, tx));
    const interrompidas = await this.repositorio.marcarInterrompidas();
    if (interrompidas > 0) {
      this.logger.warn(`${interrompidas} simulação(ões) interrompida(s) marcada(s) como FALHA.`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.executor.encerrar();
    await Promise.allSettled([...this.execucoes.values()]);
  }

  private async invalidar(conjuntoIds: string[], tx: Executor): Promise<void> {
    await this.repositorio.invalidarPorConjuntos(conjuntoIds, tx);
  }

  /**
   * simular(versaoId, conjuntoId): valida a compatibilidade antes de executar (UC-03, fluxo 3a),
   * registra a configuração executada e devolve imediatamente; a SPA consulta o estado.
   */
  async simular(versaoId: string, conjuntoId: string, usuarioId: string): Promise<SimulacaoDto> {
    const versao = await this.datasets.buscarVersao(versaoId);
    if (!versao) {
      throw new RecursoNaoEncontrado('Versão do dataset não encontrada.');
    }
    const dataset = await this.datasets.buscarPorId(versao.dataset_id);
    if (!dataset || dataset.situacao !== SituacaoDataset.ATIVO) {
      throw new ErroNegocio(
        'DATASET_EXCLUIDO',
        'O dataset foi excluído logicamente e não pode ser simulado.',
        HttpStatus.CONFLICT,
      );
    }
    const conjunto = await this.conjuntos.obterParaExecucao(conjuntoId);
    if (!(await this.conjuntos.estaAssociado(conjuntoId, dataset.id))) {
      throw new ErroNegocio(
        'CONJUNTO_NAO_ASSOCIADO',
        'Associe o conjunto de regras ao dataset antes de simular.',
      );
    }
    if (conjunto.regras.length === 0) {
      throw new ErroNegocio('CONJUNTO_SEM_REGRAS', 'O conjunto não possui regras para avaliar.');
    }
    const incompatibilidades = verificarColunas(conjunto.regras, versao.colunas);
    if (incompatibilidades.length > 0) {
      throw new ErroNegocio(
        'CONFIGURACAO_INCOMPATIVEL',
        'As regras referenciam colunas inexistentes nesta versão do dataset.',
        HttpStatus.UNPROCESSABLE_ENTITY,
        incompatibilidades,
      );
    }
    const idsVocabularios = conjunto.regras.flatMap((r) =>
      r.configuracao.dimensao === 'VALIDADE'
        ? r.configuracao.condicoes.flatMap((c) => (c.vocabularioId ? [c.vocabularioId] : []))
        : [],
    );
    const disponiveis = await this.vocabularios.disponiveis(idsVocabularios);
    const ausentes = [...new Set(idsVocabularios)].filter((id) => !disponiveis.has(id));
    if (ausentes.length > 0) {
      throw new ErroNegocio(
        'VOCABULARIO_INDISPONIVEL',
        'Vocabulário oficial indisponível: a regra correspondente está bloqueada.',
        HttpStatus.UNPROCESSABLE_ENTITY,
        ausentes,
      );
    }
    const regras: RegraExecutavel[] = conjunto.regras.map((r) => ({
      regraId: r.regraId,
      revisao: r.revisao,
      nome: r.nome,
      ordem: r.ordem,
      configuracao: r.configuracao,
    }));
    const configuracao: ConfiguracaoExecutada = {
      versao: {
        id: versao.id,
        datasetId: versao.dataset_id,
        numero: versao.numero,
        hashSha256: versao.hash_sha256,
        colunas: versao.colunas,
        separador: versao.separador,
        totalRegistros: versao.total_registros,
      },
      conjunto: { id: conjunto.conjuntoId, nome: conjunto.nome, revisao: conjunto.revisao },
      regras,
      vocabularios: [...disponiveis.values()].map((v) => ({
        id: v.id,
        nome: v.nome,
        versao: v.versao,
        origem: v.origem,
        licenca: v.licenca,
        hashArquivo: v.hashArquivo,
      })),
      limiteMs: this.configuracao.simulacaoLimiteMs,
    };
    const registro = await this.repositorio.registrar(configuracao, usuarioId);
    const codigos: Record<string, string[]> = {};
    for (const id of disponiveis.keys()) {
      codigos[id] = await this.vocabularios.listarCodigos(id);
    }
    const dados: DadosTarefaSimulacao = {
      caminhoArquivo: path.join(this.armazenamento.diretorio, versao.caminho_arquivo),
      hashEsperado: versao.hash_sha256,
      separador: versao.separador,
      colunasEsperadas: versao.colunas,
      regras,
      vocabularios: codigos,
    };
    const aceitoEm = new Date(registro.aceita_em).getTime();
    const execucao = this.executar(registro.id, configuracao, dados, aceitoEm).finally(() =>
      this.execucoes.delete(registro.id),
    );
    this.execucoes.set(registro.id, execucao);
    return this.paraDto(registro, []);
  }

  private async executar(
    id: string,
    configuracao: ConfiguracaoExecutada,
    dados: DadosTarefaSimulacao,
    aceitoEm: number,
  ): Promise<void> {
    try {
      const resultado = await this.executor.executar<DadosTarefaSimulacao, ResultadoTarefaSimulacao>(
        dados,
        configuracao.limiteMs,
        aceitoEm,
      );
      if (resultado.status === 'CONCLUIDO') {
        const integro = await this.armazenamento.verificarIntegridade(
          path.basename(dados.caminhoArquivo),
          configuracao.versao.hashSha256,
        );
        if (!integro) {
          await this.repositorio.encerrarSemResultado(
            id,
            StatusSimulacao.FALHA,
            'A integridade do arquivo da versão não confere.',
          );
          return;
        }
        await this.repositorio.concluir(id, configuracao, resultado.resultado);
      } else if (resultado.status === 'TEMPO_ESGOTADO') {
        await this.repositorio.encerrarSemResultado(
          id,
          StatusSimulacao.TEMPO_ESGOTADO,
          `A simulação não terminou em ${Math.round(configuracao.limiteMs / 1000)} segundos e foi cancelada; a aplicação permanece desabilitada.`,
        );
      } else {
        await this.repositorio.encerrarSemResultado(id, StatusSimulacao.FALHA, resultado.mensagem);
      }
    } catch (erro) {
      this.logger.error(`Falha ao registrar o resultado da simulação ${id}: ${(erro as Error).message}`);
      await this.repositorio
        .encerrarSemResultado(id, StatusSimulacao.FALHA, 'Falha ao registrar o resultado da simulação.')
        .catch(() => undefined);
    }
  }

  /** Aguarda o término de uma execução em andamento (usado em testes e no desligamento). */
  async aguardar(id: string): Promise<void> {
    await this.execucoes.get(id);
  }

  async obter(id: string): Promise<SimulacaoDto> {
    const registro = await this.repositorio.buscar(id);
    if (!registro) {
      throw new RecursoNaoEncontrado('Simulação não encontrada.');
    }
    return this.paraDto(registro, await this.repositorio.listarResultados(id));
  }

  async listarPorVersao(versaoId: string): Promise<SimulacaoDto[]> {
    const registros = await this.repositorio.listarPorVersao(versaoId);
    return Promise.all(
      registros.map(async (r) => this.paraDto(r, await this.repositorio.listarResultados(r.id))),
    );
  }

  /**
   * validarVigencia(simulacaoId) / estaVigentePara (MOD-16): concluída, dataset ativo e conjunto
   * ativo na mesma revisão executada. A versão é imutável, logo a entrada não muda.
   */
  async validarVigencia(simulacao: SimulacaoRegistro, executor?: Executor): Promise<Vigencia> {
    const motivosPorStatus: Partial<Record<StatusSimulacao, Vigencia>> = {
      [StatusSimulacao.EM_EXECUCAO]: {
        vigente: false,
        codigo: 'SIMULACAO_EM_EXECUCAO',
        motivo: 'A simulação ainda está em execução.',
      },
      [StatusSimulacao.TEMPO_ESGOTADO]: {
        vigente: false,
        codigo: 'SIMULACAO_TEMPO_ESGOTADO',
        motivo: 'A simulação atingiu o tempo limite; o resultado incompleto não pode ser aplicado.',
      },
      [StatusSimulacao.FALHA]: {
        vigente: false,
        codigo: 'SIMULACAO_FALHOU',
        motivo: 'A simulação falhou e não pode ser aplicada.',
      },
      [StatusSimulacao.INVALIDADA]: {
        vigente: false,
        codigo: 'SIMULACAO_INVALIDADA',
        motivo: 'As regras foram alteradas depois da simulação; execute nova simulação.',
      },
      [StatusSimulacao.CONSOLIDADA]: {
        vigente: false,
        codigo: 'SIMULACAO_JA_APLICADA',
        motivo: 'Esta simulação já foi aplicada e não pode ser reaplicada.',
      },
    };
    const porStatus = motivosPorStatus[simulacao.status];
    if (porStatus) {
      return porStatus;
    }
    const dataset = await this.datasets.buscarPorId(simulacao.dataset_id, executor);
    if (!dataset || dataset.situacao !== SituacaoDataset.ATIVO) {
      return { vigente: false, codigo: 'DATASET_EXCLUIDO', motivo: 'O dataset foi excluído logicamente.' };
    }
    const revisao = await this.conjuntos.revisaoAtual(simulacao.conjunto_id, executor);
    if (!revisao || !revisao.ativo || revisao.revisao !== simulacao.conjunto_revisao) {
      return {
        vigente: false,
        codigo: 'SIMULACAO_INVALIDADA',
        motivo: 'A configuração das regras mudou depois da simulação; execute nova simulação.',
      };
    }
    return { vigente: true };
  }

  private async paraDto(
    registro: SimulacaoRegistro,
    resultados: ResultadoRegraRegistro[],
  ): Promise<SimulacaoDto> {
    const vigencia = await this.validarVigencia(registro);
    const alteradas = registro.total_previsto_alteradas;
    const removidas = registro.total_previsto_removidas;
    const afetadas = alteradas === null || removidas === null ? null : alteradas + removidas;
    const configuracao = registro.configuracao_executada;
    return {
      id: registro.id,
      status: registro.status,
      mensagem: registro.mensagem,
      datasetId: registro.dataset_id,
      versaoId: registro.versao_id,
      versaoNumero: configuracao.versao.numero,
      conjunto: configuracao.conjunto,
      aceitaEm: new Date(registro.aceita_em).toISOString(),
      concluidaEm: registro.concluida_em ? new Date(registro.concluida_em).toISOString() : null,
      limiteMs: registro.limite_ms,
      vigente: vigencia.vigente,
      motivoNaoVigente: vigencia.motivo ?? null,
      aplicavel: vigencia.vigente && (afetadas ?? 0) > 0,
      hashEntrada: configuracao.versao.hashSha256,
      hashEntradaConferido: registro.hash_entrada_conferido,
      totalLinhas: registro.total_linhas,
      totalLinhasComViolacao: registro.total_linhas_com_violacao,
      totalPrevistoAlteradas: alteradas,
      totalPrevistoRemovidas: removidas,
      totalPrevistoAfetadas: afetadas,
      resultados: resultados.map((r) => ({
        ordem: r.ordem,
        regraId: r.regra_id,
        revisao: r.regra_revisao,
        nome: r.nome,
        dimensao: r.dimensao,
        colunas: r.colunas.map((c) => c.nome),
        totalAvaliados: r.total_avaliados,
        totalViolacoes: r.total_violacoes,
        linhasVioladas: r.linhas_violadas,
        percentualAprovacao: Number(r.percentual_aprovacao),
        acao: r.acao,
        linhasPrevistas: r.linhas_previstas,
      })),
      previa: registro.previa ?? [],
      configuracaoExecutada: configuracao,
    };
  }
}
