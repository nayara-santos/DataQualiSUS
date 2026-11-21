import { REGISTRO_ACOES } from './motor/registro-acoes';
import { REGISTRO_OPERADORES } from './motor/registro-operadores';
import { DimensaoQualidade, TipoColuna } from './motor/tipos';
import { LIMITE_CONDICOES } from './motor/validacao-configuracao';

/** Catálogo publicado para a interface montar a configuração visual (T03) sem listas fixas. */
export function descreverCatalogo() {
  return {
    dimensoes: Object.values(DimensaoQualidade),
    tiposColuna: Object.values(TipoColuna),
    combinadores: ['E', 'OU'],
    limiteCondicoes: LIMITE_CONDICOES,
    operadores: Object.values(REGISTRO_OPERADORES).map((o) => ({
      codigo: o.codigo,
      rotulo: o.rotulo,
      tipos: o.tipos,
      parametro: o.parametro,
    })),
    acoes: Object.values(REGISTRO_ACOES).map((a) => ({
      tipo: a.tipo,
      rotulo: a.rotulo,
      dimensoes: a.dimensoes,
      tiposColuna: a.tiposColuna,
    })),
  };
}
