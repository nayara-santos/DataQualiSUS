import { HttpStatus, Injectable } from '@nestjs/common';
import { ConflitoEstado, ErroNegocio, RecursoNaoEncontrado } from '../common/erros/erro-negocio';
import { DatabaseService, Executor } from '../database/database.service';
import { DatasetRepository } from '../datasets/dataset.repository';
import { DatasetService } from '../datasets/dataset.service';
import { validarConjunto, verificarColunas } from './motor/validacao-configuracao';
import { NotificadorRevisaoConjunto } from './notificador-revisao';
import { RegrasRepository } from './regras.repository';
import {
  ConjuntoDto,
  ConjuntoParaExecucao,
  ConjuntoRegistro,
  ItemConjunto,
  RegraNoConjuntoDto,
  SituacaoCadastro,
} from './regras.tipos';

/** Gestão de conjuntos de regras (UC-02, tela T02): ordem explícita, revisões e associação. */
@Injectable()
export class ConjuntoService {
  constructor(
    private readonly banco: DatabaseService,
    private readonly repositorio: RegrasRepository,
    private readonly datasets: DatasetService,
    private readonly datasetRepositorio: DatasetRepository,
    private readonly notificador: NotificadorRevisaoConjunto,
  ) {}

  /** Monta os itens na ordem recebida, com a revisão atual de cada regra, e valida o conjunto. */
  private async resolverItens(regraIds: string[], tx: Executor): Promise<ItemConjunto[]> {
    const regras = await this.repositorio.buscarRegras(regraIds, tx);
    const porId = new Map(regras.map((r) => [r.id, r]));
    const ausentes = regraIds.filter((id) => porId.get(id)?.situacao !== SituacaoCadastro.ATIVO);
    if (ausentes.length > 0) {
      throw new ErroNegocio(
        'REGRA_INDISPONIVEL',
        'O conjunto referencia regras inexistentes ou excluídas.',
        HttpStatus.UNPROCESSABLE_ENTITY,
        ausentes.map((id) => ({ campo: 'regras', mensagem: `Regra ${id} indisponível.` })),
      );
    }
    const erros = validarConjunto(
      regraIds.map((id) => ({
        regraId: id,
        nome: porId.get(id)!.nome,
        configuracao: porId.get(id)!.configuracao,
      })),
    );
    if (erros.length > 0) {
      throw new ErroNegocio(
        'CONJUNTO_INCOMPATIVEL',
        'O conjunto possui regras conflitantes e não foi salvo.',
        HttpStatus.UNPROCESSABLE_ENTITY,
        erros,
      );
    }
    return regraIds.map((id, indice) => ({
      regraId: id,
      regraRevisao: porId.get(id)!.revisao_atual,
      ordem: indice + 1,
    }));
  }

  async criar(
    dados: { nome: string; descricao?: string; regras: string[] },
    usuarioId: string,
  ): Promise<ConjuntoDto> {
    const id = await this.banco.transacao(async (tx) => {
      const itens = await this.resolverItens(dados.regras, tx);
      return this.repositorio.inserirConjunto(
        { nome: dados.nome.trim(), descricao: dados.descricao?.trim() ?? '', itens, usuarioId },
        tx,
      );
    });
    return this.obter(id);
  }

  /** Toda alteração gera revisão e invalida as simulações anteriores do conjunto (MOD-16). */
  async atualizar(
    id: string,
    dados: { nome?: string; descricao?: string; regras?: string[] },
    usuarioId: string,
  ): Promise<ConjuntoDto> {
    if (dados.nome === undefined && dados.descricao === undefined && dados.regras === undefined) {
      throw new ErroNegocio(
        'ALTERACAO_AUSENTE',
        'Informe ao menos um campo para alterar.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.banco.transacao(async (tx) => {
      const atual = await this.buscarAtivo(id, tx, true);
      const itens = dados.regras !== undefined ? await this.resolverItens(dados.regras, tx) : atual.itens;
      await this.repositorio.revisarConjunto(
        id,
        {
          nome: dados.nome?.trim() ?? atual.nome,
          descricao: dados.descricao?.trim() ?? atual.descricao,
          itens,
          motivo: 'EDICAO_CONJUNTO',
          usuarioId,
        },
        tx,
      );
      await this.notificador.notificar([id], tx);
    });
    return this.obter(id);
  }

  async excluir(id: string): Promise<ConjuntoDto> {
    await this.banco.transacao(async (tx) => {
      await this.buscarAtivo(id, tx, true);
      await this.repositorio.excluirConjunto(id, tx);
      await this.notificador.notificar([id], tx);
    });
    return this.obter(id);
  }

  async listar(): Promise<ConjuntoDto[]> {
    const conjuntos = await this.repositorio.listarConjuntosAtivos();
    const associacoes = await this.repositorio.datasetsAssociados(conjuntos.map((c) => c.id));
    return Promise.all(conjuntos.map((c) => this.paraDto(c, associacoes.get(c.id) ?? [])));
  }

