import { estaVazio, converter } from './conversao';
import { TipoColuna } from './tipos';

/** Forma do parâmetro exigido por um operador. */
export type ParametroOperador = 'NENHUM' | 'CONSTANTE' | 'LISTA' | 'VOCABULARIO';

export interface ParametrosAvaliacao {
  constante?: string | number;
  lista?: ReadonlySet<string>;
  vocabulario?: ReadonlySet<string>;
}

export interface DefinicaoOperador {
  codigo: string;
  rotulo: string;
  tipos: readonly TipoColuna[];
  parametro: ParametroOperador;
  /**
   * Avalia a condição para um valor bruto do CSV. Campo vazio falha em todas as comparações,
   * exceto "está vazio"; valor não convertível ao tipo declarado falha (violação de validade).
   */
  avaliar(valor: string, tipo: TipoColuna, parametros: ParametrosAvaliacao): boolean;
}

const TODOS_OS_TIPOS = [TipoColuna.TEXTO, TipoColuna.DECIMAL, TipoColuna.DATA] as const;
const ORDENAVEIS = [TipoColuna.DECIMAL, TipoColuna.DATA] as const;

function comparar(
  comparacao: (a: string | number, b: string | number) => boolean,
): DefinicaoOperador['avaliar'] {
  return (valor, tipo, parametros) => {
    if (estaVazio(valor) || parametros.constante === undefined) {
      return false;
    }
    const convertido = converter(valor, tipo);
    return convertido.ok && comparacao(convertido.valor, parametros.constante);
  };
}

/**
 * Registro extensível de operadores (ADR-002). Um novo operador é acrescentado somente aqui
 * (RNF006/CTN006); o motor e a validação de configuração consultam este registro.
 */
export const REGISTRO_OPERADORES: Readonly<Record<string, DefinicaoOperador>> = {
  IGUAL: {
    codigo: 'IGUAL',
    rotulo: 'igual a',
    tipos: TODOS_OS_TIPOS,
    parametro: 'CONSTANTE',
    avaliar: comparar((a, b) => a === b),
  },
  DIFERENTE: {
    codigo: 'DIFERENTE',
    rotulo: 'diferente de',
    tipos: TODOS_OS_TIPOS,
    parametro: 'CONSTANTE',
    avaliar: comparar((a, b) => a !== b),
  },
  VAZIO: {
    codigo: 'VAZIO',
    rotulo: 'está vazio',
    tipos: TODOS_OS_TIPOS,
    parametro: 'NENHUM',
    avaliar: (valor) => estaVazio(valor),
  },
  NAO_VAZIO: {
    codigo: 'NAO_VAZIO',
    rotulo: 'não está vazio',
    tipos: TODOS_OS_TIPOS,
    parametro: 'NENHUM',
    avaliar: (valor, tipo) => !estaVazio(valor) && converter(valor, tipo).ok,
  },
  PERTENCE_LISTA: {
    codigo: 'PERTENCE_LISTA',
    rotulo: 'pertence à lista',
    tipos: [TipoColuna.TEXTO],
    parametro: 'LISTA',
    avaliar: (valor, _tipo, parametros) => !estaVazio(valor) && (parametros.lista?.has(valor) ?? false),
  },
  PERTENCE_VOCABULARIO: {
    codigo: 'PERTENCE_VOCABULARIO',
    rotulo: 'pertence ao vocabulário oficial',
    tipos: [TipoColuna.TEXTO],
    parametro: 'VOCABULARIO',
    avaliar: (valor, _tipo, parametros) => !estaVazio(valor) && (parametros.vocabulario?.has(valor) ?? false),
  },
  MAIOR: {
    codigo: 'MAIOR',
    rotulo: 'maior que',
    tipos: ORDENAVEIS,
    parametro: 'CONSTANTE',
    avaliar: comparar((a, b) => a > b),
  },
  MAIOR_IGUAL: {
    codigo: 'MAIOR_IGUAL',
    rotulo: 'maior ou igual a',
    tipos: ORDENAVEIS,
    parametro: 'CONSTANTE',
    avaliar: comparar((a, b) => a >= b),
  },
  MENOR: {
    codigo: 'MENOR',
    rotulo: 'menor que',
    tipos: ORDENAVEIS,
    parametro: 'CONSTANTE',
    avaliar: comparar((a, b) => a < b),
  },
  MENOR_IGUAL: {
    codigo: 'MENOR_IGUAL',
    rotulo: 'menor ou igual a',
    tipos: ORDENAVEIS,
    parametro: 'CONSTANTE',
    avaliar: comparar((a, b) => a <= b),
  },
};

export function obterOperador(codigo: string): DefinicaoOperador | undefined {
  return Object.prototype.hasOwnProperty.call(REGISTRO_OPERADORES, codigo)
    ? REGISTRO_OPERADORES[codigo]
    : undefined;
}
