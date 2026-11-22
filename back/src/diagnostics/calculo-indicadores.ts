import { DimensaoQualidade } from '../rules/motor/tipos';
import { IndicadorDto, ORDEM_DIMENSOES, RegraDoIndicador, SituacaoIndicador } from './diagnostico.tipos';

export interface ResultadoParaIndicador extends RegraDoIndicador {
  dimensao: DimensaoQualidade;
  linhasVioladas: number[];
}

/** Arredondamento a duas casas decimais (meio para cima), evitando erro binário de ponto flutuante. */
export function arredondarPercentual(numerador: number, denominador: number): number {
  return Math.round((numerador * 10000) / denominador) / 100;
}

/**
 * calcularIndicadores(resultados, totalLinhas) — P1, seção 8.3, e RN01:
 * percentual = 100 × linhas aprovadas em TODAS as regras da dimensão ÷ total de linhas da versão.
 * Uma linha violadora conta uma única vez por dimensão. Dimensão sem regra fica "Não avaliada",
 * sem percentual. Devolve sempre os três indicadores, na ordem fixa.
 */
export function calcularIndicadores(
  resultados: readonly ResultadoParaIndicador[],
  totalLinhas: number,
): [IndicadorDto, IndicadorDto, IndicadorDto] {
  if (!Number.isInteger(totalLinhas) || totalLinhas < 1) {
    throw new Error('O total de linhas da versão avaliada deve ser positivo.');
  }
  return ORDEM_DIMENSOES.map((dimensao) => {
    const daDimensao = resultados.filter((r) => r.dimensao === dimensao);
    const regras = daDimensao.map(({ regraId, revisao, nome, colunas }) => ({
      regraId,
      revisao,
      nome,
      colunas,
    }));
    if (daDimensao.length === 0) {
      return {
        dimensao,
        situacao: SituacaoIndicador.NAO_AVALIADA,
        percentual: null,
        numerador: null,
        denominador: null,
        linhasComViolacao: null,
        regras,
      };
    }
    const violadoras = new Set<number>();
    for (const resultado of daDimensao) {
      for (const linha of resultado.linhasVioladas) {
        violadoras.add(linha);
      }
    }
    const aprovadas = totalLinhas - violadoras.size;
    return {
      dimensao,
      situacao: SituacaoIndicador.AVALIADA,
      percentual: arredondarPercentual(aprovadas, totalLinhas),
      numerador: aprovadas,
      denominador: totalLinhas,
      linhasComViolacao: violadoras.size,
      regras,
    };
  }) as [IndicadorDto, IndicadorDto, IndicadorDto];
}

export function cobertura(indicadores: readonly IndicadorDto[]): {
  dimensoesAvaliadas: number;
  totalDimensoes: 3;
  situacao: 'COMPLETA' | 'PARCIAL';
} {
  const avaliadas = indicadores.filter((i) => i.situacao === SituacaoIndicador.AVALIADA).length;
  return {
    dimensoesAvaliadas: avaliadas,
    totalDimensoes: 3,
    situacao: avaliadas === 3 ? 'COMPLETA' : 'PARCIAL',
  };
}
