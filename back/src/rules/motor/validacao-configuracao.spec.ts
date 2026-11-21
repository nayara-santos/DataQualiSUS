import { validarConfiguracaoRegra, validarConjunto, verificarColunas } from './validacao-configuracao';
import { ConfiguracaoRegra, DimensaoQualidade } from './tipos';

const contexto = { vocabulariosDisponiveis: new Set(['voc-cid10']) };

function validar(configuracao: unknown) {
  return validarConfiguracaoRegra(configuracao, contexto);
}

function campos(configuracao: unknown): string[] {
  const resultado = validar(configuracao);
  return resultado.valida ? [] : resultado.erros.map((e) => e.campo);
}

const validade = (condicoes: unknown[], extra: Record<string, unknown> = {}) => ({
  dimensao: 'VALIDADE',
  combinador: 'E',
  condicoes,
  ...extra,
});

describe('validarConfiguracaoRegra (RF002, CT002)', () => {
  describe('configurações válidas', () => {
    it.each([
      [
        'unicidade com chave composta e remoção',
        {
          dimensao: 'UNICIDADE',
          colunas: [
            { nome: 'cpf_ficticio', tipo: 'TEXTO' },
            { nome: 'data', tipo: 'DATA' },
          ],
          acao: { tipo: 'REMOVER_REPETICOES' },
        },
      ],
      [
        'completude com marcador e preenchimento',
        {
          dimensao: 'COMPLETUDE',
          colunas: [{ nome: 'sexo', tipo: 'TEXTO' }],
          marcadoresAusencia: ['ignorado', 'IGN'],
          acao: { tipo: 'PREENCHER_VAZIO', coluna: 'sexo', valor: 'NAO_INFORMADO' },
        },
      ],
      [
        'validade por faixa numérica',
        validade([
          { coluna: 'idade', tipo: 'DECIMAL', operador: 'MAIOR_IGUAL', valor: '0' },
          { coluna: 'idade', tipo: 'DECIMAL', operador: 'MENOR_IGUAL', valor: 130 },
        ]),
      ],
      [
        'validade por lista com conversão de caixa',
        validade([{ coluna: 'uf', tipo: 'TEXTO', operador: 'PERTENCE_LISTA', valores: ['SE', 'AL'] }], {
          acao: { tipo: 'CONVERTER_CAIXA', coluna: 'uf', caixa: 'MAIUSCULAS' },
        }),
      ],
      [
        'validade por vocabulário com aparar espaços',
        validade(
          [{ coluna: 'cid', tipo: 'TEXTO', operador: 'PERTENCE_VOCABULARIO', vocabularioId: 'voc-cid10' }],
          { acao: { tipo: 'APARAR_ESPACOS', coluna: 'cid' } },
        ),
      ],
      [
        'validade de data com OU',
        validade(
          [
            { coluna: 'dt', tipo: 'DATA', operador: 'VAZIO' },
            { coluna: 'dt', tipo: 'DATA', operador: 'MAIOR', valor: '2020-01-01' },
          ],
          { combinador: 'OU' },
        ),
      ],
    ])('aceita %s', (_caso, configuracao) => {
      expect(validar(configuracao)).toMatchObject({ valida: true });
    });

    it('normaliza constantes numéricas para texto', () => {
      const resultado = validar(
        validade([{ coluna: 'idade', tipo: 'DECIMAL', operador: 'MENOR', valor: 130 }]),
      );
      expect(
        resultado.valida && (resultado.configuracao as { condicoes: { valor: string }[] }).condicoes[0].valor,
      ).toBe('130');
    });
  });

  describe('rejeições apontando o campo', () => {
    it('rejeita dimensão fora das três previstas (RN01)', () => {
      expect(campos({ dimensao: 'CONSISTENCIA', colunas: [] })).toEqual(['dimensao']);
      expect(campos(null)).toEqual(['configuracao']);
    });

    it('rejeita mais de cinco condições', () => {
      const seis = Array.from({ length: 6 }, () => ({ coluna: 'a', tipo: 'TEXTO', operador: 'NAO_VAZIO' }));
      expect(campos(validade(seis))).toContain('condicoes');
    });

    it('rejeita combinador ausente ou misto', () => {
      expect(
        campos({ dimensao: 'VALIDADE', condicoes: [{ coluna: 'a', tipo: 'TEXTO', operador: 'NAO_VAZIO' }] }),
      ).toEqual(['combinador']);
      expect(
        campos(validade([{ coluna: 'a', tipo: 'TEXTO', operador: 'NAO_VAZIO' }], { combinador: 'E_OU' })),
      ).toEqual(['combinador']);
    });

    it.each([
      [
        'operador fora do catálogo',
        { coluna: 'a', tipo: 'TEXTO', operador: 'REGEX', valor: '.*' },
        'condicoes[0].operador',
      ],
      [
        'operador incompatível com o tipo',
        { coluna: 'a', tipo: 'TEXTO', operador: 'MAIOR', valor: '1' },
        'condicoes[0].operador',
      ],
      [
        'lista em número',
        { coluna: 'a', tipo: 'DECIMAL', operador: 'PERTENCE_LISTA', valores: ['1'] },
        'condicoes[0].operador',
      ],
      [
        'condição incompleta (sem valor)',
        { coluna: 'a', tipo: 'DECIMAL', operador: 'IGUAL' },
        'condicoes[0].valor',
      ],
      [
        'constante incompatível com decimal',
        { coluna: 'a', tipo: 'DECIMAL', operador: 'IGUAL', valor: '1,5' },
        'condicoes[0].valor',
      ],
      [
        'constante incompatível com data',
        { coluna: 'a', tipo: 'DATA', operador: 'MAIOR', valor: '31/12/2025' },
        'condicoes[0].valor',
      ],
      [
        'tipo não previsto',
        { coluna: 'a', tipo: 'INTEIRO', operador: 'IGUAL', valor: '1' },
        'condicoes[0].tipo',
      ],
      ['coluna ausente', { tipo: 'TEXTO', operador: 'NAO_VAZIO' }, 'condicoes[0].coluna'],
      [
        'lista vazia',
        { coluna: 'a', tipo: 'TEXTO', operador: 'PERTENCE_LISTA', valores: [] },
        'condicoes[0].valores',
      ],
      [
        'valor em operador sem parâmetro',
        { coluna: 'a', tipo: 'TEXTO', operador: 'VAZIO', valor: 'x' },
        'condicoes[0]',
      ],
      [
        'vocabulário sem versão selecionada',
        { coluna: 'a', tipo: 'TEXTO', operador: 'PERTENCE_VOCABULARIO' },
        'condicoes[0].vocabularioId',
      ],
      [
        'vocabulário indisponível',
        { coluna: 'a', tipo: 'TEXTO', operador: 'PERTENCE_VOCABULARIO', vocabularioId: 'tuss' },
        'condicoes[0].vocabularioId',
      ],
      [
        'campo de script',
        { coluna: 'a', tipo: 'TEXTO', operador: 'NAO_VAZIO', script: 'process.exit()' },
        'condicoes[0].script',
      ],
      [
        'comparação entre colunas',
        { coluna: 'a', tipo: 'DECIMAL', operador: 'MAIOR', colunaComparada: 'b' },
        'condicoes[0].colunaComparada',
      ],
    ])('rejeita %s', (_caso, condicao, campo) => {
      expect(campos(validade([condicao]))).toContain(campo);
    });

    it('rejeita tipos diferentes para a mesma coluna na regra', () => {
      expect(
        campos(
          validade([
            { coluna: 'a', tipo: 'TEXTO', operador: 'NAO_VAZIO' },
            { coluna: 'a', tipo: 'DECIMAL', operador: 'MAIOR', valor: '1' },
          ]),
        ),
      ).toContain('condicoes[1].tipo');
    });

    it('rejeita campos fora do esquema no nível da regra (ex.: SQL)', () => {
      expect(
        campos({ dimensao: 'UNICIDADE', colunas: [{ nome: 'a', tipo: 'TEXTO' }], sql: 'SELECT 1' }),
      ).toEqual(['sql']);
    });

    it.each([
      ['completude sem colunas', { dimensao: 'COMPLETUDE', colunas: [] }, 'colunas'],
      [
        'completude com mais de cinco colunas',
        {
          dimensao: 'COMPLETUDE',
          colunas: Array.from({ length: 6 }, (_, i) => ({ nome: `c${i}`, tipo: 'TEXTO' })),
        },
        'colunas',
      ],
      [
        'coluna repetida na chave',
        {
          dimensao: 'UNICIDADE',
          colunas: [
            { nome: 'a', tipo: 'TEXTO' },
            { nome: 'a', tipo: 'TEXTO' },
          ],
        },
        'colunas[1].nome',
      ],
      [
        'marcador vazio',
        { dimensao: 'COMPLETUDE', colunas: [{ nome: 'a', tipo: 'TEXTO' }], marcadoresAusencia: [' '] },
        'marcadoresAusencia',
      ],
    ])('rejeita %s', (_caso, configuracao, campo) => {
      expect(campos(configuracao)).toContain(campo);
    });
  });

  describe('ações', () => {
    const completude = (acao: unknown, extra: Record<string, unknown> = {}) => ({
      dimensao: 'COMPLETUDE',
      colunas: [
        { nome: 'nome', tipo: 'TEXTO' },
        { nome: 'idade', tipo: 'DECIMAL' },
      ],
      acao,
      ...extra,
    });

    it.each([
      ['ação fora do catálogo', { tipo: 'CORRIGIR_MANUALMENTE', coluna: 'nome' }, 'acao.tipo'],
      ['remoção de repetições fora da unicidade', { tipo: 'REMOVER_REPETICOES' }, 'acao.tipo'],
      ['coluna fora da regra', { tipo: 'APARAR_ESPACOS', coluna: 'outra' }, 'acao.coluna'],
      ['aparar em coluna numérica', { tipo: 'APARAR_ESPACOS', coluna: 'idade' }, 'acao.coluna'],
      ['caixa sem sentido', { tipo: 'CONVERTER_CAIXA', coluna: 'nome' }, 'acao.caixa'],
      ['preenchimento sem literal', { tipo: 'PREENCHER_VAZIO', coluna: 'nome' }, 'acao.valor'],
      [
        'literal incompatível com o tipo',
        { tipo: 'PREENCHER_VAZIO', coluna: 'idade', valor: 'zero' },
        'acao.valor',
      ],
      ['parâmetro extra', { tipo: 'APARAR_ESPACOS', coluna: 'nome', valor: 'x' }, 'acao.valor'],
    ])('rejeita %s', (_caso, acao, campo) => {
      expect(campos(completude(acao))).toContain(campo);
    });

    it('rejeita literal igual a um marcador de ausência', () => {
      expect(
        campos(
          completude(
            { tipo: 'PREENCHER_VAZIO', coluna: 'nome', valor: 'ignorado' },
            { marcadoresAusencia: ['ignorado'] },
          ),
        ),
      ).toContain('acao.valor');
    });

    it('aceita preenchimento numérico compatível', () => {
      expect(validar(completude({ tipo: 'PREENCHER_VAZIO', coluna: 'idade', valor: '0' })).valida).toBe(true);
    });

    it('rejeita parâmetros na remoção de repetições', () => {
      expect(
        campos({
          dimensao: 'UNICIDADE',
          colunas: [{ nome: 'a', tipo: 'TEXTO' }],
          acao: { tipo: 'REMOVER_REPETICOES', coluna: 'a' },
        }),
      ).toEqual(['acao']);
    });
  });
});

