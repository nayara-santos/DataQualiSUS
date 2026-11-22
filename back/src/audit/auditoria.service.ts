import { Injectable } from '@nestjs/common';
import { RecursoNaoEncontrado } from '../common/erros/erro-negocio';
import { Executor } from '../database/database.service';
import { DatasetRepository } from '../datasets/dataset.repository';
import { ExportacaoService, LIMITE_ALTERACOES_PDF } from '../diagnostics/exportacao/exportacao.service';
import { Alteracao } from '../rules/motor/motor-regras';
import { AuditoriaRepository } from './auditoria.repository';
import { ExtratoDetalheDto, ExtratoDto, ExtratoRegistro, NovoExtrato } from './auditoria.tipos';

function paraExtratoDto(e: ExtratoRegistro): ExtratoDto {
  return {
    id: e.id,
    operacao: e.operacao,
    simulacaoId: e.simulacao_id,
    dataset: { id: e.dataset_id, nome: e.dataset_nome, situacao: e.dataset_situacao },
    usuarioId: e.usuario_id,
    instanteUtc: new Date(e.instante_utc).toISOString(),
    versaoEntrada: {
      id: e.versao_entrada_id,
      numero: e.versao_entrada_numero,
      hashSha256: e.versao_entrada_hash,
    },
    versaoSaida: { id: e.versao_saida_id, numero: e.versao_saida_numero, hashSha256: e.versao_saida_hash },
    conjunto: { id: e.conjunto_id, revisao: e.conjunto_revisao },
    revisoesRegras: e.revisoes_regras,
    acoesAplicadas: e.acoes_aplicadas,
    totalLinhasAlteradas: e.total_linhas_alteradas,
    totalLinhasRemovidas: e.total_linhas_removidas,
    totalLinhasAfetadas: e.total_linhas_afetadas,
    totalAlteracoes: Number(e.total_alteracoes),
  };
}

const MENSAGEM_INDISPONIVEL = 'Extrato de auditoria indisponível.';

/** AuditoriaService (P2, seção 2): registrarExtrato(operação, alterações, tx) e consultas. */
@Injectable()
export class AuditoriaService {
  constructor(
    private readonly repositorio: AuditoriaRepository,
    private readonly datasets: DatasetRepository,
    private readonly exportacao: ExportacaoService,
  ) {}

  /**
   * UC-05: grava o extrato e o detalhe das alterações dentro da transação recebida, antes do commit
   * do tratamento. Uma falha aqui faz o tratamento inteiro ser revertido (RN03, ADR-004).
   */
  async registrarExtrato(
    dados: NovoExtrato,
    alteracoes: Alteracao[],
    tx: Executor,
  ): Promise<{ id: string; instanteUtc: string }> {
    const extrato = await this.repositorio.inserirExtrato(dados, tx);
    await this.repositorio.inserirAlteracoes(extrato.id, alteracoes, tx);
    return { id: extrato.id, instanteUtc: new Date(extrato.instante_utc).toISOString() };
  }

  /** listarExtratos(datasetId): inclusive de dataset excluído logicamente (UC-06). */
  async listarExtratos(datasetId: string): Promise<ExtratoDto[]> {
    if (!(await this.datasets.buscarPorId(datasetId))) {
      throw new RecursoNaoEncontrado('Dataset não encontrado.');
    }
    return (await this.repositorio.listarPorDataset(datasetId)).map(paraExtratoDto);
  }

  async listarDatasetsAuditados() {
    return (await this.repositorio.listarDatasetsAuditados()).map((d) => ({
      id: d.id,
      nome: d.nome,
      situacao: d.situacao,
      totalExtratos: Number(d.total_extratos),
      ultimaIntervencao: new Date(d.ultimo).toISOString(),
    }));
  }

  async obterExtrato(id: string, pagina = 1, tamanho = 100): Promise<ExtratoDetalheDto> {
    const registro = await this.repositorio.buscarExtrato(id);
    if (!registro) {
      throw new RecursoNaoEncontrado(MENSAGEM_INDISPONIVEL);
    }
    const extrato = paraExtratoDto(registro);
    const itens = await this.repositorio.listarAlteracoes(id, (pagina - 1) * tamanho, tamanho);
    return { ...extrato, alteracoes: { pagina, tamanho, total: extrato.totalAlteracoes, itens } };
  }

  /** UC-06, passos 4 e 5: PDF com os mesmos campos exibidos; falha não altera registros. */
  async exportarPdf(id: string): Promise<{ nomeArquivo: string; conteudo: Buffer }> {
    const registro = await this.repositorio.buscarExtrato(id);
    if (!registro) {
      throw new RecursoNaoEncontrado(MENSAGEM_INDISPONIVEL);
    }
    const extrato = paraExtratoDto(registro);
    const alteracoes = await this.repositorio.listarAlteracoes(id, 0, LIMITE_ALTERACOES_PDF);
    return {
      nomeArquivo: `extrato-auditoria-${extrato.id}.pdf`,
      conteudo: await this.exportacao.exportarExtratoPdf(extrato, alteracoes),
    };
  }
}
