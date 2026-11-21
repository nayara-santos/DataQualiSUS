import { ErroNegocio, RecursoNaoEncontrado } from '../common/erros/erro-negocio';
import { Configuracao } from '../config/configuracao';
import { ArmazenamentoArquivosService } from '../datasets/armazenamento-arquivos.service';
import { DatasetRepository } from '../datasets/dataset.repository';
import { SituacaoDataset } from '../datasets/dataset.tipos';
import { ConjuntoService } from '../rules/conjunto.service';
import { DimensaoQualidade } from '../rules/motor/tipos';
import { NotificadorRevisaoConjunto } from '../rules/notificador-revisao';
import { VocabularioService } from '../rules/vocabularios/vocabulario.service';
import { ExecutorComLimite, ResultadoExecucao } from './executor-com-limite';
import { SimulacaoRepository } from './simulacao.repository';
import { SimulacaoService } from './simulacao.service';
import { SimulacaoRegistro, StatusSimulacao } from './simulacao.tipos';

const versao = {
  id: 'v1',
  dataset_id: 'd1',
  numero: 1,
  hash_sha256: 'a'.repeat(64),
  caminho_arquivo: `${'a'.repeat(64)}.csv`,
  colunas: ['id', 'cid'],
  separador: ',',
  total_registros: 3,
};
const regraUnicidade = {
  ordem: 1,
  regraId: 'r1',
  revisao: 1,
  nome: 'U',
  dimensao: DimensaoQualidade.UNICIDADE,
  configuracao: { dimensao: DimensaoQualidade.UNICIDADE, colunas: [{ nome: 'id', tipo: 'TEXTO' }] },
};

function simulacao(status: StatusSimulacao, extra: Partial<SimulacaoRegistro> = {}): SimulacaoRegistro {
  return {
    id: 's1',
    versao_id: 'v1',
    dataset_id: 'd1',
    conjunto_id: 'c1',
    conjunto_revisao: 2,
    configuracao_executada: {
      versao: {
        id: 'v1',
        datasetId: 'd1',
        numero: 1,
        hashSha256: 'a'.repeat(64),
        colunas: ['id'],
        separador: ',',
        totalRegistros: 3,
      },
      conjunto: { id: 'c1', nome: 'C', revisao: 2 },
      regras: [],
      vocabularios: [],
      limiteMs: 60000,
    },
    status,
    mensagem: null,
    limite_ms: 60000,
    aceita_em: new Date(),
    concluida_em: null,
    invalidada_em: null,
    consolidada_em: null,
    hash_entrada_conferido: null,
    total_linhas: 3,
    total_linhas_com_violacao: 1,
    total_previsto_alteradas: 1,
    total_previsto_removidas: 0,
    previa: [],
    criado_por: 'u1',
    ...extra,
  } as SimulacaoRegistro;
}