describe('validarConjunto (UC-02, fluxo 6b)', () => {
  const regra = (nome: string, configuracao: Partial<ConfiguracaoRegra>, regraId = nome) => ({
    regraId,
    nome,
    configuracao: configuracao as ConfiguracaoRegra,
  });
  const aparar = (coluna: string) => ({
    dimensao: DimensaoQualidade.COMPLETUDE,
    colunas: [{ nome: coluna, tipo: 'TEXTO' }],
    acao: { tipo: 'APARAR_ESPACOS', coluna },
  });

  it('aceita regras coerentes', () => {
    expect(validarConjunto([regra('a', aparar('x') as never), regra('b', aparar('y') as never)])).toEqual([]);
  });

  it('rejeita duas ações de escrita na mesma coluna', () => {
    const erros = validarConjunto([regra('a', aparar('x') as never), regra('b', aparar('x') as never)]);
    expect(erros[0].mensagem).toContain('Duas ações de escrita');
  });

  it('rejeita nome de regra duplicado no conjunto, sem diferenciar caixa', () => {
    const erros = validarConjunto([
      regra('Sexo', aparar('x') as never, '1'),
      regra(' sexo ', aparar('y') as never, '2'),
    ]);
    expect(erros[0].mensagem).toContain('Nome de regra duplicado');
  });

  it('rejeita a mesma coluna com tipos diferentes', () => {
    const erros = validarConjunto([
      regra('a', { dimensao: DimensaoQualidade.UNICIDADE, colunas: [{ nome: 'x', tipo: 'TEXTO' }] } as never),
      regra('b', {
        dimensao: DimensaoQualidade.COMPLETUDE,
        colunas: [{ nome: 'x', tipo: 'DECIMAL' }],
      } as never),
    ]);
    expect(erros[0].mensagem).toContain('declarada como TEXTO');
  });

  it('não considera a remoção de repetições como escrita em coluna', () => {
    const unicidade = {
      dimensao: DimensaoQualidade.UNICIDADE,
      colunas: [{ nome: 'x', tipo: 'TEXTO' }],
      acao: { tipo: 'REMOVER_REPETICOES' },
    };
    expect(validarConjunto([regra('a', unicidade as never), regra('b', aparar('x') as never)])).toEqual([]);
  });
});

describe('verificarColunas', () => {
  it('aponta colunas inexistentes no cabeçalho', () => {
    const regras = [
      {
        nome: 'r1',
        configuracao: { dimensao: DimensaoQualidade.UNICIDADE, colunas: [{ nome: 'id', tipo: 'TEXTO' }] },
      },
      {
        nome: 'r2',
        configuracao: { dimensao: DimensaoQualidade.COMPLETUDE, colunas: [{ nome: 'sexo', tipo: 'TEXTO' }] },
      },
    ] as never;
    expect(verificarColunas(regras, ['id', 'nome'])).toEqual([
      { campo: 'r2', mensagem: 'Coluna "sexo" inexistente no dataset.' },
    ]);
  });
});
