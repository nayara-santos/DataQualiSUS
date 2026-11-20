import { ErroNegocio } from '../common/erros/erro-negocio';
import { DatabaseService } from '../database/database.service';
import { ArmazenamentoArquivosService } from './armazenamento-arquivos.service';
import { DatasetRepository } from './dataset.repository';
import { ArquivoRecebido, DatasetService, sanitizarNomeArquivo } from './dataset.service';
import { SeparadorCsv } from './limites-csv';
import { ValidadorCsv } from './validador-csv';

function arquivo(texto: string, nome = 'base.csv'): ArquivoRecebido {
  const buffer = Buffer.from(texto);
  return { originalname: nome, buffer, size: buffer.length };
}

describe('DatasetService.importar', () => {
  let repositorio: jest.Mocked<Pick<DatasetRepository, 'inserirDataset' | 'inserirVersao'>>;
  let armazenamento: jest.Mocked<Pick<ArmazenamentoArquivosService, 'gravar'>>;
  let banco: { transacao: jest.Mock };
  let servico: DatasetService;

  beforeEach(() => {
    repositorio = {
      inserirDataset: jest.fn().mockResolvedValue({
        id: 'd1',
        nome: 'Base',
        descricao: '',
        situacao: 'ATIVO',
        criado_por: 'u1',
        criado_em: new Date(),
        atualizado_em: new Date(),
        excluido_em: null,
        excluido_por: null,
      }),
      inserirVersao: jest.fn().mockImplementation(async (dados) => ({
        id: 'v1',
        dataset_id: dados.datasetId,
        numero: 1,
        versao_predecessora_id: null,
        origem: dados.origem,
        hash_sha256: dados.hash,
        caminho_arquivo: dados.caminho,
        nome_arquivo_original: dados.nomeArquivoOriginal,
        tamanho_bytes: dados.tamanhoBytes,
        separador: dados.separador,
        colunas: dados.colunas,
        total_registros: dados.totalRegistros,
        total_colunas: dados.colunas.length,
        criado_por: dados.criadoPor,
        criado_em: new Date(),
      })),
    };
    armazenamento = {
      gravar: jest.fn().mockResolvedValue({ hash: 'h'.repeat(64), caminho: 'x.csv', tamanhoBytes: 10 }),
    };
    banco = { transacao: jest.fn((trabalho) => trabalho('tx')) };
    servico = new DatasetService(
      banco as unknown as DatabaseService,
      repositorio as unknown as DatasetRepository,
      new ValidadorCsv(),
      armazenamento as unknown as ArmazenamentoArquivosService,
    );
  });

  it('grava o arquivo e registra dataset e versão 1 na mesma transação', async () => {
    const dto = await servico.importar(
      arquivo('id;nome\n1;Ana\n'),
      { nome: '  Base  ', separador: SeparadorCsv.PONTO_E_VIRGULA },
      'u1',
    );
    expect(armazenamento.gravar).toHaveBeenCalledTimes(1);
    expect(banco.transacao).toHaveBeenCalledTimes(1);
    expect(repositorio.inserirDataset).toHaveBeenCalledWith(
      { nome: 'Base', descricao: '', criadoPor: 'u1' },
      'tx',
    );
    expect(repositorio.inserirVersao.mock.calls[0][0]).toMatchObject({
      separador: ';',
      colunas: ['id', 'nome'],
      totalRegistros: 1,
      versaoPredecessoraId: null,
      origem: 'IMPORTACAO',
    });
    expect(repositorio.inserirVersao.mock.calls[0][1]).toBe('tx');
    expect(dto.versaoAtual?.numero).toBe(1);
  });

  it('rejeita arquivo inválido sem gravar arquivo nem banco', async () => {
    const erro = await servico.importar(arquivo('a,a\n1,2\n'), { nome: 'X' }, 'u1').catch((e) => e);
    expect(erro).toBeInstanceOf(ErroNegocio);
    expect((erro as ErroNegocio).codigo).toBe('CABECALHO_DUPLICADO');
    expect(armazenamento.gravar).not.toHaveBeenCalled();
    expect(banco.transacao).not.toHaveBeenCalled();
  });

  it('exige arquivo', async () => {
    await expect(servico.importar(undefined, { nome: 'X' }, 'u1')).rejects.toMatchObject({
      codigo: 'ARQUIVO_AUSENTE',
    });
  });

  it('propaga falha de persistência sem confirmar dados parciais', async () => {
    banco.transacao.mockRejectedValue(new Error('falha de rede'));
    await expect(servico.importar(arquivo('a\n1\n'), { nome: 'X' }, 'u1')).rejects.toThrow('falha de rede');
  });

  it.each([
    ['../../etc/passwd.csv', 'passwd.csv'],
    ['C:\\dados\\base.csv', 'base.csv'],
    ['nome\u0000oculto.csv', 'nomeoculto.csv'],
    [undefined, null],
  ])('sanitiza o nome original %p', (entrada, esperado) => {
    expect(sanitizarNomeArquivo(entrada)).toBe(esperado);
  });
});
