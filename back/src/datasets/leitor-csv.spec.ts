import { escreverCsv, lerCsv } from './leitor-csv';

describe('leitor e escritor de CSV', () => {
  it('lê cabeçalho e registros como texto, removendo BOM e preservando espaços', async () => {
    const conteudo = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('id;nome\n001; Ana \n002;"B;ia"\n'),
    ]);
    expect(await lerCsv(conteudo, ';')).toEqual({
      colunas: ['id', 'nome'],
      registros: [
        ['001', ' Ana '],
        ['002', 'B;ia'],
      ],
    });
  });

  it('escreve com aspas apenas quando necessário e permite releitura idêntica', async () => {
    const colunas = ['a', 'b'];
    const registros = [
      ['1', 'texto, com vírgula'],
      ['2', 'aspas "x"'],
      ['3', 'quebra\nlinha'],
      ['4', '=1+1'],
    ];
    const buffer = escreverCsv(colunas, registros, ',');
    expect(buffer.toString()).toContain('"texto, com vírgula"');
    expect(buffer.toString()).toContain('"aspas ""x"""');
    expect(buffer.toString()).toContain('\n4,=1+1\n');
    expect(await lerCsv(buffer, ',')).toEqual({ colunas, registros });
  });
});
