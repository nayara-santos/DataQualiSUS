import { DimensaoQualidade } from '../rules/motor/tipos';
import { arredondarPercentual, calcularIndicadores, cobertura } from './calculo-indicadores';
import { SituacaoIndicador } from './diagnostico.tipos';

const { UNICIDADE, COMPLETUDE, VALIDADE } = DimensaoQualidade;
const resultado = (
  dimensao: DimensaoQualidade,
  linhasVioladas: number[],
  regraId = `${dimensao}-${linhasVioladas.join('.')}`,
) => ({
  regraId,
  revisao: 1,
  nome: regraId,
  colunas: ['c'],
  dimensao,
  linhasVioladas,
});

describe('calcularIndicadores (RN01; P1, seção 8.3)', () => {
  it('aplica 100 × aprovadas em todas as regras ÷ total de linhas', () => {
    const [u, c, v] = calcularIndicadores(
      [resultado(UNICIDADE, [2]), resultado(COMPLETUDE, [1, 3]), resultado(VALIDADE, [])],
      4,
    );
    expect(u).toMatchObject({
      situacao: 'AVALIADA',
      numerador: 3,
      denominador: 4,
      percentual: 75,
      linhasComViolacao: 1,
    });
    expect(c).toMatchObject({ numerador: 2, denominador: 4, percentual: 50 });
    expect(v).toMatchObject({ numerador: 4, percentual: 100, linhasComViolacao: 0 });
  });

  it('conta uma linha violadora uma única vez por dimensão (cenário A6)', () => {
    const [, , validade] = calcularIndicadores(
      [
        resultado(VALIDADE, [1, 2, 5], 'v1'),
        resultado(VALIDADE, [2, 5, 7], 'v2'),
        resultado(VALIDADE, [5], 'v3'),
      ],
      10,
    );
    expect(validade).toMatchObject({ linhasComViolacao: 4, numerador: 6, percentual: 60 });
    expect(validade.regras.map((r) => r.regraId)).toEqual(['v1', 'v2', 'v3']);
  });

  it('não mistura violações de dimensões diferentes', () => {
    const [u, c] = calcularIndicadores([resultado(UNICIDADE, [1]), resultado(COMPLETUDE, [2])], 2);
    expect(u.numerador).toBe(1);
    expect(c.numerador).toBe(1);
  });

  it('marca dimensão sem regra como Não avaliada, sem percentual fictício', () => {
    const indicadores = calcularIndicadores([resultado(COMPLETUDE, [])], 5);
    expect(indicadores.map((i) => i.dimensao)).toEqual([UNICIDADE, COMPLETUDE, VALIDADE]);
    expect(indicadores[0]).toEqual({
      dimensao: UNICIDADE,
      situacao: SituacaoIndicador.NAO_AVALIADA,
      percentual: null,
      numerador: null,
      denominador: null,
      linhasComViolacao: null,
      regras: [],
    });
    expect(cobertura(indicadores)).toEqual({ dimensoesAvaliadas: 1, totalDimensoes: 3, situacao: 'PARCIAL' });
  });

  it('devolve sempre os três cartões, mesmo sem nenhuma regra', () => {
    const indicadores = calcularIndicadores([], 3);
    expect(indicadores).toHaveLength(3);
    expect(cobertura(indicadores).dimensoesAvaliadas).toBe(0);
  });

  it('informa cobertura completa com as três dimensões', () => {
    expect(
      cobertura(
        calcularIndicadores(
          [resultado(UNICIDADE, []), resultado(COMPLETUDE, []), resultado(VALIDADE, [])],
          1,
        ),
      ).situacao,
    ).toBe('COMPLETA');
  });

  it.each([
    [22, 24, 91.67],
    [21, 24, 87.5],
    [2, 3, 66.67],
    [1, 3, 33.33],
    [1, 8, 12.5],
    [19, 22, 86.36],
    [12, 21, 57.14],
    [0, 7, 0],
  ])('arredonda %i/%i para %p com duas casas', (numerador, denominador, esperado) => {
    expect(arredondarPercentual(numerador, denominador)).toBe(esperado);
  });

  it('rejeita total de linhas inválido', () => {
    expect(() => calcularIndicadores([], 0)).toThrow('positivo');
  });
});
