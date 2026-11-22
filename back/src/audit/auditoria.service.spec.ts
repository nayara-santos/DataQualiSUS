import { RecursoNaoEncontrado } from '../common/erros/erro-negocio';
import { DatasetRepository } from '../datasets/dataset.repository';
import { ExportacaoService } from '../diagnostics/exportacao/exportacao.service';
import { TipoAlteracao } from '../rules/motor/motor-regras';
import { TipoAcao } from '../rules/motor/tipos';
import { AuditoriaRepository } from './auditoria.repository';
import { AuditoriaService } from './auditoria.service';
import { ExtratoRegistro, NovoExtrato } from './auditoria.tipos';

export const registroExtrato: ExtratoRegistro = {
  id: 'e1',
  operacao: 'TRATAMENTO',
  simulacao_id: 's1',
  dataset_id: 'd1',
  dataset_nome: 'Base',
  dataset_situacao: 'EXCLUIDO_LOGICAMENTE',
  usuario_id: 'u1',
  instante_utc: new Date('2026-11-10T13:00:00Z'),
  versao_entrada_id: 'v1',
  versao_entrada_numero: 1,
  versao_entrada_hash: 'a'.repeat(64),
  versao_saida_id: 'v2',
  versao_saida_numero: 2,
  versao_saida_hash: 'b'.repeat(64),
  conjunto_id: 'c1',
  conjunto_revisao: 3,
  revisoes_regras: [{ regraId: 'r1', revisao: 2, nome: 'Aparar', ordem: 1 }],
  acoes_aplicadas: [{ ordem: 1, regraId: 'r1', acao: TipoAcao.APARAR_ESPACOS, coluna: 'nome' }],
  total_linhas_alteradas: 2,
  total_linhas_removidas: 1,
  total_linhas_afetadas: 3,
  total_alteracoes: '3',
};

describe('AuditoriaService', () => {
  let repositorio: jest.Mocked<AuditoriaRepository>;
  let datasets: jest.Mocked<Pick<DatasetRepository, 'buscarPorId'>>;
  let exportacao: ExportacaoService;
  let servico: AuditoriaService;

  beforeEach(() => {
    repositorio = {
      inserirExtrato: jest
        .fn()
        .mockResolvedValue({ id: 'e1', instante_utc: new Date('2026-11-10T13:00:00Z') }),
      inserirAlteracoes: jest.fn(),
      buscarExtrato: jest.fn().mockResolvedValue(registroExtrato),
      listarPorDataset: jest.fn().mockResolvedValue([registroExtrato]),
      listarAlteracoes: jest.fn().mockResolvedValue([]),
      listarDatasetsAuditados: jest.fn().mockResolvedValue([
        {
          id: 'd1',
          nome: 'Base',
          situacao: 'ATIVO',
          total_extratos: '2',
          ultimo: new Date('2026-11-10T13:00:00Z'),
        },
      ]),
    } as unknown as jest.Mocked<AuditoriaRepository>;
    datasets = { buscarPorId: jest.fn().mockResolvedValue({ id: 'd1' }) };
    exportacao = new ExportacaoService();
    servico = new AuditoriaService(repositorio, datasets as unknown as DatasetRepository, exportacao);
  });

  it('registra extrato e alterações na transação recebida', async () => {
    const dados = { simulacaoId: 's1' } as NovoExtrato;
    const alteracoes = [
      {
        linha: 1,
        tipo: TipoAlteracao.ATUALIZACAO,
        regraId: 'r1',
        regraRevisao: 2,
        acao: TipoAcao.APARAR_ESPACOS,
        coluna: 'nome',
        valorAnterior: ' a',
        valorNovo: 'a',
        linhaRepresentante: null,
      },
    ];
    const resultado = await servico.registrarExtrato(dados, alteracoes, 'tx' as never);
    expect(repositorio.inserirExtrato).toHaveBeenCalledWith(dados, 'tx');
    expect(repositorio.inserirAlteracoes).toHaveBeenCalledWith('e1', alteracoes, 'tx');
    expect(resultado).toEqual({ id: 'e1', instanteUtc: '2026-11-10T13:00:00.000Z' });
  });

  it('propaga falha de gravação das alterações para reverter o tratamento', async () => {
    repositorio.inserirAlteracoes.mockRejectedValue(new Error('disco cheio'));
    await expect(servico.registrarExtrato({} as NovoExtrato, [], 'tx' as never)).rejects.toThrow(
      'disco cheio',
    );
  });

  it('devolve os campos da RN03 no DTO, inclusive para dataset excluído logicamente', async () => {
    const detalhe = await servico.obterExtrato('e1', 1, 50);
    expect(detalhe).toMatchObject({
      operacao: 'TRATAMENTO',
      usuarioId: 'u1',
      instanteUtc: '2026-11-10T13:00:00.000Z',
      versaoEntrada: { id: 'v1', numero: 1 },
      versaoSaida: { id: 'v2', numero: 2 },
      revisoesRegras: [{ regraId: 'r1', revisao: 2 }],
      totalLinhasAlteradas: 2,
      totalLinhasRemovidas: 1,
      totalLinhasAfetadas: 3,
      dataset: { situacao: 'EXCLUIDO_LOGICAMENTE' },
      alteracoes: { pagina: 1, tamanho: 50, total: 3 },
    });
    expect(repositorio.listarAlteracoes).toHaveBeenCalledWith('e1', 0, 50);
  });

  it('informa indisponibilidade sem detalhes quando o extrato não existe', async () => {
    repositorio.buscarExtrato.mockResolvedValue(null);
    await expect(servico.obterExtrato('x')).rejects.toBeInstanceOf(RecursoNaoEncontrado);
    await expect(servico.exportarPdf('x')).rejects.toMatchObject({
      response: { mensagem: 'Extrato de auditoria indisponível.' },
    });
  });

  it('lista extratos por dataset e exige dataset existente', async () => {
    expect(await servico.listarExtratos('d1')).toHaveLength(1);
    datasets.buscarPorId.mockResolvedValue(null);
    await expect(servico.listarExtratos('d2')).rejects.toBeInstanceOf(RecursoNaoEncontrado);
  });

  it('lista datasets auditados', async () => {
    expect(await servico.listarDatasetsAuditados()).toEqual([
      {
        id: 'd1',
        nome: 'Base',
        situacao: 'ATIVO',
        totalExtratos: 2,
        ultimaIntervencao: '2026-11-10T13:00:00.000Z',
      },
    ]);
  });

  it('exporta PDF válido identificado pelo extrato', async () => {
    const arquivo = await servico.exportarPdf('e1');
    expect(arquivo.nomeArquivo).toBe('extrato-auditoria-e1.pdf');
    expect(arquivo.conteudo.subarray(0, 5).toString()).toBe('%PDF-');
    expect(arquivo.conteudo.toString('latin1')).toContain('Extrato de auditoria e1');
  });
});
