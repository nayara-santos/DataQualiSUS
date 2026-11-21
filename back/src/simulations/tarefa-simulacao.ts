import { readFile } from 'fs/promises';
import { calcularSha256 } from '../datasets/armazenamento-arquivos.service';
import { lerCsv } from '../datasets/leitor-csv';
import { Separador } from '../datasets/limites-csv';
import { avaliar, LinhaPrevia, preverAcoes, ResultadoAvaliacaoRegra } from '../rules/motor/motor-regras';
import { RegraExecutavel } from '../rules/motor/tipos';

export interface DadosTarefaSimulacao {
  caminhoArquivo: string;
  hashEsperado: string;
  separador: Separador;
  colunasEsperadas: string[];
  regras: RegraExecutavel[];
  vocabularios: Record<string, string[]>;
}

export interface ResultadoTarefaSimulacao {
  hashConferido: string;
  totalLinhas: number;
  resultados: ResultadoAvaliacaoRegra[];
  totalLinhasComViolacao: number;
  totalPrevistoAlteradas: number;
  totalPrevistoRemovidas: number;
  linhasPrevistasPorRegra: Record<string, number>;
  previa: LinhaPrevia[];
}

export class ErroTarefaSimulacao extends Error {}

/**
 * Corpo da simulação executado dentro do worker (ADR-008): confere o SHA-256 da versão, lê os
 * registros, avalia as regras e prevê as ações do catálogo sem gravar nada (RF003, RN04).
 */
export async function executarTarefaSimulacao(
  dados: DadosTarefaSimulacao,
): Promise<ResultadoTarefaSimulacao> {
  const conteudo = await readFile(dados.caminhoArquivo);
  const hash = calcularSha256(conteudo);
  if (hash !== dados.hashEsperado) {
    throw new ErroTarefaSimulacao('A integridade do arquivo da versão não confere com o SHA-256 registrado.');
  }
  const { colunas, registros } = await lerCsv(conteudo, dados.separador);
  if (JSON.stringify(colunas) !== JSON.stringify(dados.colunasEsperadas)) {
    throw new ErroTarefaSimulacao('O cabeçalho do arquivo difere do registrado para a versão.');
  }
  const vocabularios = new Map(
    Object.entries(dados.vocabularios).map(([id, codigos]) => [id, new Set(codigos)]),
  );
  const resultados = avaliar(colunas, registros, dados.regras, vocabularios);
  const { resultado, previa } = preverAcoes(colunas, registros, dados.regras);
  const comViolacao = new Set<number>();
  for (const r of resultados) {
    for (const linha of r.linhasVioladas) {
      comViolacao.add(linha);
    }
  }
  const linhasPrevistasPorRegra: Record<string, number> = {};
  for (const regra of dados.regras) {
    linhasPrevistasPorRegra[regra.regraId] = new Set(
      resultado.alteracoes.filter((a) => a.regraId === regra.regraId).map((a) => a.linha),
    ).size;
  }
  return {
    hashConferido: hash,
    totalLinhas: registros.length,
    resultados,
    totalLinhasComViolacao: comViolacao.size,
    totalPrevistoAlteradas: resultado.linhasAlteradas.length,
    totalPrevistoRemovidas: resultado.linhasRemovidas.length,
    linhasPrevistasPorRegra,
    previa,
  };
}
