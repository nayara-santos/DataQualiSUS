import { TipoColuna } from './tipos';

/** Campo vazio: sem conteúdo ou somente espaços (P1, seção 8.3). */
export function estaVazio(valor: string | undefined | null): boolean {
  return valor === undefined || valor === null || valor.trim() === '';
}

const DECIMAL = /^-?\d+(\.\d+)?$/;
const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

export type ResultadoConversao = { ok: true; valor: string | number } | { ok: false };

/**
 * Converte o texto conforme o tipo declarado. Decimal usa ponto e não admite separador de
 * milhares; data segue AAAA-MM-DD e precisa existir no calendário. Espaços nas extremidades não
 * são conteúdo e são desconsiderados na conversão de números e datas.
 */
export function converter(valor: string, tipo: TipoColuna): ResultadoConversao {
  if (tipo === TipoColuna.TEXTO) {
    return { ok: true, valor };
  }
  const texto = valor.trim();
  if (tipo === TipoColuna.DECIMAL) {
    return DECIMAL.test(texto) ? { ok: true, valor: Number(texto) } : { ok: false };
  }
  const partes = DATA.exec(texto);
  if (!partes) {
    return { ok: false };
  }
  const [ano, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const existe = data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
  return existe ? { ok: true, valor: data.getTime() } : { ok: false };
}

export function compativelComTipo(valor: string, tipo: TipoColuna): boolean {
  return converter(valor, tipo).ok;
}