  async obter(id: string): Promise<ConjuntoDto> {
    const conjunto = await this.repositorio.buscarConjunto(id);
    if (!conjunto) {
      throw new RecursoNaoEncontrado('Conjunto de regras não encontrado.');
    }
    const associacoes = await this.repositorio.datasetsAssociados([id]);
    return this.paraDto(conjunto, associacoes.get(id) ?? []);
  }

  async listarRevisoes(id: string) {
    await this.obter(id);
    return (await this.repositorio.listarRevisoesConjunto(id)).map((r) => ({
      revisao: r.revisao,
      nome: r.nome,
      descricao: r.descricao,
      itens: r.itens,
      motivo: r.motivo,
      criadoPor: r.criado_por,
      criadoEm: new Date(r.criado_em).toISOString(),
    }));
  }

  /**
   * associar(conjuntoId, datasetId): exige conjunto e dataset ativos e rejeita configurações
   * incompatíveis com o cabeçalho da versão atual (coluna inexistente).
   */
  async associar(conjuntoId: string, datasetId: string, usuarioId: string): Promise<ConjuntoDto> {
    const conjunto = await this.buscarAtivo(conjuntoId);
    const dataset = await this.datasets.obterDataset(datasetId);
    this.datasets.exigirAtivo(dataset);
    const versao = await this.datasetRepositorio.buscarVersaoAtual(datasetId);
    const regras = await this.regrasDoConjunto(conjunto.itens);
    const erros = verificarColunas(regras, versao?.colunas ?? []);
    if (erros.length > 0) {
      throw new ErroNegocio(
        'CONJUNTO_INCOMPATIVEL_COM_DATASET',
        'O conjunto referencia colunas que não existem na versão atual do dataset.',
        HttpStatus.UNPROCESSABLE_ENTITY,
        erros,
      );
    }
    await this.repositorio.associar(conjuntoId, datasetId, usuarioId);
    return this.obter(conjuntoId);
  }

  async desassociar(conjuntoId: string, datasetId: string): Promise<ConjuntoDto> {
    await this.obter(conjuntoId);
    if (!(await this.repositorio.desassociar(conjuntoId, datasetId))) {
      throw new RecursoNaoEncontrado('O conjunto não está associado a este dataset.');
    }
    return this.obter(conjuntoId);
  }

  /** Configuração congelada da revisão atual, usada para registrar a configuração executada. */
  async obterParaExecucao(conjuntoId: string, executor?: Executor): Promise<ConjuntoParaExecucao> {
    const conjunto = await this.buscarAtivo(conjuntoId, executor);
    return {
      conjuntoId: conjunto.id,
      nome: conjunto.nome,
      revisao: conjunto.revisao_atual,
      regras: await this.regrasDoConjunto(conjunto.itens, executor),
    };
  }

  async revisaoAtual(
    conjuntoId: string,
    executor?: Executor,
  ): Promise<{ revisao: number; ativo: boolean } | null> {
    const conjunto = await this.repositorio.buscarConjunto(conjuntoId, executor);
    return conjunto
      ? { revisao: conjunto.revisao_atual, ativo: conjunto.situacao === SituacaoCadastro.ATIVO }
      : null;
  }

  estaAssociado(conjuntoId: string, datasetId: string, executor?: Executor): Promise<boolean> {
    return this.repositorio.estaAssociado(conjuntoId, datasetId, executor);
  }

  private async regrasDoConjunto(itens: ItemConjunto[], executor?: Executor): Promise<RegraNoConjuntoDto[]> {
    const revisoes = await this.repositorio.buscarRevisoesRegra(
      itens.map((i) => ({ regraId: i.regraId, revisao: i.regraRevisao })),
      executor,
    );
    const porChave = new Map(revisoes.map((r) => [`${r.regra_id}:${r.revisao}`, r]));
    return [...itens]
      .sort((a, b) => a.ordem - b.ordem)
      .map((item) => {
        const r = porChave.get(`${item.regraId}:${item.regraRevisao}`)!;
        return {
          ordem: item.ordem,
          regraId: item.regraId,
          revisao: item.regraRevisao,
          nome: r.nome,
          dimensao: r.dimensao,
          configuracao: r.configuracao,
        };
      });
  }

  private async paraDto(conjunto: ConjuntoRegistro, datasets: string[]): Promise<ConjuntoDto> {
    return {
      id: conjunto.id,
      nome: conjunto.nome,
      descricao: conjunto.descricao,
      revisao: conjunto.revisao_atual,
      situacao: conjunto.situacao,
      regras: await this.regrasDoConjunto(conjunto.itens),
      datasets,
      criadoEm: new Date(conjunto.criado_em).toISOString(),
      atualizadoEm: new Date(conjunto.atualizado_em).toISOString(),
    };
  }

  private async buscarAtivo(id: string, executor?: Executor, bloquear = false): Promise<ConjuntoRegistro> {
    const conjunto = await this.repositorio.buscarConjunto(id, executor, bloquear);
    if (!conjunto) {
      throw new RecursoNaoEncontrado('Conjunto de regras não encontrado.');
    }
    if (conjunto.situacao !== SituacaoCadastro.ATIVO) {
      throw new ConflitoEstado('CONJUNTO_EXCLUIDO', 'O conjunto de regras foi excluído logicamente.');
    }
    return conjunto;
  }
}
