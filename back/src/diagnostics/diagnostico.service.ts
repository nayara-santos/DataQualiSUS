import { HttpStatus, Injectable } from '@nestjs/common';
import { ConflitoEstado, ErroNegocio, RecursoNaoEncontrado } from '../common/erros/erro-negocio';
import { DatasetRepository } from '../datasets/dataset.repository';
import { ConjuntoService } from '../rules/conjunto.service';
import { SimulacaoRepository } from '../simulations/simulacao.repository';
import { calcularIndicadores, cobertura } from './calculo-indicadores';
import { DiagnosticoRepository } from './diagnostico.repository';
import { AVISO_DIAGNOSTICO, DiagnosticoDto } from './diagnostico.tipos';
import { ExportacaoService, FormatoExportacao } from './exportacao/exportacao.service';

/** DiagnosticoService (P2, seção 2; UC-07): obterDiagnostico(versaoId) e calcularIndicadores. */
@Injectable()
export class DiagnosticoService {
  constructor(
    private readonly repositorio: DiagnosticoRepository,
    private readonly datasets: DatasetRepository,
    private readonly simulacoes: SimulacaoRepository,
    private readonly conjuntos: ConjuntoService,
    private readonly exportacao: ExportacaoService,
  ) {}

  /**
   * Recupera a avaliação vigente da versão. Sem avaliação, orienta executar a simulação (fluxo 2a);
   * avaliação desatualizada pela alteração das regras exige nova avaliação. Uma versão tratada
   * nunca reaproveita os números da versão anterior, pois cada avaliação pertence a uma versão.
   */
  async obterDiagnostico(versaoId: string): Promise<DiagnosticoDto> {
    const versao = await this.datasets.buscarVersao(versaoId);
    if (!versao) {
      throw new RecursoNaoEncontrado('Versão do dataset não encontrada.');
    }
    const dataset = (await this.datasets.buscarPorId(versao.dataset_id))!;
    const ultima = await this.repositorio.ultimaAvaliacao(versaoId);
    if (!ultima) {
      throw new ErroNegocio(
        'SEM_AVALIACAO',
        'Não há avaliação para esta versão. Execute uma simulação (UC-03) para obter o diagnóstico.',
        HttpStatus.NOT_FOUND,
      );
    }
    const revisao = await this.conjuntos.revisaoAtual(ultima.conjunto_id);
    if (ultima.status === 'INVALIDADA' || !revisao?.ativo || revisao.revisao !== ultima.conjunto_revisao) {
      throw new ConflitoEstado(
        'AVALIACAO_DESATUALIZADA',
        'As regras mudaram depois da última avaliação desta versão. Execute nova simulação.',
      );
    }
    const simulacao = (await this.simulacoes.buscar(ultima.id))!;
    const resultados = await this.simulacoes.listarResultados(ultima.id);
    const indicadores = calcularIndicadores(
      resultados.map((r) => ({
        regraId: r.regra_id,
        revisao: r.regra_revisao,
        nome: r.nome,
        colunas: r.colunas.map((c) => c.nome),
        dimensao: r.dimensao,
        linhasVioladas: r.linhas_violadas,
      })),
      simulacao.total_linhas!,
    );
    const resumoCobertura = cobertura(indicadores);
    await this.repositorio.registrar({
      simulacaoId: simulacao.id,
      versaoId,
      totalLinhas: simulacao.total_linhas!,
      cobertura: resumoCobertura.dimensoesAvaliadas,
      avaliadoEm: new Date(simulacao.concluida_em!),
      indicadores,
    });
    return {
      dataset: { id: dataset.id, nome: dataset.nome, situacao: dataset.situacao },
      versao: { id: versao.id, numero: versao.numero, hashSha256: versao.hash_sha256 },
      simulacaoId: simulacao.id,
      conjunto: simulacao.configuracao_executada.conjunto,
      avaliadoEm: new Date(simulacao.concluida_em!).toISOString(),
      totalLinhas: simulacao.total_linhas!,
      cobertura: resumoCobertura,
      indicadores,
      aviso: AVISO_DIAGNOSTICO,
    };
  }

  async listarVersoes() {
    return (await this.repositorio.listarVersoesAvaliaveis()).map((v) => ({
      datasetId: v.dataset_id,
      datasetNome: v.dataset_nome,
      versaoId: v.versao_id,
      numero: v.numero,
      criadoEm: new Date(v.criado_em).toISOString(),
      possuiAvaliacao: v.possui_avaliacao,
    }));
  }

  /** exportarDiagnostico(dto, formato): mesmos dados da tela em PDF ou XLSX (RF005, ADR-007). */
  async exportar(versaoId: string, formato: FormatoExportacao) {
    const dto = await this.obterDiagnostico(versaoId);
    return this.exportacao.exportarDiagnostico(dto, formato);
  }
}
