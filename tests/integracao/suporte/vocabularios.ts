import { readFile } from "fs/promises";
import * as path from "path";
import { VocabularioService } from "../../../back/src/rules/vocabularios/vocabulario.service";
import { ContextoTeste } from "./aplicacao";

export const ARQUIVO_CID10_AMOSTRA = path.resolve(
  __dirname,
  "..",
  "..",
  "fixtures",
  "vocabularios",
  "cid10-amostra-teste.csv",
);

/** Importa a amostra sintética de CID-10, como o script da equipe faria com o arquivo oficial. */
export async function importarCid10Amostra(
  contexto: ContextoTeste,
  versao = "amostra-teste-1",
) {
  return contexto.app
    .get(VocabularioService)
    .importar(await readFile(ARQUIVO_CID10_AMOSTRA), {
      nome: "CID-10",
      origem: "Amostra sintética de teste (não oficial)",
      versao,
      licenca: "Uso restrito aos testes acadêmicos",
    });
}
