import { readFileSync } from "fs";
import * as path from "path";
import { ClienteApi } from "./aplicacao";
import { importarCsv } from "./datasets";
import { criarConjunto, criarRegra } from "./regras";

export interface Gabarito {
  arquivo: string;
  separador: "VIRGULA" | "PONTO_E_VIRGULA";
  totalLinhas: number;
  regras: {
    chave: string;
    nome: string;
    configuracao: Record<string, unknown>;
  }[];
  violacoesEsperadas: Record<string, number[]>;
  totalLinhasComViolacao: number;
  tratamento: { alteradas: number[]; removidas: number[] };
  indicadores: Record<
    string,
    {
      situacao: string;
      numerador: number | null;
      denominador: number | null;
      percentual: number | null;
    }
  >;
  cobertura: number;
}

const DIRETORIO_CSV = path.resolve(__dirname, "..", "..", "fixtures", "csv");

export function carregarGabarito(nome: string): Gabarito {
  return JSON.parse(
    readFileSync(path.join(DIRETORIO_CSV, `${nome}.gabarito.json`), "utf8"),
  ) as Gabarito;
}

export function lerFixture(arquivo: string): Buffer {
  return readFileSync(path.join(DIRETORIO_CSV, arquivo));
}

export interface Cenario {
  datasetId: string;
  versaoId: string;
  conjuntoId: string;
  regras: Map<string, string>;
  conteudo: Buffer;
}

/** Importa o CSV, cria as regras do gabarito, o conjunto e a associação — somente pela API. */
export async function montarCenario(
  cliente: ClienteApi,
  gabarito: Gabarito,
  vocabularioId?: string,
): Promise<Cenario> {
  const conteudo = lerFixture(gabarito.arquivo);
  const importado = await importarCsv(cliente, conteudo, {
    nome: gabarito.arquivo,
    arquivo: gabarito.arquivo,
    separador: gabarito.separador,
  });
  if (importado.status !== 201) {
    throw new Error(`Importação falhou: ${JSON.stringify(importado.body)}`);
  }
  const regras = new Map<string, string>();
  for (const regra of gabarito.regras) {
    const configuracao = JSON.parse(
      JSON.stringify(regra.configuracao).replace(
        /"\$CID10"/g,
        JSON.stringify(vocabularioId),
      ),
    );
    regras.set(
      regra.chave,
      await criarRegra(
        cliente,
        `${regra.nome} (${gabarito.arquivo})`,
        configuracao,
      ),
    );
  }
  const conjuntoId = await criarConjunto(
    cliente,
    `Conjunto ${gabarito.arquivo}`,
    [...regras.values()],
  );
  const associacao = await cliente.put(
    `/api/conjuntos/${conjuntoId}/datasets/${importado.body.id}`,
  );
  if (associacao.status !== 200) {
    throw new Error(`Associação falhou: ${JSON.stringify(associacao.body)}`);
  }
  return {
    datasetId: importado.body.id,
    versaoId: importado.body.versaoAtual.id,
    conjuntoId,
    regras,
    conteudo,
  };
}

/** Solicita a simulação e consulta o estado até sair de EM_EXECUCAO, como a SPA faria. */
export async function simularEAguardar(
  cliente: ClienteApi,
  versaoId: string,
  conjuntoId: string,
  limiteMs = 30_000,
) {
  const aceite = await cliente
    .post("/api/simulacoes")
    .send({ versaoId, conjuntoId });
  if (aceite.status !== 202) {
    throw new Error(
      `Simulação recusada: ${aceite.status} ${JSON.stringify(aceite.body)}`,
    );
  }
  const fim = Date.now() + limiteMs;
  for (;;) {
    const consulta = await cliente.get(`/api/simulacoes/${aceite.body.id}`);
    if (consulta.body.status !== "EM_EXECUCAO" || Date.now() > fim) {
      return { aceite: aceite.body, simulacao: consulta.body };
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Conjunto de pares "linha:regra" para comparar ocorrências exatas (um total pode ocultar erros). */
export function pares(violacoes: Record<string, number[]>): string[] {
  return Object.entries(violacoes)
    .flatMap(([regra, linhas]) => linhas.map((l) => `${l}:${regra}`))
    .sort();
}
