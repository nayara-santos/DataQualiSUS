import { aplicarAcoes, avaliar, ErroMotor, preverAcoes, TipoAlteracao } from './motor-regras';
import { ConfiguracaoRegra, RegraExecutavel, TipoAcao } from './tipos';

let sequencia = 0;
function regra(configuracao: unknown, nome = `regra-${++sequencia}`, ordem = sequencia): RegraExecutavel {
  return { regraId: nome, revisao: 1, nome, ordem, configuracao: configuracao as ConfiguracaoRegra };
}

const colunas = ['id', 'nome', 'sexo', 'idade', 'cid', 'data'];
const registros = [
  ['1', 'Ana', 'F', '30', 'J18.9', '2025-01-10'],
  ['2', ' Bia ', '', '41', 'I10', '2025-02-30'],
  ['3', 'caio', 'ignorado', '-1', 'X99', '2025-03-01'],
  ['1', 'Ana', 'F', '30', 'J18.9', '2025-01-10'],
  ['', 'Duda', 'M', 'abc', '', ''],
  ['2', 'Bia', 'F', '200', 'I10', '2024-12-31'],
];

describe('MotorRegras.avaliar (ADR-002)', () => {
  it('unicidade: a primeira ocorrência representa a chave e cada repetição posterior viola', () => {
    const [r] = avaliar(colunas, registros, [
      regra({ dimensao: 'UNICIDADE', colunas: [{ nome: 'id', tipo: 'TEXTO' }] }),
    ]);
    expect(r.linhasVioladas).toEqual([4, 6]);
    expect(r.totalAvaliados).toBe(6);
  });

  it('unicidade com chave composta e chave vazia fora da comparação', () => {
    const [r] = avaliar(colunas, registros, [
      regra({
        dimensao: 'UNICIDADE',
        colunas: [
          { nome: 'id', tipo: 'TEXTO' },
          { nome: 'nome', tipo: 'TEXTO' },
        ],
      }),
    ]);
    // linha 6 (2,Bia) difere da linha 2 (2," Bia ") antes da normalização
    expect(r.linhasVioladas).toEqual([4]);
  });

  it('completude: vazio, somente espaços e marcadores declarados falham', () => {
    const [r] = avaliar(colunas, registros, [
      regra({
        dimensao: 'COMPLETUDE',
        colunas: [{ nome: 'sexo', tipo: 'TEXTO' }],
        marcadoresAusencia: ['ignorado'],
      }),
    ]);
    expect(r.linhasVioladas).toEqual([2, 3]);
  });

  it('completude sem marcador declarado não trata "ignorado" como ausência', () => {
    const [r] = avaliar(colunas, registros, [
      regra({ dimensao: 'COMPLETUDE', colunas: [{ nome: 'sexo', tipo: 'TEXTO' }] }),
    ]);
    expect(r.linhasVioladas).toEqual([2]);
  });

  it('completude de chave vazia falha quando configurada', () => {
    const [r] = avaliar(colunas, registros, [
      regra({ dimensao: 'COMPLETUDE', colunas: [{ nome: 'id', tipo: 'TEXTO' }] }),
    ]);
    expect(r.linhasVioladas).toEqual([5]);
  });

  it('validade por faixa (E) inclui erro de conversão como violação, sem descartar a linha', () => {
    const [r] = avaliar(colunas, registros, [
      regra({
        dimensao: 'VALIDADE',
        combinador: 'E',
        condicoes: [
          { coluna: 'idade', tipo: 'DECIMAL', operador: 'MAIOR_IGUAL', valor: '0' },
          { coluna: 'idade', tipo: 'DECIMAL', operador: 'MENOR_IGUAL', valor: '130' },
        ],
      }),
    ]);
    expect(r.linhasVioladas).toEqual([3, 5, 6]);
    expect(r.totalAvaliados).toBe(6);
  });

  it('validade de data detecta data inexistente e vazio', () => {
    const [r] = avaliar(colunas, registros, [
      regra({
        dimensao: 'VALIDADE',
        combinador: 'E',
        condicoes: [{ coluna: 'data', tipo: 'DATA', operador: 'NAO_VAZIO' }],
      }),
    ]);
    expect(r.linhasVioladas).toEqual([2, 5]);
  });

  it('validade com OU aprova se alguma condição for verdadeira', () => {
    const [r] = avaliar(colunas, registros, [
      regra({
        dimensao: 'VALIDADE',
        combinador: 'OU',
        condicoes: [
          { coluna: 'sexo', tipo: 'TEXTO', operador: 'PERTENCE_LISTA', valores: ['F', 'M'] },
          { coluna: 'sexo', tipo: 'TEXTO', operador: 'VAZIO' },
        ],
      }),
    ]);
    expect(r.linhasVioladas).toEqual([3]);
  });

  it('validade por vocabulário oficial', () => {
    const vocabularios = new Map([['cid10', new Set(['J18.9', 'I10'])]]);
    const [r] = avaliar(
      colunas,
      registros,
      [
        regra({
          dimensao: 'VALIDADE',
          combinador: 'E',
          condicoes: [
            { coluna: 'cid', tipo: 'TEXTO', operador: 'PERTENCE_VOCABULARIO', vocabularioId: 'cid10' },
          ],
        }),
      ],
      vocabularios,
    );
    expect(r.linhasVioladas).toEqual([3, 5]);
  });

  it('bloqueia a regra quando o vocabulário está ausente (RN02)', () => {
    expect(() =>
      avaliar(colunas, registros, [
        regra({
          dimensao: 'VALIDADE',
          combinador: 'E',
          condicoes: [{ coluna: 'cid', tipo: 'TEXTO', operador: 'PERTENCE_VOCABULARIO', vocabularioId: 'x' }],
        }),
      ]),
    ).toThrow(ErroMotor);
  });

  it('rejeita coluna inexistente', () => {
    expect(() =>
      avaliar(colunas, registros, [
        regra({ dimensao: 'COMPLETUDE', colunas: [{ nome: 'uf', tipo: 'TEXTO' }] }),
      ]),
    ).toThrow('inexistente');
  });

  it('não modifica os registros avaliados', () => {
    const copia = JSON.parse(JSON.stringify(registros));
    avaliar(colunas, registros, [
      regra({ dimensao: 'COMPLETUDE', colunas: [{ nome: 'nome', tipo: 'TEXTO' }] }),
    ]);
    expect(registros).toEqual(copia);
  });
});

