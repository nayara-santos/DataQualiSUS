import { converter } from './conversao';
import { obterOperador, REGISTRO_OPERADORES } from './registro-operadores';
import { TipoColuna } from './tipos';

const { TEXTO, DECIMAL, DATA } = TipoColuna;

function avaliar(codigo: string, valor: string, tipo: TipoColuna, parametro?: string | string[]): boolean {
  const operador = obterOperador(codigo)!;
  const parametros =
    parametro === undefined
      ? {}
      : Array.isArray(parametro)
        ? { lista: new Set(parametro), vocabulario: new Set(parametro) }
        : { constante: (converter(parametro, tipo) as { valor: string | number }).valor };
  return operador.avaliar(valor, tipo, parametros);
}

describe('registro de operadores (ADR-002)', () => {
  it('contém exatamente o catálogo da P1 (seção 8.3) mais a verificação por vocabulário (RN02)', () => {
    expect(Object.keys(REGISTRO_OPERADORES).sort()).toEqual(
      [
        'DIFERENTE',
        'IGUAL',
        'MAIOR',
        'MAIOR_IGUAL',
        'MENOR',
        'MENOR_IGUAL',
        'NAO_VAZIO',
        'PERTENCE_LISTA',
        'PERTENCE_VOCABULARIO',
        'VAZIO',
      ].sort(),
    );
  });

  it('restringe lista e vocabulário a texto e ordenação a números e datas', () => {
    expect(REGISTRO_OPERADORES.PERTENCE_LISTA.tipos).toEqual([TEXTO]);
    expect(REGISTRO_OPERADORES.PERTENCE_VOCABULARIO.tipos).toEqual([TEXTO]);
    for (const op of ['MAIOR', 'MAIOR_IGUAL', 'MENOR', 'MENOR_IGUAL']) {
      expect(REGISTRO_OPERADORES[op].tipos).toEqual([DECIMAL, DATA]);
    }
  });

  it('não expõe propriedades herdadas como operadores', () => {
    expect(obterOperador('constructor')).toBeUndefined();
    expect(obterOperador('toString')).toBeUndefined();
    expect(obterOperador('REGEX')).toBeUndefined();
  });

  it.each([
    ['IGUAL', 'SE', TEXTO, 'SE', true],
    ['IGUAL', 'se', TEXTO, 'SE', false],
    ['IGUAL', ' SE', TEXTO, 'SE', false],
    ['DIFERENTE', 'AL', TEXTO, 'SE', true],
    ['IGUAL', '10.0', DECIMAL, '10', true],
    ['DIFERENTE', '10', DECIMAL, '10.00', false],
    ['MAIOR', '10.5', DECIMAL, '10', true],
    ['MAIOR_IGUAL', '10', DECIMAL, '10', true],
    ['MENOR', '-1', DECIMAL, '0', true],
    ['MENOR_IGUAL', '0.01', DECIMAL, '0', false],
    ['MAIOR', '2025-01-02', DATA, '2025-01-01', true],
    ['MENOR_IGUAL', '2025-01-01', DATA, '2025-01-01', true],
    ['MENOR', '2026-12-31', DATA, '2026-01-01', false],
  ])('%s(%p, %s, %p) = %p', (codigo, valor, tipo, parametro, esperado) => {
    expect(avaliar(codigo, valor, tipo, parametro)).toBe(esperado);
  });

  it.each(['IGUAL', 'DIFERENTE', 'MAIOR', 'MAIOR_IGUAL', 'MENOR', 'MENOR_IGUAL'])(
    'campo vazio falha na comparação %s',
    (codigo) => {
      const tipo = REGISTRO_OPERADORES[codigo].tipos.includes(DECIMAL) ? DECIMAL : TEXTO;
      expect(avaliar(codigo, '  ', tipo, tipo === DECIMAL ? '1' : 'x')).toBe(false);
    },
  );

  it('valor não convertível falha em comparações numéricas (violação de validade)', () => {
    expect(avaliar('MAIOR', 'abc', DECIMAL, '0')).toBe(false);
    expect(avaliar('DIFERENTE', '1,5', DECIMAL, '0')).toBe(false);
    expect(avaliar('IGUAL', '31/12/2025', DATA, '2025-12-31')).toBe(false);
  });

  it('avalia vazio e não vazio, exigindo conversão no não vazio', () => {
    expect(avaliar('VAZIO', ' ', TEXTO)).toBe(true);
    expect(avaliar('VAZIO', 'x', TEXTO)).toBe(false);
    expect(avaliar('NAO_VAZIO', 'x', TEXTO)).toBe(true);
    expect(avaliar('NAO_VAZIO', '', TEXTO)).toBe(false);
    expect(avaliar('NAO_VAZIO', 'abc', DECIMAL)).toBe(false);
    expect(avaliar('NAO_VAZIO', '2025-02-30', DATA)).toBe(false);
  });

  it('avalia pertencimento à lista literal e ao vocabulário', () => {
    expect(avaliar('PERTENCE_LISTA', 'M', TEXTO, ['M', 'F'])).toBe(true);
    expect(avaliar('PERTENCE_LISTA', 'm', TEXTO, ['M', 'F'])).toBe(false);
    expect(avaliar('PERTENCE_LISTA', '', TEXTO, ['M', ''])).toBe(false);
    expect(avaliar('PERTENCE_VOCABULARIO', 'J18.9', TEXTO, ['J18.9'])).toBe(true);
    expect(avaliar('PERTENCE_VOCABULARIO', 'J189', TEXTO, ['J18.9'])).toBe(false);
  });
});
