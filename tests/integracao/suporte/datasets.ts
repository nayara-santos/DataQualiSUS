import { createHash } from "crypto";
import { ClienteApi, ContextoTeste } from "./aplicacao";

export function sha256(conteudo: Buffer): string {
  return createHash("sha256").update(conteudo).digest("hex");
}

export async function importarCsv(
  cliente: ClienteApi,
  conteudo: Buffer | string,
  opcoes: {
    nome?: string;
    arquivo?: string;
    separador?: "VIRGULA" | "PONTO_E_VIRGULA";
    descricao?: string;
  } = {},
) {
  const requisicao = cliente
    .post("/api/datasets")
    .field("nome", opcoes.nome ?? "Base de teste")
    .attach(
      "arquivo",
      Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo),
      opcoes.arquivo ?? "base.csv",
    );
  if (opcoes.separador) {
    requisicao.field("separador", opcoes.separador);
  }
  if (opcoes.descricao !== undefined) {
    requisicao.field("descricao", opcoes.descricao);
  }
  return requisicao;
}

export async function contarPersistencia(
  contexto: ContextoTeste,
): Promise<{ datasets: number; versoes: number }> {
  const [linha] = await contexto.banco.consultar<{
    datasets: string;
    versoes: string;
  }>(
    "SELECT (SELECT count(*) FROM dataset) AS datasets, (SELECT count(*) FROM versao_dataset) AS versoes",
  );
  return { datasets: Number(linha.datasets), versoes: Number(linha.versoes) };
}

/** Gera um CSV com exatamente o tamanho em bytes pedido (uma coluna de texto). */
export function csvComTamanho(tamanho: number): Buffer {
  const cabecalho = "texto\n";
  const linha = "x".repeat(99) + "\n";
  const linhas = Math.floor((tamanho - cabecalho.length) / linha.length);
  const resto = tamanho - cabecalho.length - linhas * linha.length;
  return Buffer.from(
    cabecalho + linha.repeat(linhas - 1) + "x".repeat(99 + resto) + "\n",
  );
}
