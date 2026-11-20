import { ConflitoEstado, ErroNegocio, RecursoNaoEncontrado } from '../common/erros/erro-negocio';
import { DatabaseService } from '../database/database.service';
import { ArmazenamentoArquivosService } from './armazenamento-arquivos.service';
import { DatasetRepository } from './dataset.repository';
import { DatasetService } from './dataset.service';
import { DatasetRegistro, OrigemVersao, SituacaoDataset, VersaoRegistro } from './dataset.tipos';
import { ValidadorCsv } from './validador-csv';

const agora = new Date('2026-11-01T12:00:00Z');

function dataset(situacao = SituacaoDataset.ATIVO): DatasetRegistro {
  return {
    id: 'd1',
    nome: 'Base',
    descricao: '',
    situacao,
    criado_por: 'u1',
    criado_em: agora,
    atualizado_em: agora,
    excluido_em: situacao === SituacaoDataset.ATIVO ? null : agora,
    excluido_por: null,
  };
}

function versao(numero: number, datasetId = 'd1'): VersaoRegistro {
  return {
    id: `v${numero}`,
    dataset_id: datasetId,
    numero,
    versao_predecessora_id: numero > 1 ? `v${numero - 1}` : null,
    origem: OrigemVersao.IMPORTACAO,
    hash_sha256: 'a'.repeat(64),
    caminho_arquivo: `${'a'.repeat(64)}.csv`,
    nome_arquivo_original: 'base.csv',
    tamanho_bytes: '12',
    separador: ',',
    colunas: ['id', 'nome'],
    total_registros: 3,
    total_colunas: 2,
    criado_por: 'u1',
    criado_em: agora,
  };
}

