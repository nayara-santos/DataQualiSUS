/** Contrato de importação da P1, seção 8.3 (limites inclusivos e simultâneos). */
export const LIMITE_BYTES = 10_000_000;
export const LIMITE_REGISTROS = 100_000;
export const LIMITE_COLUNAS = 100;

export type Separador = ',' | ';';

export enum SeparadorCsv {
  VIRGULA = 'VIRGULA',
  PONTO_E_VIRGULA = 'PONTO_E_VIRGULA',
}

export function caractereSeparador(separador: SeparadorCsv | undefined): Separador {
  return separador === SeparadorCsv.PONTO_E_VIRGULA ? ';' : ',';
}
