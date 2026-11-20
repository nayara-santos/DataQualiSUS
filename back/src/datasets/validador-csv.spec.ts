import { LIMITE_BYTES, LIMITE_COLUNAS, LIMITE_REGISTROS } from './limites-csv';
import { ValidadorCsv } from './validador-csv';

const validador = new ValidadorCsv();
const csv = (texto: string): Buffer => Buffer.from(texto, 'utf8');
const validar = (conteudo: Buffer, separador: ',' | ';' = ',', nomeArquivo = 'dados.csv') =>
  validador.validar(conteudo, { separador, nomeArquivo });

function motivo(resultado: Awaited<ReturnType<typeof validar>>): string {
  return resultado.valido ? 'VALIDO' : resultado.motivo;
}

/** Gera um CSV de uma coluna com o número de registros desejado. */
function csvComRegistros(total: number): Buffer {
  return csv('id\n' + Array.from({ length: total }, (_, i) => String(i % 10)).join('\n') + '\n');
}

describe('ValidadorCsv (P1, seção 8.3)', () => {
  it('aceita CSV válido e informa cabeçalho e contagem sem contar o cabeçalho', async () => {
    const resultado = await validar(csv('id,nome,idade\n1,Ana,30\n2,Bia,41\n'));
    expect(resultado).toEqual({
      valido: true,
      colunas: ['id', 'nome', 'idade'],
      totalRegistros: 2,
      tamanhoBytes: 32,
    });
  });

  it('aceita UTF-8 com BOM e acentuação', async () => {
    const conteudo = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      csv('município;código\nAracaju;2800308\n'),
    ]);
    const resultado = await validar(conteudo, ';');
    expect(resultado.valido && resultado.colunas).toEqual(['município', 'código']);
  });

  it('respeita aspas duplas em campos que contêm o separador e quebras de linha', async () => {
    const resultado = await validar(csv('id,obs\n1,"a, b"\n2,"linha1\nlinha2"\n3,"aspas ""internas"""\n'));
    expect(resultado.valido && resultado.totalRegistros).toBe(3);
  });

  it('aceita CRLF e ausência de quebra de linha final', async () => {
    expect(motivo(await validar(csv('a,b\r\n1,2\r\n3,4')))).toBe('VALIDO');
  });

  it('ignora apenas quebras de linha excedentes no fim do arquivo', async () => {
    const resultado = await validar(csv('a,b\n1,2\n\n\n'));
    expect(resultado.valido && resultado.totalRegistros).toBe(1);
  });

  it('usa o separador escolhido: ponto e vírgula com vírgulas decimais no conteúdo', async () => {
    const resultado = await validar(csv('a;b\n1,5;2\n'), ';');
    expect(resultado.valido && resultado.colunas).toEqual(['a', 'b']);
  });

  it.each([
    ['extensão diferente de .csv', csv('a\n1\n'), 'dados.txt', 'EXTENSAO_INVALIDA'],
    ['arquivo vazio', csv(''), 'dados.csv', 'ARQUIVO_VAZIO'],
    ['somente quebras de linha', csv('\n\n'), 'dados.csv', 'ARQUIVO_VAZIO'],
    ['somente cabeçalho', csv('a,b\n'), 'dados.csv', 'SEM_REGISTROS'],
    ['cabeçalho com nome vazio', csv('a,,c\n1,2,3\n'), 'dados.csv', 'CABECALHO_INVALIDO'],
    ['cabeçalho com nome só de espaços', csv('a,  \n1,2\n'), 'dados.csv', 'CABECALHO_INVALIDO'],
    ['cabeçalho duplicado', csv('a,b,a\n1,2,3\n'), 'dados.csv', 'CABECALHO_DUPLICADO'],
    ['cabeçalho duplicado após aparar espaços', csv('a, a\n1,2\n'), 'dados.csv', 'CABECALHO_DUPLICADO'],
    ['registro com campos a menos', csv('a,b\n1\n'), 'dados.csv', 'ESTRUTURA_INCONSISTENTE'],
    ['registro com campos a mais', csv('a,b\n1,2,3\n'), 'dados.csv', 'ESTRUTURA_INCONSISTENTE'],
    ['linha vazia no meio', csv('a,b\n1,2\n\n3,4\n'), 'dados.csv', 'ESTRUTURA_INCONSISTENTE'],
    ['aspas não fechadas', csv('a,b\n"1,2\n'), 'dados.csv', 'ESTRUTURA_INVALIDA'],
    ['aspas no meio de campo sem delimitação', csv('a,b\n1"x,2\n'), 'dados.csv', 'ESTRUTURA_INVALIDA'],
    [
      'codificação inválida (Latin-1)',
      Buffer.from([0x61, 0x0a, 0xe7, 0xe3, 0x0a]),
      'dados.csv',
      'CODIFICACAO_INVALIDA',
    ],
    [
      'binário renomeado (PNG)',
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
      'x.csv',
      'CODIFICACAO_INVALIDA',
    ],
    ['caractere nulo', csv('a\n1\u00002\n'), 'dados.csv', 'CODIFICACAO_INVALIDA'],
  ])('rejeita %s', async (_caso, conteudo, nome, esperado) => {
    expect(motivo(await validar(conteudo, ',', nome))).toBe(esperado);
  });

  it('trata o separador ponto e vírgula como estrutura de uma coluna quando o arquivo usa vírgula', async () => {
    const resultado = await validar(csv('a,b\n1,2\n'), ';');
    expect(resultado.valido && resultado.colunas).toEqual(['a,b']);
  });

  it('mantém conteúdo hostil como dado (HTML, SQL, fórmulas)', async () => {
    const resultado = await validar(
      csv('id,texto\n1,<script>alert(1)</script>\n2,"x\'; DROP TABLE dataset; --"\n3,=1+1\n4,@SOMA(A1)\n'),
    );
    expect(resultado.valido && resultado.totalRegistros).toBe(4);
  });

  describe('limites inclusivos', () => {
    it(`aceita exatamente ${LIMITE_REGISTROS} registros e rejeita ${LIMITE_REGISTROS + 1}`, async () => {
      expect(motivo(await validar(csvComRegistros(LIMITE_REGISTROS)))).toBe('VALIDO');
      expect(motivo(await validar(csvComRegistros(LIMITE_REGISTROS + 1)))).toBe('LIMITE_REGISTROS_EXCEDIDO');
    });

    it(`aceita exatamente ${LIMITE_COLUNAS} colunas e rejeita ${LIMITE_COLUNAS + 1}`, async () => {
      const gerar = (n: number) => {
        const nomes = Array.from({ length: n }, (_, i) => `c${i}`);
        return csv(`${nomes.join(',')}\n${nomes.map(() => '1').join(',')}\n`);
      };
      expect(motivo(await validar(gerar(LIMITE_COLUNAS)))).toBe('VALIDO');
      expect(motivo(await validar(gerar(LIMITE_COLUNAS + 1)))).toBe('LIMITE_COLUNAS_EXCEDIDO');
    });

    it(`aceita exatamente ${LIMITE_BYTES} bytes e rejeita ${LIMITE_BYTES + 1}`, async () => {
      const gerar = (tamanho: number) => {
        const cabecalho = 'texto\n';
        const linha = 'x'.repeat(99) + '\n';
        const linhas = Math.floor((tamanho - cabecalho.length) / linha.length);
        const resto = tamanho - cabecalho.length - linhas * linha.length;
        const corpo = linha.repeat(linhas - 1) + 'x'.repeat(99 + resto) + '\n';
        const buffer = csv(cabecalho + corpo);
        expect(buffer.length).toBe(tamanho);
        return buffer;
      };
      expect(motivo(await validar(gerar(LIMITE_BYTES)))).toBe('VALIDO');
      expect(motivo(await validar(gerar(LIMITE_BYTES + 1)))).toBe('LIMITE_BYTES_EXCEDIDO');
    });
  });
});
