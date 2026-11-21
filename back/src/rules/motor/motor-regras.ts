import { converter, estaVazio } from './conversao';
import { REGISTRO_ACOES } from './registro-acoes';
import { obterOperador, ParametrosAvaliacao } from './registro-operadores';
import { Combinador, DimensaoQualidade, RegraExecutavel, TipoAcao } from './tipos';

/** Resultado da avaliação de uma regra (ResultadoRegra, MOD-06). Linhas numeradas a partir de 1. */
export interface ResultadoAvaliacaoRegra {
  regraId: string;
  revisao: number;
  nome: string;
  dimensao: DimensaoQualidade;
  ordem: number;
  totalAvaliados: number;
  linhasVioladas: number[];
}

export enum TipoAlteracao {
  ATUALIZACAO = 'ATUALIZACAO',
  REMOCAO = 'REMOCAO',
}

/** Detalhe de uma alteração (AlteracaoRegistro, MOD-08), vinculado à ação de origem. */
export interface Alteracao {
  linha: number;
  tipo: TipoAlteracao;
  regraId: string;
  regraRevisao: number;
  acao: TipoAcao;
  coluna: string | null;
  valorAnterior: string | null;
  valorNovo: string | null;
  linhaRepresentante: number | null;
}

export interface ResultadoAcoes {
  registros: string[][];
  alteracoes: Alteracao[];
  linhasAlteradas: number[];
  linhasRemovidas: number[];
  totalLinhasAfetadas: number;
}

export interface LinhaPrevia {
  linha: number;
  tipo: TipoAlteracao;
  antes: Record<string, string>;
  depois: Record<string, string> | null;
  acoes: { regraId: string; acao: TipoAcao; coluna: string | null }[];
}

export const LIMITE_PREVIA = 20;

export class ErroMotor extends Error {}

function indiceColuna(colunas: readonly string[], nome: string): number {
  const indice = colunas.indexOf(nome);
  if (indice < 0) {
    throw new ErroMotor(`Coluna "${nome}" inexistente no dataset.`);
  }
  return indice;
}

type Verificador = (registro: string[]) => boolean;

/** Compila uma regra em uma função que diz se a linha é aprovada. */
function compilarAprovacao(
  regra: RegraExecutavel,
  colunas: readonly string[],
  vocabularios: ReadonlyMap<string, ReadonlySet<string>>,
): Verificador | null {
  const configuracao = regra.configuracao;
  switch (configuracao.dimensao) {
    case DimensaoQualidade.UNICIDADE:
      return null;
    case DimensaoQualidade.COMPLETUDE: {
      const indices = configuracao.colunas.map((c) => indiceColuna(colunas, c.nome));
      const marcadores = new Set((configuracao.marcadoresAusencia ?? []).map((m) => m.trim()));
      return (registro) =>
        indices.every((i) => !estaVazio(registro[i]) && !marcadores.has(registro[i].trim()));
    }
    case DimensaoQualidade.VALIDADE: {
      const verificadores = configuracao.condicoes.map((condicao) => {
        const operador = obterOperador(condicao.operador);
        if (!operador) {
          throw new ErroMotor(`Operador "${condicao.operador}" fora do catálogo.`);
        }
        const indice = indiceColuna(colunas, condicao.coluna);
        const parametros: ParametrosAvaliacao = {};
        if (condicao.valor !== undefined) {
          const convertido = converter(condicao.valor, condicao.tipo);
          if (!convertido.ok) {
            throw new ErroMotor(`Constante incompatível com o tipo na regra "${regra.nome}".`);
          }
          parametros.constante = convertido.valor;
        }
        if (condicao.valores) {
          parametros.lista = new Set(condicao.valores);
        }
        if (condicao.vocabularioId) {
          const codigos = vocabularios.get(condicao.vocabularioId);
          if (!codigos) {
            // RN02: vocabulário ausente bloqueia a regra; não se atribui validade sem executá-la.
            throw new ErroMotor(`Vocabulário indisponível para a regra "${regra.nome}".`);
          }
          parametros.vocabulario = codigos;
        }
        return (registro: string[]) => operador.avaliar(registro[indice] ?? '', condicao.tipo, parametros);
      });
      return configuracao.combinador === Combinador.OU
        ? (registro) => verificadores.some((v) => v(registro))
        : (registro) => verificadores.every((v) => v(registro));
    }
  }
}