describe('DatasetService — manutenção (UC-01, fluxos 5a–5c)', () => {
  let repositorio: jest.Mocked<DatasetRepository>;
  let armazenamento: jest.Mocked<ArmazenamentoArquivosService>;
  let servico: DatasetService;

  beforeEach(() => {
    repositorio = {
      buscarPorId: jest.fn().mockResolvedValue(dataset()),
      listarVersoes: jest.fn().mockResolvedValue([versao(1)]),
      listarAtivos: jest.fn().mockResolvedValue([dataset()]),
      contarVersoes: jest.fn().mockResolvedValue(new Map([['d1', 1]])),
      buscarVersaoAtual: jest.fn().mockResolvedValue(versao(1)),
      atualizarMetadados: jest.fn().mockResolvedValue({ ...dataset(), nome: 'Novo' }),
      marcarExcluido: jest.fn().mockResolvedValue(dataset(SituacaoDataset.EXCLUIDO_LOGICAMENTE)),
      bloquearDataset: jest.fn().mockResolvedValue(dataset()),
      inserirVersao: jest.fn().mockImplementation(async (dados) => ({
        ...versao(2),
        versao_predecessora_id: dados.versaoPredecessoraId,
        colunas: dados.colunas,
      })),
      buscarVersao: jest.fn().mockResolvedValue(versao(1)),
    } as unknown as jest.Mocked<DatasetRepository>;
    armazenamento = {
      gravar: jest
        .fn()
        .mockResolvedValue({ hash: 'b'.repeat(64), caminho: `${'b'.repeat(64)}.csv`, tamanhoBytes: 9 }),
      ler: jest.fn().mockResolvedValue(Buffer.from('id,nome\n1,Ana\n2,Bia\n3,Caio\n')),
    } as unknown as jest.Mocked<ArmazenamentoArquivosService>;
    const banco = { transacao: jest.fn((trabalho) => trabalho('tx')) } as unknown as DatabaseService;
    servico = new DatasetService(banco, repositorio, new ValidadorCsv(), armazenamento);
  });

  it('lista datasets ativos com versão atual e total de versões', async () => {
    const lista = await servico.listar();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id: 'd1', totalVersoes: 1, versaoAtual: { numero: 1 } });
  });

  it('consulta dataset com histórico de versões', async () => {
    repositorio.listarVersoes.mockResolvedValue([versao(1), versao(2)]);
    const detalhe = await servico.consultar('d1');
    expect(detalhe.versoes.map((v) => v.numero)).toEqual([1, 2]);
    expect(detalhe.versaoAtual?.numero).toBe(2);
  });

  it('devolve 404 para dataset inexistente', async () => {
    repositorio.buscarPorId.mockResolvedValue(null);
    await expect(servico.consultar('x')).rejects.toBeInstanceOf(RecursoNaoEncontrado);
  });

  it('atualiza somente metadados, sem nova versão nem gravação de arquivo', async () => {
    const atualizado = await servico.atualizarMetadados('d1', { nome: ' Novo ' });
    expect(repositorio.atualizarMetadados).toHaveBeenCalledWith('d1', { nome: 'Novo', descricao: undefined });
    expect(atualizado.nome).toBe('Novo');
    expect(repositorio.inserirVersao).not.toHaveBeenCalled();
    expect(armazenamento.gravar).not.toHaveBeenCalled();
  });

  it('exige ao menos um metadado na atualização', async () => {
    await expect(servico.atualizarMetadados('d1', {})).rejects.toBeInstanceOf(ErroNegocio);
  });

  it('cria nova versão vinculada à mais recente', async () => {
    repositorio.buscarVersaoAtual.mockResolvedValue(versao(3));
    const arquivo = { originalname: 'nova.csv', buffer: Buffer.from('cod,valor\nX,1\n'), size: 14 };
    const nova = await servico.importarNovaVersao('d1', arquivo, undefined, 'u1');
    expect(repositorio.bloquearDataset).toHaveBeenCalledWith('d1', 'tx');
    expect(repositorio.inserirVersao.mock.calls[0][0]).toMatchObject({
      versaoPredecessoraId: 'v3',
      origem: OrigemVersao.IMPORTACAO,
      colunas: ['cod', 'valor'],
    });
    expect(nova.versaoPredecessoraId).toBe('v3');
  });

  it('rejeita nova versão inválida sem gravar', async () => {
    const arquivo = { originalname: 'nova.csv', buffer: Buffer.from('a\n'), size: 2 };
    await expect(servico.importarNovaVersao('d1', arquivo, undefined, 'u1')).rejects.toMatchObject({
      codigo: 'SEM_REGISTROS',
    });
    expect(armazenamento.gravar).not.toHaveBeenCalled();
  });

  it.each([
    ['atualizar metadados', (s: DatasetService) => s.atualizarMetadados('d1', { nome: 'x' })],
    ['importar nova versão', (s: DatasetService) => s.importarNovaVersao('d1', undefined, undefined, 'u1')],
    ['excluir novamente', (s: DatasetService) => s.excluirLogicamente('d1', 'u1')],
  ])('impede %s em dataset excluído logicamente', async (_caso, operacao) => {
    repositorio.buscarPorId.mockResolvedValue(dataset(SituacaoDataset.EXCLUIDO_LOGICAMENTE));
    const erro = await operacao(servico).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ConflitoEstado);
    expect((erro as ConflitoEstado).getResponse()).toMatchObject({ erro: 'DATASET_EXCLUIDO' });
  });

  it('exclui logicamente sem remover versões', async () => {
    const excluido = await servico.excluirLogicamente('d1', 'u2');
    expect(repositorio.marcarExcluido).toHaveBeenCalledWith('d1', 'u2');
    expect(excluido.situacao).toBe(SituacaoDataset.EXCLUIDO_LOGICAMENTE);
    expect(excluido.totalVersoes).toBe(1);
  });

  it('pagina os registros de uma versão com número da linha original', async () => {
    const pagina = await servico.consultarRegistros('d1', 'v1', 2, 2);
    expect(pagina).toMatchObject({ totalRegistros: 3, colunas: ['id', 'nome'] });
    expect(pagina.registros).toEqual([{ linha: 3, valores: { id: '3', nome: 'Caio' } }]);
  });

  it('recusa versão de outro dataset', async () => {
    repositorio.buscarVersao.mockResolvedValue(versao(1, 'outro'));
    await expect(servico.consultarRegistros('d1', 'v1', 1, 10)).rejects.toBeInstanceOf(RecursoNaoEncontrado);
  });
});
