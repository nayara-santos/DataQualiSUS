import { ConflitoEstado, ErroNegocio, RecursoNaoEncontrado } from '../common/erros/erro-negocio';
import { DatasetRepository } from '../datasets/dataset.repository';
import { ConjuntoService } from '../rules/conjunto.service';
import { DimensaoQualidade } from '../rules/motor/tipos';
import { SimulacaoRepository } from '../simulations/simulacao.repository';
import { DiagnosticoRepository } from './diagnostico.repository';
import { DiagnosticoService } from './diagnostico.service';
import { ExportacaoService } from './exportacao/exportacao.service';

describe('DiagnosticoService (UC-07)', () => {
  let repositorio: jest.Mocked<DiagnosticoRepository>;
  let datasets: jest.Mocked<DatasetRepository>;
  let simulacoes: jest.Mocked<SimulacaoRepository>;
  let conjuntos: jest.Mocked<ConjuntoService>;
  let servico: DiagnosticoService;

  beforeEach(() => {
    repositorio = {
      ultimaAvaliacao: jest
        .fn()
        .mockResolvedValue({ id: 's1', status: 'CONCLUIDA', conjunto_id: 'c1', conjunto_revisao: 2 }),
      registrar: jest.fn(),
    } as unknown as jest.Mocked<DiagnosticoRepository>;
    datasets = {
      buscarVersao: jest.fn().mockResolvedValue({ id: 'v1', dataset_id: 'd1', numero: 1, hash_sha256: 'h' }),
      buscarPorId: jest.fn().mockResolvedValue({ id: 'd1', nome: 'Base', situacao: 'ATIVO' }),
    } as unknown as jest.Mocked<DatasetRepository>;
    simulacoes = {
      buscar: jest.fn().mockResolvedValue({
        id: 's1',
        total_linhas: 4,
        concluida_em: new Date('2026-11-01T10:00:00Z'),
        configuracao_executada: { conjunto: { id: 'c1', nome: 'C', revisao: 2 } },
      }),
      listarResultados: jest.fn().mockResolvedValue([
        {
          regra_id: 'r1',
          regra_revisao: 1,
          nome: 'U',
          colunas: [{ nome: 'id' }],
          dimensao: DimensaoQualidade.UNICIDADE,
          linhas_violadas: [4],
        },
        {
          regra_id: 'r2',
          regra_revisao: 1,
          nome: 'V1',
          colunas: [{ nome: 'x' }],
          dimensao: DimensaoQualidade.VALIDADE,
          linhas_violadas: [1, 2],
        },
        {
          regra_id: 'r3',
          regra_revisao: 1,
          nome: 'V2',
          colunas: [{ nome: 'y' }],
          dimensao: DimensaoQualidade.VALIDADE,
          linhas_violadas: [2],
        },
      ]),
    } as unknown as jest.Mocked<SimulacaoRepository>;
    conjuntos = {
      revisaoAtual: jest.fn().mockResolvedValue({ revisao: 2, ativo: true }),
    } as unknown as jest.Mocked<ConjuntoService>;
    servico = new DiagnosticoService(repositorio, datasets, simulacoes, conjuntos, new ExportacaoService());
  });

  it('monta os três indicadores, cobertura, versão e instante da avaliação', async () => {
    const dto = await servico.obterDiagnostico('v1');
    expect(dto.versao).toEqual({ id: 'v1', numero: 1, hashSha256: 'h' });
    expect(dto.avaliadoEm).toBe('2026-11-01T10:00:00.000Z');
    expect(dto.indicadores.map((i) => [i.dimensao, i.situacao, i.percentual])).toEqual([
      ['UNICIDADE', 'AVALIADA', 75],
      ['COMPLETUDE', 'NAO_AVALIADA', null],
      ['VALIDADE', 'AVALIADA', 50],
    ]);
    expect(dto.cobertura).toEqual({ dimensoesAvaliadas: 2, totalDimensoes: 3, situacao: 'PARCIAL' });
    expect(dto.aviso).toContain('não constituem certificação');
    expect(repositorio.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ simulacaoId: 's1', cobertura: 2, totalLinhas: 4 }),
    );
  });

  it('orienta executar a simulação quando a versão não tem avaliação', async () => {
    repositorio.ultimaAvaliacao.mockResolvedValue(null);
    const erro = await servico.obterDiagnostico('v1').catch((e) => e);
    expect(erro).toBeInstanceOf(ErroNegocio);
    expect(erro.getStatus()).toBe(404);
    expect(erro.getResponse().erro).toBe('SEM_AVALIACAO');
  });

  it.each([
    [
      'simulação invalidada',
      () =>
        repositorio.ultimaAvaliacao.mockResolvedValue({
          id: 's1',
          status: 'INVALIDADA',
          conjunto_id: 'c1',
          conjunto_revisao: 2,
        }),
    ],
    [
      'revisão do conjunto alterada',
      () => conjuntos.revisaoAtual.mockResolvedValue({ revisao: 3, ativo: true }),
    ],
    ['conjunto excluído', () => conjuntos.revisaoAtual.mockResolvedValue({ revisao: 2, ativo: false })],
  ])('exige nova avaliação com %s', async (_caso, preparar) => {
    preparar();
    await expect(servico.obterDiagnostico('v1')).rejects.toBeInstanceOf(ConflitoEstado);
  });

  it('devolve 404 para versão inexistente', async () => {
    datasets.buscarVersao.mockResolvedValue(null);
    await expect(servico.obterDiagnostico('x')).rejects.toBeInstanceOf(RecursoNaoEncontrado);
  });
});
