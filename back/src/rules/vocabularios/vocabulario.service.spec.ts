import { ConflitoEstado, RecursoNaoEncontrado } from '../../common/erros/erro-negocio';
import { DatabaseService } from '../../database/database.service';
import { VocabularioRepository } from './vocabulario.repository';
import { VocabularioService } from './vocabulario.service';
import { VocabularioRegistro } from './vocabulario.tipos';

function registro(nome: string, id = nome): VocabularioRegistro {
  return {
    id,
    nome,
    origem: 'o',
    versao: '1',
    licenca: 'l',
    hash_arquivo: 'a'.repeat(64),
    total_codigos: 2,
    importado_em: new Date('2026-11-01T00:00:00Z'),
  };
}

describe('VocabularioService', () => {
  let repositorio: jest.Mocked<VocabularioRepository>;
  let servico: VocabularioService;

  beforeEach(() => {
    repositorio = {
      listar: jest.fn().mockResolvedValue([registro('CID-10'), registro('TUSS')]),
      buscarPorId: jest.fn(),
      buscarPorIds: jest.fn().mockResolvedValue([registro('CID-10', 'v1'), registro('TUSS', 'v2')]),
      contem: jest.fn().mockResolvedValue(true),
      listarCodigos: jest.fn(),
      inserir: jest.fn().mockResolvedValue(registro('CID-10')),
    } as unknown as jest.Mocked<VocabularioRepository>;
    const banco = { transacao: jest.fn((t) => t('tx')) } as unknown as DatabaseService;
    servico = new VocabularioService(banco, repositorio);
  });

  it('lista apenas vocabulários admitidos e identificados', async () => {
    const lista = await servico.listarDisponiveis();
    expect(lista.map((v) => v.nome)).toEqual(['CID-10']);
    expect(lista[0]).toMatchObject({ origem: 'o', versao: '1', licenca: 'l', totalCodigos: 2 });
  });

  it('não oferece vocabulário inexistente ou fora da baseline', async () => {
    repositorio.buscarPorId.mockResolvedValueOnce(null).mockResolvedValueOnce(registro('TUSS'));
    await expect(servico.obter('x')).rejects.toBeInstanceOf(RecursoNaoEncontrado);
    await expect(servico.obter('y')).rejects.toBeInstanceOf(RecursoNaoEncontrado);
  });

  it('informa quais vocabulários referenciados estão disponíveis', async () => {
    const mapa = await servico.disponiveis(['v1', 'v2', 'v1']);
    expect([...mapa.keys()]).toEqual(['v1']);
    expect(repositorio.buscarPorIds).toHaveBeenCalledWith(['v1', 'v2']);
  });

  it('importa em transação e recusa reimportar a mesma versão', async () => {
    const conteudo = Buffer.from('codigo\nA00\nB20\n');
    const meta = { nome: 'CID-10', origem: 'o', versao: '1', licenca: 'l' };
    await expect(servico.importar(conteudo, meta)).resolves.toMatchObject({ nome: 'CID-10' });
    expect(repositorio.inserir.mock.calls[0][1]).toBe('tx');
    repositorio.inserir.mockRejectedValueOnce(Object.assign(new Error('duplicada'), { code: '23505' }));
    await expect(servico.importar(conteudo, meta)).rejects.toBeInstanceOf(ConflitoEstado);
  });
});
