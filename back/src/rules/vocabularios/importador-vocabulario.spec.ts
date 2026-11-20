import { ErroImportacaoVocabulario, prepararVocabulario } from './importador-vocabulario';

const metadados = { nome: 'CID-10', origem: 'Amostra de teste', versao: '2026-11', licenca: 'Uso acadêmico' };
const csv = (texto: string) => Buffer.from(texto);

describe('prepararVocabulario (ADR-009)', () => {
  it('lê códigos como texto, preservando zeros à esquerda, e calcula o hash do arquivo', async () => {
    const preparado = await prepararVocabulario(csv('codigo,descricao\nA00,Cólera\n007,Teste\n'), metadados);
    expect(preparado.codigos).toEqual([
      { codigo: 'A00', descricao: 'Cólera' },
      { codigo: '007', descricao: 'Teste' },
    ]);
    expect(preparado.hashArquivo).toMatch(/^[0-9a-f]{64}$/);
    expect(preparado.metadados).toEqual(metadados);
  });

  it('aceita colunas e separador configuráveis', async () => {
    const preparado = await prepararVocabulario(csv('CAT;DESC\nI10;Hipertensão\n'), metadados, {
      separador: ';',
      colunaCodigo: 'CAT',
      colunaDescricao: 'DESC',
    });
    expect(preparado.codigos).toEqual([{ codigo: 'I10', descricao: 'Hipertensão' }]);
  });

  it.each(['origem', 'versao', 'licenca', 'nome'] as const)('exige %s', async (campo) => {
    await expect(prepararVocabulario(csv('codigo\nA00\n'), { ...metadados, [campo]: '  ' })).rejects.toThrow(
      ErroImportacaoVocabulario,
    );
  });

  it('recusa vocabulário fora da baseline (ex.: TUSS)', async () => {
    await expect(prepararVocabulario(csv('codigo\n1\n'), { ...metadados, nome: 'TUSS' })).rejects.toThrow(
      'fora da baseline',
    );
  });

  it.each([
    ['código repetido', 'codigo\nA00\nA00\n', 'repetido'],
    ['código vazio', 'codigo,descricao\n ,x\n', 'vazio'],
    ['coluna ausente', 'cod\nA00\n', 'não encontrada'],
    ['arquivo sem registros', 'codigo\n', 'inválido'],
  ])('recusa %s', async (_caso, conteudo, mensagem) => {
    await expect(prepararVocabulario(csv(conteudo), metadados)).rejects.toThrow(mensagem);
  });
});
