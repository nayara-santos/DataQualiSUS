import { REGISTRO_ACOES } from './registro-acoes';
import { Caixa, DimensaoQualidade, TipoAcao } from './tipos';

describe('registro de ações (catálogo fechado)', () => {
  it('possui exatamente as quatro ações da P1, seção 8.3', () => {
    expect(Object.keys(REGISTRO_ACOES).sort()).toEqual(
      ['APARAR_ESPACOS', 'CONVERTER_CAIXA', 'PREENCHER_VAZIO', 'REMOVER_REPETICOES'].sort(),
    );
  });

  it('apara espaços nas extremidades sem tocar no interior', () => {
    expect(
      REGISTRO_ACOES.APARAR_ESPACOS.transformar!('  Nossa  Senhora ', { tipo: TipoAcao.APARAR_ESPACOS }),
    ).toBe('Nossa  Senhora');
  });

  it('converte caixa com regras do português', () => {
    const acao = REGISTRO_ACOES.CONVERTER_CAIXA;
    expect(
      acao.transformar!('São Cristóvão', { tipo: TipoAcao.CONVERTER_CAIXA, caixa: Caixa.MAIUSCULAS }),
    ).toBe('SÃO CRISTÓVÃO');
    expect(acao.transformar!('AÇÃO', { tipo: TipoAcao.CONVERTER_CAIXA, caixa: Caixa.MINUSCULAS })).toBe(
      'ação',
    );
  });

  it('preenche somente campo vazio com o literal configurado', () => {
    const acao = REGISTRO_ACOES.PREENCHER_VAZIO;
    const config = { tipo: TipoAcao.PREENCHER_VAZIO, valor: 'NAO_INFORMADO' };
    expect(acao.transformar!('  ', config)).toBe('NAO_INFORMADO');
    expect(acao.transformar!('', config)).toBe('NAO_INFORMADO');
    expect(acao.transformar!('ignorado', config)).toBe('ignorado');
  });

  it('limita a remoção de repetições à dimensão unicidade', () => {
    expect(REGISTRO_ACOES.REMOVER_REPETICOES.dimensoes).toEqual([DimensaoQualidade.UNICIDADE]);
    expect(REGISTRO_ACOES.REMOVER_REPETICOES.transformar).toBeUndefined();
  });
});
