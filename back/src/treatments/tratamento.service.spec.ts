import { AuditoriaService } from '../audit/auditoria.service';
import { ConflitoEstado, ErroNegocio, RecursoNaoEncontrado } from '../common/erros/erro-negocio';
import { DatabaseService } from '../database/database.service';
import { ArmazenamentoArquivosService, calcularSha256 } from '../datasets/armazenamento-arquivos.service';
import { DatasetRepository } from '../datasets/dataset.repository';
import { OrigemVersao } from '../datasets/dataset.tipos';
import { VersionamentoService } from '../datasets/versionamento.service';
import { SimulacaoRepository } from '../simulations/simulacao.repository';
import { SimulacaoService } from '../simulations/simulacao.service';
import { StatusSimulacao } from '../simulations/simulacao.tipos';
import { TratamentoService } from './tratamento.service';

const conteudo = Buffer.from('id,nome\n1, Ana \n1,Ana\n2,Bia\n');
const hash = calcularSha256(conteudo);
const regras = [
  {
    regraId: 'u',
    revisao: 1,
    nome: 'Única',
    ordem: 2,
    configuracao: {
      dimensao: 'UNICIDADE',
      colunas: [{ nome: 'id', tipo: 'TEXTO' }],
      acao: { tipo: 'REMOVER_REPETICOES' },
    },
  },
  {
    regraId: 'a',
    revisao: 3,
    nome: 'Aparar',
    ordem: 1,
    configuracao: {
      dimensao: 'COMPLETUDE',
      colunas: [{ nome: 'nome', tipo: 'TEXTO' }],
      acao: { tipo: 'APARAR_ESPACOS', coluna: 'nome' },
    },
  },
];
const entrada = {
  id: 'v1',
  dataset_id: 'd1',
  numero: 1,
  hash_sha256: hash,
  caminho_arquivo: `${hash}.csv`,
  separador: ',',
  colunas: ['id', 'nome'],
};

function simulacao(extra: Record<string, unknown> = {}) {
  return {
    id: 's1',
    versao_id: 'v1',
    dataset_id: 'd1',
    conjunto_id: 'c1',
    conjunto_revisao: 4,
    status: StatusSimulacao.CONCLUIDA,
    total_previsto_alteradas: 0,
    total_previsto_removidas: 1,
    configuracao_executada: { regras },
    ...extra,
  };
}

