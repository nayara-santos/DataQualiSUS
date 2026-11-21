import { HttpStatus, Injectable } from '@nestjs/common';
import { ConflitoEstado, ErroNegocio, RecursoNaoEncontrado } from '../common/erros/erro-negocio';
import { DatabaseService, Executor } from '../database/database.service';
import { ConfiguracaoRegra } from './motor/tipos';
import { validarConfiguracaoRegra, validarConjunto } from './motor/validacao-configuracao';
import { NotificadorRevisaoConjunto } from './notificador-revisao';
import { RegrasRepository } from './regras.repository';
import { paraRegraDto, RegraDto, RegraRegistro, SituacaoCadastro } from './regras.tipos';
import { VocabularioService } from './vocabularios/vocabulario.service';

/** RegraService (P2, seção 2): salvarRegra e validarParametros, com revisões a cada edição. */
@Injectable()
export class RegraService {
  constructor(
    private readonly banco: DatabaseService,
    private readonly repositorio: RegrasRepository,
    private readonly vocabularios: VocabularioService,
    private readonly notificador: NotificadorRevisaoConjunto,
  ) {}

  /** validarParametros: catálogo, tipos, limites e vocabulário disponível (RF002, RN02). */
  async validarParametros(configuracao: unknown): Promise<ConfiguracaoRegra> {
    const referenciados = this.vocabulariosReferenciados(configuracao);
    const disponiveis = await this.vocabularios.disponiveis(referenciados);
    const resultado = validarConfiguracaoRegra(configuracao, {
      vocabulariosDisponiveis: new Set(disponiveis.keys()),
    });
    if (!resultado.valida) {
      throw new ErroNegocio(
        'CONFIGURACAO_INVALIDA',
        'A configuração da regra não atende ao catálogo e não foi salva.',
        HttpStatus.UNPROCESSABLE_ENTITY,
        resultado.erros,
      );
    }
    return resultado.configuracao;
  }