describe('MotorRegras.aplicarAcoes e preverAcoes', () => {
  const aparar = regra(
    {
      dimensao: 'COMPLETUDE',
      colunas: [{ nome: 'nome', tipo: 'TEXTO' }],
      acao: { tipo: 'APARAR_ESPACOS', coluna: 'nome' },
    },
    'aparar',
    1,
  );
  const caixa = regra(
    {
      dimensao: 'VALIDADE',
      combinador: 'E',
      condicoes: [{ coluna: 'nome', tipo: 'TEXTO', operador: 'NAO_VAZIO' }],
      acao: { tipo: 'CONVERTER_CAIXA', coluna: 'sexo', caixa: 'MAIUSCULAS' },
    },
    'caixa',
    2,
  );
  const preencher = regra(
    {
      dimensao: 'COMPLETUDE',
      colunas: [{ nome: 'sexo', tipo: 'TEXTO' }],
      acao: { tipo: 'PREENCHER_VAZIO', coluna: 'sexo', valor: 'NI' },
    },
    'preencher',
    3,
  );
  const deduplicar = regra(
    {
      dimensao: 'UNICIDADE',
      colunas: [
        { nome: 'id', tipo: 'TEXTO' },
        { nome: 'nome', tipo: 'TEXTO' },
      ],
      acao: { tipo: 'REMOVER_REPETICOES' },
    },
    'deduplicar',
    0,
  );

  it('remove repetições depois da normalização, mesmo que a regra venha antes na ordem', () => {
    const resultado = aplicarAcoes(colunas, registros, [deduplicar, aparar]);
    // Após aparar, a linha 6 (2,Bia) passa a repetir a linha 2 (2,"Bia").
    expect(resultado.linhasRemovidas).toEqual([4, 6]);
    expect(resultado.linhasAlteradas).toEqual([2]);
    expect(resultado.registros).toHaveLength(4);
    expect(resultado.alteracoes.find((a) => a.linha === 6)).toMatchObject({
      tipo: TipoAlteracao.REMOCAO,
      linhaRepresentante: 2,
      acao: TipoAcao.REMOVER_REPETICOES,
    });
  });

  it('aplica as ações na ordem e conta cada linha uma única vez', () => {
    const resultado = aplicarAcoes(colunas, registros, [aparar, caixa, preencher]);
    expect(resultado.registros[1]).toEqual(['2', 'Bia', 'NI', '41', 'I10', '2025-02-30']);
    expect(resultado.registros[2][1]).toBe('caio');
    expect(resultado.registros[2][2]).toBe('IGNORADO');
    expect(resultado.linhasAlteradas).toEqual([2, 3]);
    expect(resultado.totalLinhasAfetadas).toBe(2);
    expect(resultado.alteracoes.filter((a) => a.linha === 2)).toHaveLength(2);
  });

  it('não infere valores: marcadores e códigos não são corrigidos sem ação configurada', () => {
    const resultado = aplicarAcoes(colunas, registros, [preencher]);
    expect(resultado.registros[2][2]).toBe('ignorado');
    expect(resultado.registros[2][4]).toBe('X99');
  });

  it('não altera os registros de entrada (tratamento sobre cópia)', () => {
    const copia = JSON.parse(JSON.stringify(registros));
    aplicarAcoes(colunas, registros, [aparar, caixa, preencher, deduplicar]);
    expect(registros).toEqual(copia);
  });

  it('sem ação configurada não há alterações', () => {
    const resultado = aplicarAcoes(colunas, registros, [
      regra({ dimensao: 'COMPLETUDE', colunas: [{ nome: 'sexo', tipo: 'TEXTO' }] }),
    ]);
    expect(resultado).toMatchObject({ alteracoes: [], totalLinhasAfetadas: 0 });
    expect(resultado.registros).toEqual(registros);
  });

  it('monta prévia com antes/depois e limite de linhas', () => {
    const { resultado, previa } = preverAcoes(colunas, registros, [aparar, preencher, deduplicar]);
    expect(resultado.totalLinhasAfetadas).toBe(3);
    expect(previa).toEqual([
      expect.objectContaining({
        linha: 2,
        tipo: 'ATUALIZACAO',
        antes: { nome: ' Bia ', sexo: '' },
        depois: { nome: 'Bia', sexo: 'NI' },
      }),
      expect.objectContaining({ linha: 4, tipo: 'REMOCAO', antes: { id: '1', nome: 'Ana' }, depois: null }),
      expect.objectContaining({ linha: 6, tipo: 'REMOCAO', depois: null }),
    ]);
    expect(preverAcoes(colunas, registros, [aparar, preencher, deduplicar], 1).previa).toHaveLength(1);
  });

  it('é determinístico: prever e aplicar produzem o mesmo resultado', () => {
    const regras = [aparar, caixa, preencher, deduplicar];
    expect(preverAcoes(colunas, registros, regras).resultado).toEqual(
      aplicarAcoes(colunas, registros, regras),
    );
  });
});