/**
 * Chave de unicidade em texto. Chaves com alguma coluna vazia não participam da unicidade:
 * a ausência é tratada pela completude, quando houver regra configurada (P1, seção 8.3).
 */
function chaveDe(registro: string[], indices: number[]): string | null {
  const partes = indices.map((i) => registro[i] ?? '');
  return partes.some((p) => estaVazio(p)) ? null : JSON.stringify(partes);
}

/**
 * avaliar(registros, regras): unicidade em uma passagem com tabela hash (a primeira ocorrência
 * na ordem original representa a chave; cada repetição posterior é violação); completude e
 * validade avaliadas por linha (ADR-002). Os registros não são alterados.
 */
export function avaliar(
  colunas: readonly string[],
  registros: readonly string[][],
  regras: readonly RegraExecutavel[],
  vocabularios: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): ResultadoAvaliacaoRegra[] {
  return [...regras]
    .sort((a, b) => a.ordem - b.ordem)
    .map((regra) => {
      const linhasVioladas: number[] = [];
      const configuracao = regra.configuracao;
      if (configuracao.dimensao === DimensaoQualidade.UNICIDADE) {
        const indices = configuracao.colunas.map((c) => indiceColuna(colunas, c.nome));
        const vistas = new Set<string>();
        registros.forEach((registro, i) => {
          const chave = chaveDe(registro, indices);
          if (chave === null) {
            return;
          }
          if (vistas.has(chave)) {
            linhasVioladas.push(i + 1);
          } else {
            vistas.add(chave);
          }
        });
      } else {
        const aprova = compilarAprovacao(regra, colunas, vocabularios)!;
        registros.forEach((registro, i) => {
          if (!aprova(registro)) {
            linhasVioladas.push(i + 1);
          }
        });
      }
      return {
        regraId: regra.regraId,
        revisao: regra.revisao,
        nome: regra.nome,
        dimensao: configuracao.dimensao,
        ordem: regra.ordem,
        totalAvaliados: registros.length,
        linhasVioladas,
      };
    });
}

/**
 * aplicarAcoes(registros, ações ordenadas): opera sobre uma cópia. As ações de normalização
 * seguem a ordem do conjunto; a remoção de repetições ocorre depois de todas elas, sobre os
 * valores já normalizados. Nenhum valor é inferido. Cada linha conta uma vez no total.
 */