  private vocabulariosReferenciados(configuracao: unknown): string[] {
    const condicoes = (configuracao as { condicoes?: unknown })?.condicoes;
    if (!Array.isArray(condicoes)) {
      return [];
    }
    return condicoes
      .map((c) => (c as { vocabularioId?: unknown })?.vocabularioId)
      .filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id));
  }

  async criar(
    dados: { nome: string; descricao?: string; configuracao: unknown },
    usuarioId: string,
  ): Promise<RegraDto> {
    const configuracao = await this.validarParametros(dados.configuracao);
    const id = await this.banco.transacao((tx) =>
      this.repositorio.inserirRegra(
        {
          nome: dados.nome.trim(),
          descricao: dados.descricao?.trim() ?? '',
          dimensao: configuracao.dimensao,
          configuracao,
          usuarioId,
        },
        tx,
      ),
    );
    return this.obter(id);
  }

  async listar(): Promise<RegraDto[]> {
    return (await this.repositorio.listarRegrasAtivas()).map(paraRegraDto);
  }

  async obter(id: string): Promise<RegraDto> {
    return paraRegraDto(await this.buscar(id));
  }

  async listarRevisoes(id: string) {
    await this.buscar(id);
    return (await this.repositorio.listarRevisoesRegra(id)).map((r) => ({
      revisao: r.revisao,
      nome: r.nome,
      descricao: r.descricao,
      dimensao: r.dimensao,
      configuracao: r.configuracao,
      criadoPor: r.criado_por,
      criadoEm: new Date(r.criado_em).toISOString(),
    }));
  }

  /**
   * Edição gera nova revisão da regra e de cada conjunto ativo que a utiliza; simulações desses
   * conjuntos deixam de estar vigentes (UC-02, fluxo 6c). Revisões antigas seguem consultáveis.
   */
  async atualizar(
    id: string,
    dados: { nome?: string; descricao?: string; configuracao?: unknown },
    usuarioId: string,
  ): Promise<RegraDto> {
    if (dados.nome === undefined && dados.descricao === undefined && dados.configuracao === undefined) {
      throw new ErroNegocio(
        'ALTERACAO_AUSENTE',
        'Informe ao menos um campo para alterar.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const configuracaoNova =
      dados.configuracao !== undefined ? await this.validarParametros(dados.configuracao) : undefined;
    await this.banco.transacao(async (tx) => {
      const atual = await this.repositorio.buscarRegra(id, tx, true);
      if (!atual) {
        throw new RecursoNaoEncontrado('Regra não encontrada.');
      }
      this.exigirAtiva(atual);
      const configuracao = configuracaoNova ?? atual.configuracao;
      const revisao = await this.repositorio.revisarRegra(
        id,
        {
          nome: dados.nome?.trim() ?? atual.nome,
          descricao: dados.descricao?.trim() ?? atual.descricao,
          dimensao: configuracao.dimensao,
          configuracao,
          usuarioId,
        },
        tx,
      );
      await this.propagarRevisao(id, revisao, usuarioId, tx);
    });
    return this.obter(id);
  }

  private async propagarRevisao(
    regraId: string,
    revisao: number,
    usuarioId: string,
    tx: Executor,
  ): Promise<void> {
    const conjuntos = await this.repositorio.listarConjuntosComRegra(regraId, tx);
    for (const conjunto of conjuntos) {
      const itens = conjunto.itens.map((item) =>
        item.regraId === regraId ? { ...item, regraRevisao: revisao } : item,
      );
      const revisoes = await this.repositorio.buscarRevisoesRegra(
        itens.map((i) => ({ regraId: i.regraId, revisao: i.regraRevisao })),
        tx,
      );
      const porId = new Map(revisoes.map((r) => [r.regra_id, r]));
      const erros = validarConjunto(
        itens.map((i) => {
          const r = porId.get(i.regraId)!;
          return { regraId: i.regraId, nome: r.nome, configuracao: r.configuracao };
        }),
      );
      if (erros.length > 0) {
        throw new ErroNegocio(
          'CONJUNTO_INCOMPATIVEL',
          `A alteração torna o conjunto "${conjunto.nome}" inconsistente e não foi salva.`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          erros,
        );
      }
      await this.repositorio.revisarConjunto(
        conjunto.id,
        { nome: conjunto.nome, descricao: conjunto.descricao, itens, motivo: 'REVISAO_REGRA', usuarioId },
        tx,
      );
    }
    await this.notificador.notificar(
      conjuntos.map((c) => c.id),
      tx,
    );
  }

  /** Exclusão lógica: impedida enquanto a regra integrar um conjunto ativo. */
  async excluir(id: string): Promise<RegraDto> {
    await this.banco.transacao(async (tx) => {
      const regra = await this.repositorio.buscarRegra(id, tx, true);
      if (!regra) {
        throw new RecursoNaoEncontrado('Regra não encontrada.');
      }
      this.exigirAtiva(regra);
      const emUso = await this.repositorio.listarConjuntosComRegra(id, tx);
      if (emUso.length > 0) {
        throw new ConflitoEstado(
          'REGRA_EM_USO',
          'A regra integra conjuntos ativos. Remova-a dos conjuntos antes de excluí-la.',
          emUso.map((c) => ({ conjuntoId: c.id, nome: c.nome })),
        );
      }
      await this.repositorio.excluirRegra(id, tx);
    });
    return this.obter(id);
  }

  private async buscar(id: string): Promise<RegraRegistro> {
    const regra = await this.repositorio.buscarRegra(id);
    if (!regra) {
      throw new RecursoNaoEncontrado('Regra não encontrada.');
    }
    return regra;
  }

  private exigirAtiva(regra: RegraRegistro): void {
    if (regra.situacao !== SituacaoCadastro.ATIVO) {
      throw new ConflitoEstado('REGRA_EXCLUIDA', 'A regra foi excluída logicamente.');
    }
  }
}