describe('SimulacaoService', () => {
  let repositorio: jest.Mocked<SimulacaoRepository>;
  let datasets: jest.Mocked<DatasetRepository>;
  let conjuntos: jest.Mocked<ConjuntoService>;
  let vocabularios: jest.Mocked<VocabularioService>;
  let armazenamento: jest.Mocked<ArmazenamentoArquivosService>;
  let executor: jest.Mocked<ExecutorComLimite>;
  let notificador: NotificadorRevisaoConjunto;
  let servico: SimulacaoService;

  beforeEach(() => {
    repositorio = {
      registrar: jest.fn().mockResolvedValue(simulacao(StatusSimulacao.EM_EXECUCAO)),
      concluir: jest.fn().mockResolvedValue(true),
      encerrarSemResultado: jest.fn(),
      listarResultados: jest.fn().mockResolvedValue([]),
      buscar: jest.fn(),
      invalidarPorConjuntos: jest.fn(),
      marcarInterrompidas: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<SimulacaoRepository>;
    datasets = {
      buscarVersao: jest.fn().mockResolvedValue(versao),
      buscarPorId: jest.fn().mockResolvedValue({ id: 'd1', situacao: SituacaoDataset.ATIVO }),
    } as unknown as jest.Mocked<DatasetRepository>;
    conjuntos = {
      obterParaExecucao: jest
        .fn()
        .mockResolvedValue({ conjuntoId: 'c1', nome: 'C', revisao: 2, regras: [regraUnicidade] }),
      estaAssociado: jest.fn().mockResolvedValue(true),
      revisaoAtual: jest.fn().mockResolvedValue({ revisao: 2, ativo: true }),
    } as unknown as jest.Mocked<ConjuntoService>;
    vocabularios = {
      disponiveis: jest.fn().mockResolvedValue(new Map()),
      listarCodigos: jest.fn().mockResolvedValue(['J18.9']),
    } as unknown as jest.Mocked<VocabularioService>;
    armazenamento = {
      diretorio: '/armazenamento',
      verificarIntegridade: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<ArmazenamentoArquivosService>;
    executor = { executar: jest.fn(), encerrar: jest.fn() } as unknown as jest.Mocked<ExecutorComLimite>;
    notificador = new NotificadorRevisaoConjunto();
    servico = new SimulacaoService(
      repositorio,
      datasets,
      conjuntos,
      vocabularios,
      armazenamento,
      notificador,
      executor,
      { simulacaoLimiteMs: 60000 } as Configuracao,
    );
  });

  async function simularCom(resultado: ResultadoExecucao<unknown>) {
    executor.executar.mockResolvedValue(resultado as never);
    const dto = await servico.simular('v1', 'c1', 'u1');
    await servico.aguardar(dto.id);
    return dto;
  }

  it('registra a configuração executada antes de executar e devolve EM_EXECUCAO', async () => {
    const dto = await simularCom({
      status: 'CONCLUIDO',
      resultado: { resultados: [] },
      duracaoMs: 5,
    } as never);
    expect(dto.status).toBe(StatusSimulacao.EM_EXECUCAO);
    const configuracao = repositorio.registrar.mock.calls[0][0];
    expect(configuracao).toMatchObject({
      versao: { id: 'v1', hashSha256: 'a'.repeat(64), colunas: ['id', 'cid'] },
      conjunto: { id: 'c1', revisao: 2 },
      regras: [{ regraId: 'r1', revisao: 1 }],
      limiteMs: 60000,
    });
    expect(executor.executar.mock.calls[0][1]).toBe(60000);
    expect(repositorio.concluir).toHaveBeenCalled();
  });

  it('marca TEMPO_ESGOTADO sem gravar resultado', async () => {
    await simularCom({ status: 'TEMPO_ESGOTADO', duracaoMs: 60000 });
    expect(repositorio.encerrarSemResultado).toHaveBeenCalledWith(
      's1',
      StatusSimulacao.TEMPO_ESGOTADO,
      expect.stringContaining('60 segundos'),
    );
    expect(repositorio.concluir).not.toHaveBeenCalled();
  });

  it('marca FALHA com a mensagem do executor', async () => {
    await simularCom({ status: 'FALHA', mensagem: 'Memória insuficiente', duracaoMs: 1 });
    expect(repositorio.encerrarSemResultado).toHaveBeenCalledWith(
      's1',
      StatusSimulacao.FALHA,
      'Memória insuficiente',
    );
  });

  it('marca FALHA quando a integridade do arquivo não confere após a execução', async () => {
    armazenamento.verificarIntegridade.mockResolvedValue(false);
    await simularCom({ status: 'CONCLUIDO', resultado: {}, duracaoMs: 1 } as never);
    expect(repositorio.encerrarSemResultado).toHaveBeenCalledWith(
      's1',
      StatusSimulacao.FALHA,
      expect.stringContaining('integridade'),
    );
    expect(repositorio.concluir).not.toHaveBeenCalled();
  });

  it.each([
    ['versão inexistente', () => datasets.buscarVersao.mockResolvedValue(null), RecursoNaoEncontrado],
    [
      'dataset excluído',
      () =>
        datasets.buscarPorId.mockResolvedValue({ situacao: SituacaoDataset.EXCLUIDO_LOGICAMENTE } as never),
      ErroNegocio,
    ],
    ['conjunto não associado', () => conjuntos.estaAssociado.mockResolvedValue(false), ErroNegocio],
    [
      'conjunto sem regras',
      () =>
        conjuntos.obterParaExecucao.mockResolvedValue({
          conjuntoId: 'c1',
          nome: 'C',
          revisao: 1,
          regras: [],
        }),
      ErroNegocio,
    ],
    [
      'coluna inexistente',
      () =>
        conjuntos.obterParaExecucao.mockResolvedValue({
          conjuntoId: 'c1',
          nome: 'C',
          revisao: 1,
          regras: [
            {
              ...regraUnicidade,
              configuracao: { dimensao: 'UNICIDADE', colunas: [{ nome: 'cpf', tipo: 'TEXTO' }] },
            },
          ],
        } as never),
      ErroNegocio,
    ],
    [
      'vocabulário indisponível',
      () =>
        conjuntos.obterParaExecucao.mockResolvedValue({
          conjuntoId: 'c1',
          nome: 'C',
          revisao: 1,
          regras: [
            {
              ...regraUnicidade,
              configuracao: {
                dimensao: 'VALIDADE',
                combinador: 'E',
                condicoes: [
                  { coluna: 'cid', tipo: 'TEXTO', operador: 'PERTENCE_VOCABULARIO', vocabularioId: 'voc' },
                ],
              },
            },
          ],
        } as never),
      ErroNegocio,
    ],
  ])('não executa com %s e nada registra', async (_caso, preparar, tipoErro) => {
    preparar();
    await expect(servico.simular('v1', 'c1', 'u1')).rejects.toBeInstanceOf(tipoErro);
    expect(repositorio.registrar).not.toHaveBeenCalled();
    expect(executor.executar).not.toHaveBeenCalled();
  });

  describe('validarVigencia (MOD-16)', () => {
    it('é vigente quando concluída, com dataset ativo e mesma revisão', async () => {
      await expect(servico.validarVigencia(simulacao(StatusSimulacao.CONCLUIDA))).resolves.toEqual({
        vigente: true,
      });
    });

    it.each([
      [StatusSimulacao.EM_EXECUCAO, 'SIMULACAO_EM_EXECUCAO'],
      [StatusSimulacao.TEMPO_ESGOTADO, 'SIMULACAO_TEMPO_ESGOTADO'],
      [StatusSimulacao.FALHA, 'SIMULACAO_FALHOU'],
      [StatusSimulacao.INVALIDADA, 'SIMULACAO_INVALIDADA'],
      [StatusSimulacao.CONSOLIDADA, 'SIMULACAO_JA_APLICADA'],
    ])('não é vigente com status %s', async (status, codigo) => {
      await expect(servico.validarVigencia(simulacao(status))).resolves.toMatchObject({
        vigente: false,
        codigo,
      });
    });

    it('não é vigente se a revisão do conjunto mudou ou o dataset foi excluído', async () => {
      conjuntos.revisaoAtual.mockResolvedValueOnce({ revisao: 3, ativo: true });
      await expect(servico.validarVigencia(simulacao(StatusSimulacao.CONCLUIDA))).resolves.toMatchObject({
        codigo: 'SIMULACAO_INVALIDADA',
      });
      datasets.buscarPorId.mockResolvedValueOnce({ situacao: SituacaoDataset.EXCLUIDO_LOGICAMENTE } as never);
      await expect(servico.validarVigencia(simulacao(StatusSimulacao.CONCLUIDA))).resolves.toMatchObject({
        codigo: 'DATASET_EXCLUIDO',
      });
    });
  });

  it('marca como aplicável apenas simulação vigente com alteração prevista', async () => {
    repositorio.buscar.mockResolvedValueOnce(simulacao(StatusSimulacao.CONCLUIDA));
    expect((await servico.obter('s1')).aplicavel).toBe(true);
    repositorio.buscar.mockResolvedValueOnce(
      simulacao(StatusSimulacao.CONCLUIDA, { total_previsto_alteradas: 0, total_previsto_removidas: 0 }),
    );
    expect((await servico.obter('s1')).aplicavel).toBe(false);
  });

  it('registra o observador de invalidação e marca interrompidas na inicialização', async () => {
    await servico.onModuleInit();
    expect(repositorio.marcarInterrompidas).toHaveBeenCalled();
    await notificador.notificar(['c1'], 'tx' as never);
    expect(repositorio.invalidarPorConjuntos).toHaveBeenCalledWith(['c1'], 'tx');
  });
});
