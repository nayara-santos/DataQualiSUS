import { converter, estaVazio } from './conversao';
import { TipoColuna } from './tipos';

describe('conversão de tipos declarados (P1, seção 8.3)', () => {
  it.each(['', '   ', '\t', undefined, null])('considera vazio %p', (valor) => {
    expect(estaVazio(valor as string)).toBe(true);
  });

  it.each(['0', 'ignorado', ' x '])('não considera vazio %p', (valor) => {
    expect(estaVazio(valor)).toBe(false);
  });

  it.each([
    ['10', 10],
    ['-3.25', -3.25],
    [' 7.5 ', 7.5],
    ['007', 7],
  ])('converte decimal %p', (texto, esperado) => {
    expect(converter(texto, TipoColuna.DECIMAL)).toEqual({ ok: true, valor: esperado });
  });

  it.each(['1,5', '1.000,00', '1 000', '1e3', '+2', '.5', '5.', 'abc', '0x10', 'Infinity', 'NaN'])(
    'rejeita decimal fora do formato %p',
    (texto) => {
      expect(converter(texto, TipoColuna.DECIMAL).ok).toBe(false);
    },
  );

  it('converte data AAAA-MM-DD existente', () => {
    expect(converter('2024-02-29', TipoColuna.DATA)).toEqual({ ok: true, valor: Date.UTC(2024, 1, 29) });
  });

  it.each([
    '2023-02-29',
    '2024-13-01',
    '2024-00-10',
    '01/02/2024',
    '2024-1-5',
    '2024-01-01T00:00',
    '20240101',
  ])('rejeita data inválida %p', (texto) => {
    expect(converter(texto, TipoColuna.DATA).ok).toBe(false);
  });

  it('mantém texto sem alteração (códigos clínicos preservam zeros e espaços)', () => {
    expect(converter(' 0012 ', TipoColuna.TEXTO)).toEqual({ ok: true, valor: ' 0012 ' });
  });
});
