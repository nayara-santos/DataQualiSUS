import { ConflitoEstado, ErroNegocio } from '../common/erros/erro-negocio';
import { DatabaseService } from '../database/database.service';
import { DimensaoQualidade } from './motor/tipos';
import { NotificadorRevisaoConjunto } from './notificador-revisao';
import { RegraService } from './regra.service';
import { RegrasRepository } from './regras.repository';
import { ConjuntoRegistro, RegraRegistro, SituacaoCadastro } from './regras.tipos';
import { VocabularioService } from './vocabularios/vocabulario.service';

const datas = { criado_em: new Date(), atualizado_em: new Date() };
const configAparar = (coluna: string) => ({
  dimensao: DimensaoQualidade.COMPLETUDE,
  colunas: [{ nome: coluna, tipo: 'TEXTO' }],
  acao: { tipo: 'APARAR_ESPACOS', coluna },
});

function regra(
  id: string,
  configuracao = configAparar('nome'),
  situacao = SituacaoCadastro.ATIVO,
): RegraRegistro {
  return {
    id,
    nome: `Regra ${id}`,
    descricao: '',
    dimensao: DimensaoQualidade.COMPLETUDE,
    revisao_atual: 1,
    situacao,
    criado_por: 'u1',
    configuracao: configuracao as never,
    ...datas,
  };
}

