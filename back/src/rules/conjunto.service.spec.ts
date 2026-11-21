import { DatabaseService } from '../database/database.service';
import { DatasetRepository } from '../datasets/dataset.repository';
import { DatasetService } from '../datasets/dataset.service';
import { ConjuntoService } from './conjunto.service';
import { DimensaoQualidade } from './motor/tipos';
import { NotificadorRevisaoConjunto } from './notificador-revisao';
import { RegrasRepository } from './regras.repository';
import { SituacaoCadastro } from './regras.tipos';

const datas = { criado_em: new Date(), atualizado_em: new Date() };
const completude = (coluna: string) => ({
  dimensao: DimensaoQualidade.COMPLETUDE,
  colunas: [{ nome: coluna, tipo: 'TEXTO' }],
  acao: { tipo: 'APARAR_ESPACOS', coluna },
});

describe('ConjuntoService', () => {
  let repositorio: jest.Mocked<RegrasRepository>;
  let datasets: jest.Mocked<Pick<DatasetService, 'obterDataset' | 'exigirAtivo'>>;
  let datasetRepositorio: jest.Mocked<Pick<DatasetRepository, 'buscarVersaoAtual'>>;
  let notificador: NotificadorRevisaoConjunto;
  let servico: ConjuntoService;

  beforeEach(() => {
    const regras = {
      r1: {
        id: 'r1',
        nome: 'Nome',
        revisao_atual: 2,
        situacao: SituacaoCadastro.ATIVO,
        configuracao: completude('nome'),
      },
      r2: {
        id: 'r2',
        nome: 'Cidade',
        revisao_atual: 1,
        situacao: SituacaoCadastro.ATIVO,
        configuracao: completude('cidade'),
      },
      r3: {
        id: 'r3',
        nome: 'Outra',
        revisao_atual: 1,
        situacao: SituacaoCadastro.ATIVO,
        configuracao: completude('nome'),
      },
      rx: {
        id: 'rx',
        nome: 'Excluída',
        revisao_atual: 1,
        situacao: SituacaoCadastro.EXCLUIDO_LOGICAMENTE,
        configuracao: completude('z'),
      },
    } as Record<string, unknown>;
    const conjunto = {
      id: 'c1',
      nome: 'Conjunto',
      descricao: '',
      revisao_atual: 1,
      situacao: SituacaoCadastro.ATIVO,
      criado_por: 'u1',
      itens: [{ regraId: 'r1', regraRevisao: 2, ordem: 1 }],
      ...datas,
    };
    repositorio = {
      buscarRegras: jest.fn(async (ids: string[]) => ids.map((id) => regras[id]).filter(Boolean)),
      inserirConjunto: jest.fn().mockResolvedValue('c1'),
      revisarConjunto: jest.fn().mockResolvedValue(2),
      buscarConjunto: jest.fn().mockResolvedValue(conjunto),
      datasetsAssociados: jest.fn().mockResolvedValue(new Map()),
      buscarRevisoesRegra: jest.fn(async (pares: { regraId: string; revisao: number }[]) =>
        pares.map((p) => ({
          regra_id: p.regraId,
          revisao: p.revisao,
          nome: (regras[p.regraId] as { nome: string }).nome,
          dimensao: 'COMPLETUDE',
          configuracao: (regras[p.regraId] as { configuracao: unknown }).configuracao,
        })),
      ),
      associar: jest.fn(),
      excluirConjunto: jest.fn(),
    } as unknown as jest.Mocked<RegrasRepository>;
    datasets = { obterDataset: jest.fn().mockResolvedValue({ id: 'd1' }), exigirAtivo: jest.fn() };
    datasetRepositorio = { buscarVersaoAtual: jest.fn().mockResolvedValue({ colunas: ['nome', 'cidade'] }) };
    notificador = new NotificadorRevisaoConjunto();
    const banco = { transacao: jest.fn((t) => t('tx')) } as unknown as DatabaseService;
    servico = new ConjuntoService(
      banco,
      repositorio,
      datasets as unknown as DatasetService,
      datasetRepositorio as unknown as DatasetRepository,
      notificador,
    );
  });

  it('cria conjunto com a ordem recebida e a revisão atual de cada regra', async () => {
    await servico.criar({ nome: 'C', regras: ['r2', 'r1'] }, 'u1');
    expect(repositorio.inserirConjunto).toHaveBeenCalledWith(
      expect.objectContaining({
        itens: [
          { regraId: 'r2', regraRevisao: 1, ordem: 1 },
          { regraId: 'r1', regraRevisao: 2, ordem: 2 },
        ],
      }),
      'tx',
    );
  });

  it('rejeita regras inexistentes ou excluídas', async () => {
    await expect(servico.criar({ nome: 'C', regras: ['rx', 'nao-existe'] }, 'u1')).rejects.toMatchObject({
      codigo: 'REGRA_INDISPONIVEL',
    });
  });

  it('rejeita duas ações de escrita na mesma coluna', async () => {
    await expect(servico.criar({ nome: 'C', regras: ['r1', 'r3'] }, 'u1')).rejects.toMatchObject({
      codigo: 'CONJUNTO_INCOMPATIVEL',
    });
  });

  it('edição gera revisão e notifica a invalidação de simulações', async () => {
    const observador = jest.fn().mockResolvedValue(undefined);
    notificador.registrar(observador);
    await servico.atualizar('c1', { regras: ['r1', 'r2'] }, 'u1');
    expect(repositorio.revisarConjunto).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ motivo: 'EDICAO_CONJUNTO' }),
      'tx',
    );
    expect(observador).toHaveBeenCalledWith(['c1'], 'tx');
  });

  it('associa somente quando as colunas existem na versão atual', async () => {
    await servico.associar('c1', 'd1', 'u1');
    expect(repositorio.associar).toHaveBeenCalledWith('c1', 'd1', 'u1');
    datasetRepositorio.buscarVersaoAtual.mockResolvedValue({ colunas: ['outra'] } as never);
    await expect(servico.associar('c1', 'd1', 'u1')).rejects.toMatchObject({
      codigo: 'CONJUNTO_INCOMPATIVEL_COM_DATASET',
    });
  });

  it('não altera conjunto excluído', async () => {
    repositorio.buscarConjunto.mockResolvedValue({
      situacao: SituacaoCadastro.EXCLUIDO_LOGICAMENTE,
    } as never);
    await expect(servico.atualizar('c1', { nome: 'x' }, 'u1')).rejects.toMatchObject({
      response: { erro: 'CONJUNTO_EXCLUIDO' },
    });
  });

  it('devolve a configuração congelada para execução em ordem', async () => {
    const execucao = await servico.obterParaExecucao('c1');
    expect(execucao).toMatchObject({
      conjuntoId: 'c1',
      revisao: 1,
      regras: [{ regraId: 'r1', revisao: 2, ordem: 1 }],
    });
  });
});