export function aplicarAcoes(
  colunas: readonly string[],
  registros: readonly string[][],
  regras: readonly RegraExecutavel[],
): ResultadoAcoes {
  const copia = registros.map((r) => [...r]);
  const alteracoes: Alteracao[] = [];
  const ordenadas = [...regras].sort((a, b) => a.ordem - b.ordem).filter((r) => r.configuracao.acao);
  const normalizacoes = ordenadas.filter((r) => r.configuracao.acao!.tipo !== TipoAcao.REMOVER_REPETICOES);
  const remocoes = ordenadas.filter((r) => r.configuracao.acao!.tipo === TipoAcao.REMOVER_REPETICOES);
  const atualizadas = new Set<number>();

  for (const regra of normalizacoes) {
    const acao = regra.configuracao.acao!;
    const definicao = REGISTRO_ACOES[acao.tipo];
    const indice = indiceColuna(colunas, acao.coluna!);
    copia.forEach((registro, i) => {
      const anterior = registro[indice] ?? '';
      const novo = definicao.transformar!(anterior, acao);
      if (novo !== anterior) {
        registro[indice] = novo;
        atualizadas.add(i + 1);
        alteracoes.push({
          linha: i + 1,
          tipo: TipoAlteracao.ATUALIZACAO,
          regraId: regra.regraId,
          regraRevisao: regra.revisao,
          acao: acao.tipo,
          coluna: acao.coluna!,
          valorAnterior: anterior,
          valorNovo: novo,
          linhaRepresentante: null,
        });
      }
    });
  }

  const removidas = new Set<number>();
  for (const regra of remocoes) {
    if (regra.configuracao.dimensao !== DimensaoQualidade.UNICIDADE) {
      continue;
    }
    const indices = regra.configuracao.colunas.map((c) => indiceColuna(colunas, c.nome));
    const representantes = new Map<string, number>();
    copia.forEach((registro, i) => {
      const linha = i + 1;
      if (removidas.has(linha)) {
        return;
      }
      const chave = chaveDe(registro, indices);
      if (chave === null) {
        return;
      }
      const representante = representantes.get(chave);
      if (representante === undefined) {
        representantes.set(chave, linha);
        return;
      }
      removidas.add(linha);
      alteracoes.push({
        linha,
        tipo: TipoAlteracao.REMOCAO,
        regraId: regra.regraId,
        regraRevisao: regra.revisao,
        acao: TipoAcao.REMOVER_REPETICOES,
        coluna: null,
        valorAnterior: null,
        valorNovo: null,
        linhaRepresentante: representante,
      });
    });
  }

  const linhasRemovidas = [...removidas].sort((a, b) => a - b);
  const linhasAlteradas = [...atualizadas].filter((l) => !removidas.has(l)).sort((a, b) => a - b);
  return {
    registros: copia.filter((_r, i) => !removidas.has(i + 1)),
    alteracoes,
    linhasAlteradas,
    linhasRemovidas,
    totalLinhasAfetadas: linhasAlteradas.length + linhasRemovidas.length,
  };
}

/** preverAcoes(registros, ações): aplica sobre cópia e monta a prévia de até 20 linhas antes/depois. */
export function preverAcoes(
  colunas: readonly string[],
  registros: readonly string[][],
  regras: readonly RegraExecutavel[],
  limite = LIMITE_PREVIA,
): { resultado: ResultadoAcoes; previa: LinhaPrevia[] } {
  const resultado = aplicarAcoes(colunas, registros, regras);
  const porLinha = new Map<number, Alteracao[]>();
  for (const alteracao of resultado.alteracoes) {
    porLinha.set(alteracao.linha, [...(porLinha.get(alteracao.linha) ?? []), alteracao]);
  }
  const removidas = new Set(resultado.linhasRemovidas);
  const previa = [...porLinha.keys()]
    .sort((a, b) => a - b)
    .slice(0, limite)
    .map((linha) => {
      const doRegistro = porLinha.get(linha)!;
      const original = registros[linha - 1];
      const colunasTocadas = new Set(doRegistro.map((a) => a.coluna).filter((c): c is string => c !== null));
      const remocao = doRegistro.find((a) => a.tipo === TipoAlteracao.REMOCAO);
      if (remocao) {
        const regra = regras.find((r) => r.regraId === remocao.regraId)!;
        for (const c of regra.configuracao.dimensao === DimensaoQualidade.UNICIDADE
          ? regra.configuracao.colunas
          : []) {
          colunasTocadas.add(c.nome);
        }
      }
      const antes = Object.fromEntries([...colunasTocadas].map((c) => [c, original[colunas.indexOf(c)]]));
      let depois: Record<string, string> | null = null;
      if (!removidas.has(linha)) {
        const valores = { ...antes };
        for (const a of doRegistro) {
          if (a.coluna) {
            valores[a.coluna] = a.valorNovo ?? '';
          }
        }
        depois = valores;
      }
      return {
        linha,
        tipo: removidas.has(linha) ? TipoAlteracao.REMOCAO : TipoAlteracao.ATUALIZACAO,
        antes,
        depois,
        acoes: doRegistro.map((a) => ({ regraId: a.regraId, acao: a.acao, coluna: a.coluna })),
      };
    });
  return { resultado, previa };
}