describe('RegraService', () => {
  let repositorio: jest.Mocked<RegrasRepository>;
  let vocabularios: jest.Mocked<Pick<VocabularioService, 'disponiveis'>>;
  let notificador: NotificadorRevisaoConjunto;
  let servico: RegraService;

  beforeEach(() => {
    repositorio = {
      inserirRegra: jest.fn().mockResolvedValue('r1'),
      buscarRegra: jest.fn().mockResolvedValue(regra('r1')),
      revisarRegra: jest.fn().mockResolvedValue(2),
      listarConjuntosComRegra: jest.fn().mockResolvedValue([]),
      buscarRevisoesRegra: jest.fn(),
      revisarConjunto: jest.fn(),
      excluirRegra: jest.fn(),
    } as unknown as jest.Mocked<RegrasRepository>;
    vocabularios = {
      disponiveis: jest.fn().mockResolvedValue(new Map([['3f0c3d1e-0000-4000-8000-000000000001', {}]])),
    };
    notificador = new NotificadorRevisaoConjunto();
    const banco = { transacao: jest.fn((t) => t('tx')) } as unknown as DatabaseService;
    servico = new RegraService(
      banco,
      repositorio,
      vocabularios as unknown as VocabularioService,
      notificador,
    );
  });

  it('cria regra válida com a revisão 1 e a dimensão da configuração', async () => {
    await servico.criar({ nome: ' Nome preenchido ', configuracao: configAparar('nome') }, 'u1');
    expect(repositorio.inserirRegra).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'Nome preenchido', dimensao: DimensaoQualidade.COMPLETUDE }),
      'tx',
    );
  });

  it('impede salvar configuração inválida e devolve os campos', async () => {
    const erro = await servico
      .criar({ nome: 'x', configuracao: { dimensao: 'VALIDADE', combinador: 'E', condicoes: [] } }, 'u1')
      .catch((e) => e);
    expect(erro).toBeInstanceOf(ErroNegocio);
    expect(erro.getResponse()).toMatchObject({
      erro: 'CONFIGURACAO_INVALIDA',
      detalhes: [{ campo: 'condicoes' }],
    });
    expect(repositorio.inserirRegra).not.toHaveBeenCalled();
  });

  it('consulta a disponibilidade do vocabulário referenciado (RN02)', async () => {
    const id = '3f0c3d1e-0000-4000-8000-000000000001';
    await servico.validarParametros({
      dimensao: 'VALIDADE',
      combinador: 'E',
      condicoes: [{ coluna: 'cid', tipo: 'TEXTO', operador: 'PERTENCE_VOCABULARIO', vocabularioId: id }],
    });
    expect(vocabularios.disponiveis).toHaveBeenCalledWith([id]);
    vocabularios.disponiveis.mockResolvedValue(new Map());
    await expect(
      servico.validarParametros({
        dimensao: 'VALIDADE',
        combinador: 'E',
        condicoes: [{ coluna: 'cid', tipo: 'TEXTO', operador: 'PERTENCE_VOCABULARIO', vocabularioId: id }],
      }),
    ).rejects.toBeInstanceOf(ErroNegocio);
  });

  it('edição cria revisão da regra e dos conjuntos que a usam, notificando a invalidação', async () => {
    const conjunto: ConjuntoRegistro = {
      id: 'c1',
      nome: 'Conjunto',
      descricao: '',
      revisao_atual: 4,
      situacao: SituacaoCadastro.ATIVO,
      criado_por: 'u1',
      itens: [
        { regraId: 'r1', regraRevisao: 1, ordem: 1 },
        { regraId: 'r2', regraRevisao: 3, ordem: 2 },
      ],
      ...datas,
    };
    repositorio.listarConjuntosComRegra.mockResolvedValue([conjunto]);
    repositorio.buscarRevisoesRegra.mockResolvedValue([
      { regra_id: 'r1', revisao: 2, nome: 'A', configuracao: configAparar('nome') },
      { regra_id: 'r2', revisao: 3, nome: 'B', configuracao: configAparar('municipio') },
    ] as never);
    const observador = jest.fn().mockResolvedValue(undefined);
    notificador.registrar(observador);

    await servico.atualizar('r1', { configuracao: configAparar('nome') }, 'u1');

    expect(repositorio.revisarRegra).toHaveBeenCalled();
    expect(repositorio.revisarConjunto).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({
        motivo: 'REVISAO_REGRA',
        itens: [
          { regraId: 'r1', regraRevisao: 2, ordem: 1 },
          { regraId: 'r2', regraRevisao: 3, ordem: 2 },
        ],
      }),
      'tx',
    );
    expect(observador).toHaveBeenCalledWith(['c1'], 'tx');
  });

  it('recusa edição que cria conflito de escrita em conjunto existente', async () => {
    repositorio.listarConjuntosComRegra.mockResolvedValue([
      {
        id: 'c1',
        nome: 'C',
        itens: [
          { regraId: 'r1', regraRevisao: 1, ordem: 1 },
          { regraId: 'r2', regraRevisao: 1, ordem: 2 },
        ],
      } as never,
    ]);
    repositorio.buscarRevisoesRegra.mockResolvedValue([
      { regra_id: 'r1', revisao: 2, nome: 'A', configuracao: configAparar('municipio') },
      { regra_id: 'r2', revisao: 1, nome: 'B', configuracao: configAparar('municipio') },
    ] as never);
    await expect(
      servico.atualizar('r1', { configuracao: configAparar('municipio') }, 'u1'),
    ).rejects.toMatchObject({
      codigo: 'CONJUNTO_INCOMPATIVEL',
    });
    expect(repositorio.revisarConjunto).not.toHaveBeenCalled();
  });

  it('exige ao menos um campo na edição', async () => {
    await expect(servico.atualizar('r1', {}, 'u1')).rejects.toMatchObject({ codigo: 'ALTERACAO_AUSENTE' });
  });

  it('impede excluir regra em uso e regra já excluída', async () => {
    repositorio.listarConjuntosComRegra.mockResolvedValue([{ id: 'c1', nome: 'C' } as never]);
    await expect(servico.excluir('r1')).rejects.toBeInstanceOf(ConflitoEstado);
    repositorio.buscarRegra.mockResolvedValue(regra('r1', undefined, SituacaoCadastro.EXCLUIDO_LOGICAMENTE));
    await expect(servico.excluir('r1')).rejects.toMatchObject({ response: { erro: 'REGRA_EXCLUIDA' } });
    expect(repositorio.excluirRegra).not.toHaveBeenCalled();
  });

  it('exclui logicamente regra fora de conjuntos', async () => {
    await servico.excluir('r1');
    expect(repositorio.excluirRegra).toHaveBeenCalledWith('r1', 'tx');
  });
});