describe('TratamentoService (UC-04, ADR-004)', () => {
  let simulacoes: jest.Mocked<SimulacaoRepository>;
  let simulacaoService: jest.Mocked<Pick<SimulacaoService, 'validarVigencia'>>;
  let datasets: jest.Mocked<DatasetRepository>;
  let armazenamento: jest.Mocked<ArmazenamentoArquivosService>;
  let versionamento: jest.Mocked<VersionamentoService>;
  let auditoria: jest.Mocked<AuditoriaService>;
  let banco: { transacao: jest.Mock };
  let servico: TratamentoService;

  beforeEach(() => {
    simulacoes = {
      buscar: jest.fn().mockResolvedValue(simulacao()),
      consolidar: jest.fn(),
    } as unknown as jest.Mocked<SimulacaoRepository>;
    simulacaoService = { validarVigencia: jest.fn().mockResolvedValue({ vigente: true }) };
    datasets = {
      bloquearDataset: jest.fn(),
      buscarVersao: jest.fn().mockResolvedValue(entrada),
    } as unknown as jest.Mocked<DatasetRepository>;
    armazenamento = {
      ler: jest.fn().mockResolvedValue(conteudo),
    } as unknown as jest.Mocked<ArmazenamentoArquivosService>;
    versionamento = {
      gravarArquivo: jest
        .fn()
        .mockResolvedValue({ hash: 'b'.repeat(64), caminho: 'b.csv', tamanhoBytes: 10 }),
      criarVersaoDerivada: jest.fn().mockResolvedValue({
        id: 'v2',
        dataset_id: 'd1',
        numero: 2,
        versao_predecessora_id: 'v1',
        origem: OrigemVersao.TRATAMENTO,
        hash_sha256: 'b'.repeat(64),
        caminho_arquivo: 'b.csv',
        nome_arquivo_original: null,
        tamanho_bytes: 10,
        separador: ',',
        colunas: ['id', 'nome'],
        total_registros: 2,
        total_colunas: 2,
        criado_por: 'u1',
        criado_em: new Date(),
      }),
    } as unknown as jest.Mocked<VersionamentoService>;
    auditoria = {
      registrarExtrato: jest.fn().mockResolvedValue({ id: 'e1', instanteUtc: '2026-11-10T00:00:00.000Z' }),
    } as unknown as jest.Mocked<AuditoriaService>;
    banco = { transacao: jest.fn((trabalho) => trabalho('tx')) };
    servico = new TratamentoService(
      banco as unknown as DatabaseService,
      simulacoes,
      simulacaoService as unknown as SimulacaoService,
      datasets,
      armazenamento,
      versionamento,
      auditoria,
    );
  });

  it('exige confirmação explícita antes de qualquer acesso', async () => {
    await expect(servico.aplicar('s1', false, 'u1')).rejects.toMatchObject({
      codigo: 'CONFIRMACAO_OBRIGATORIA',
    });
    expect(banco.transacao).not.toHaveBeenCalled();
  });

  it('bloqueia a simulação, aplica na ordem e registra versão, extrato e consolidação na mesma transação', async () => {
    simulacoes.buscar.mockResolvedValue(simulacao({ total_previsto_alteradas: 1 }) as never);
    const resultado = await servico.aplicar('s1', true, 'u1');

    expect(simulacoes.buscar).toHaveBeenCalledWith('s1', 'tx', true);
    expect(simulacaoService.validarVigencia).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1' }),
      'tx',
    );
    // Aparar (ordem 1) antes da remoção: linha 2 repete a 1 após normalizar.
    expect(versionamento.gravarArquivo).toHaveBeenCalledWith(
      ['id', 'nome'],
      [
        ['1', 'Ana'],
        ['2', 'Bia'],
      ],
      ',',
    );
    expect(versionamento.criarVersaoDerivada).toHaveBeenCalledWith(
      entrada,
      expect.anything(),
      { totalRegistros: 2, criadoPor: 'u1' },
      'tx',
    );
    const [dadosExtrato, alteracoes, tx] = auditoria.registrarExtrato.mock.calls[0];
    expect(tx).toBe('tx');
    expect(dadosExtrato).toMatchObject({
      versaoEntradaId: 'v1',
      versaoSaidaId: 'v2',
      conjuntoRevisao: 4,
      revisoesRegras: [
        { regraId: 'a', revisao: 3, ordem: 1 },
        { regraId: 'u', revisao: 1, ordem: 2 },
      ],
      acoesAplicadas: [
        { ordem: 1, acao: 'APARAR_ESPACOS', coluna: 'nome' },
        { ordem: 2, acao: 'REMOVER_REPETICOES', coluna: null },
      ],
      totalLinhasAlteradas: 1,
      totalLinhasRemovidas: 1,
    });
    expect(alteracoes.map((a) => [a.linha, a.tipo])).toEqual([
      [1, 'ATUALIZACAO'],
      [2, 'REMOCAO'],
    ]);
    expect(simulacoes.consolidar).toHaveBeenCalledWith('s1', 'tx');
    expect(resultado).toMatchObject({
      extratoId: 'e1',
      versaoSaida: { id: 'v2', numero: 2 },
      totalLinhasAfetadas: 2,
    });
  });

  it('impede reaplicação e simulações não vigentes', async () => {
    simulacaoService.validarVigencia.mockResolvedValue({
      vigente: false,
      codigo: 'SIMULACAO_JA_APLICADA',
      motivo: 'já aplicada',
    });
    const erro = await servico.aplicar('s1', true, 'u1').catch((e) => e);
    expect(erro).toBeInstanceOf(ConflitoEstado);
    expect(erro.getResponse()).toMatchObject({ erro: 'SIMULACAO_JA_APLICADA' });
    expect(versionamento.gravarArquivo).not.toHaveBeenCalled();
  });

  it('não cria versão quando não há alterações previstas', async () => {
    simulacoes.buscar.mockResolvedValue(simulacao({ total_previsto_removidas: 0 }) as never);
    await expect(servico.aplicar('s1', true, 'u1')).rejects.toMatchObject({ codigo: 'SEM_ALTERACOES' });
    expect(versionamento.criarVersaoDerivada).not.toHaveBeenCalled();
  });

  it('aborta se a integridade do arquivo de entrada não confere', async () => {
    armazenamento.ler.mockResolvedValue(Buffer.from('adulterado'));
    await expect(servico.aplicar('s1', true, 'u1')).rejects.toMatchObject({
      response: { erro: 'INTEGRIDADE_VIOLADA' },
    });
    expect(versionamento.gravarArquivo).not.toHaveBeenCalled();
  });

  it('aborta se o resultado diverge da prévia', async () => {
    simulacoes.buscar.mockResolvedValue(simulacao({ total_previsto_alteradas: 5 }) as never);
    await expect(servico.aplicar('s1', true, 'u1')).rejects.toMatchObject({
      response: { erro: 'PREVIA_DIVERGENTE' },
    });
  });

  it('propaga falha do extrato para a transação reverter tudo', async () => {
    simulacoes.buscar.mockResolvedValue(simulacao({ total_previsto_alteradas: 1 }) as never);
    auditoria.registrarExtrato.mockRejectedValue(new Error('falha no extrato'));
    await expect(servico.aplicar('s1', true, 'u1')).rejects.toThrow('falha no extrato');
    expect(simulacoes.consolidar).not.toHaveBeenCalled();
  });

  it('devolve 404 para simulação inexistente', async () => {
    simulacoes.buscar.mockResolvedValue(null);
    await expect(servico.aplicar('x', true, 'u1')).rejects.toBeInstanceOf(RecursoNaoEncontrado);
  });

  it('usa erro de negócio para confirmação ausente', async () => {
    await expect(servico.aplicar('s1', undefined as unknown as boolean, 'u1')).rejects.toBeInstanceOf(
      ErroNegocio,
    );
  });
});
