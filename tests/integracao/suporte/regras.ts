import { ClienteApi } from "./aplicacao";

export async function criarRegra(
  cliente: ClienteApi,
  nome: string,
  configuracao: unknown,
): Promise<string> {
  const resposta = await cliente
    .post("/api/regras")
    .send({ nome, configuracao });
  if (resposta.status !== 201) {
    throw new Error(
      `Falha ao criar regra ${nome}: ${resposta.status} ${JSON.stringify(resposta.body)}`,
    );
  }
  return resposta.body.id;
}

export async function criarConjunto(
  cliente: ClienteApi,
  nome: string,
  regras: string[],
): Promise<string> {
  const resposta = await cliente.post("/api/conjuntos").send({ nome, regras });
  if (resposta.status !== 201) {
    throw new Error(
      `Falha ao criar conjunto ${nome}: ${resposta.status} ${JSON.stringify(resposta.body)}`,
    );
  }
  return resposta.body.id;
}
