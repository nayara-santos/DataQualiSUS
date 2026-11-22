import { DimensaoQualidade } from '../rules/motor/tipos';

/** SituacaoIndicador (MOD-10). */
export enum SituacaoIndicador {
  AVALIADA = 'AVALIADA',
  NAO_AVALIADA = 'NAO_AVALIADA',
}

export const ORDEM_DIMENSOES: readonly DimensaoQualidade[] = [
  DimensaoQualidade.UNICIDADE,
  DimensaoQualidade.COMPLETUDE,
  DimensaoQualidade.VALIDADE,
];

export const AVISO_DIAGNOSTICO =
  'Os indicadores descrevem somente as regras executadas nesta avaliação e não constituem certificação, ' +
  'atestado ou garantia de confiabilidade clínica dos dados.';

export interface RegraDoIndicador {
  regraId: string;
  revisao: number;
  nome: string;
  colunas: string[];
}

/** IndicadorDimensao (MOD-14). */
export interface IndicadorDto {
  dimensao: DimensaoQualidade;
  situacao: SituacaoIndicador;
  percentual: number | null;
  numerador: number | null;
  denominador: number | null;
  linhasComViolacao: number | null;
  regras: RegraDoIndicador[];
}

/** DiagnosticoDTO (ADR-007): consumido pela tela T06 e pelas exportações PDF/XLSX. */
export interface DiagnosticoDto {
  dataset: { id: string; nome: string; situacao: string };
  versao: { id: string; numero: number; hashSha256: string };
  simulacaoId: string;
  conjunto: { id: string; nome: string; revisao: number };
  avaliadoEm: string;
  totalLinhas: number;
  cobertura: { dimensoesAvaliadas: number; totalDimensoes: 3; situacao: 'COMPLETA' | 'PARCIAL' };
  indicadores: [IndicadorDto, IndicadorDto, IndicadorDto];
  aviso: string;
}
