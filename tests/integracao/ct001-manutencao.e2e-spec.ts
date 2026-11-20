/*
 * CT001 (manutenção) — RF001, RN04, ADR-005: listagem, consulta, metadados, nova versão e
 * exclusão lógica preservando histórico e original.
 */
import { readFile } from "fs/promises";
import * as path from "path";
import { PapelUsuario } from "../../back/src/auth/papel-usuario";
import {
  ClienteApi,
  ContextoTeste,
  criarAplicacao,
  criarContas,
} from "./suporte/aplicacao";
import { importarCsv, sha256 } from "./suporte/datasets";

describe("CT001 — manutenção de datasets", () => {
  let contexto: ContextoTeste;
  let analista: ClienteApi;
  const original = Buffer.from(
    "id,municipio,valor\n1,Aracaju,10\n2,Itabaiana,20\n3,Lagarto,30\n",
  );
  let datasetId: string;
  let versao1: string;

  beforeAll(async () => {
    contexto = await criarAplicacao();
    await criarContas(contexto);
    analista = await ClienteApi.autenticado(
      contexto.app,
      PapelUsuario.ANALISTA,
    );
    const resposta = await importarCsv(analista, original, {
      nome: "Municípios",
      descricao: "v1",
    });
    datasetId = resposta.body.id;
    versao1 = resposta.body.versaoAtual.id;
  });

  afterAll(() => contexto.encerrar());

  it("lista o dataset ativo e consulta seus metadados e versões", async () => {
    const lista = await analista.get("/api/datasets");
    expect(lista.status).toBe(200);
    expect(lista.body.map((d: { id: string }) => d.id)).toContain(datasetId);
    const detalhe = await analista.get(`/api/datasets/${datasetId}`);
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.versoes).toHaveLength(1);
  });

  it("consulta os registros da versão com paginação", async () => {
    const pagina = await analista.get(
      `/api/datasets/${datasetId}/versoes/${versao1}/registros?pagina=1&tamanho=2`,
    );
    expect(pagina.status).toBe(200);
    expect(pagina.body).toMatchObject({
      totalRegistros: 3,
      colunas: ["id", "municipio", "valor"],
    });
    expect(pagina.body.registros).toEqual([
      { linha: 1, valores: { id: "1", municipio: "Aracaju", valor: "10" } },
      { linha: 2, valores: { id: "2", municipio: "Itabaiana", valor: "20" } },
    ]);
    const invalida = await analista.get(
      `/api/datasets/${datasetId}/versoes/${versao1}/registros?tamanho=500`,
    );
    expect(invalida.status).toBe(400);
  });

  it("atualiza nome e descrição sem alterar conteúdo nem criar versão", async () => {
    const resposta = await analista
      .patch(`/api/datasets/${datasetId}`)
      .send({ nome: "Municípios SE", descricao: "ok" });
    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({
      nome: "Municípios SE",
      descricao: "ok",
      totalVersoes: 1,
    });
    expect(resposta.body.versaoAtual.hashSha256).toBe(sha256(original));
    const conteudo = await analista
      .patch(`/api/datasets/${datasetId}`)
      .send({ colunas: ["x"] });
    expect(conteudo.status).toBe(400);
    const vazio = await analista.patch(`/api/datasets/${datasetId}`).send({});
    expect(vazio.status).toBe(400);
  });

  it("importa nova versão vinculada à anterior, preservando o original", async () => {
    const novo = Buffer.from("id;municipio;valor;uf\n1;Aracaju;11;SE\n");
    const resposta = await analista
      .post(`/api/datasets/${datasetId}/versoes`)
      .field("separador", "PONTO_E_VIRGULA")
      .attach("arquivo", novo, "v2.csv");
    expect(resposta.status).toBe(201);
    expect(resposta.body).toMatchObject({
      numero: 2,
      versaoPredecessoraId: versao1,
      origem: "IMPORTACAO",
      colunas: ["id", "municipio", "valor", "uf"],
      hashSha256: sha256(novo),
    });
    const gravado = await readFile(
      path.join(contexto.armazenamentoDir, `${sha256(original)}.csv`),
    );
    expect(sha256(gravado)).toBe(sha256(original));
    const versoes = await analista.get(`/api/datasets/${datasetId}/versoes`);
    expect(versoes.body.map((v: { numero: number }) => v.numero)).toEqual([
      1, 2,
    ]);
  });

  it("rejeita nova versão inválida sem criar versão", async () => {
    const resposta = await analista
      .post(`/api/datasets/${datasetId}/versoes`)
      .attach("arquivo", Buffer.from("a,b\n1\n"), "v3.csv");
    expect(resposta.status).toBe(422);
    const versoes = await analista.get(`/api/datasets/${datasetId}/versoes`);
    expect(versoes.body).toHaveLength(2);
  });

  it("impede alteração de versões diretamente no banco (gatilho de imutabilidade)", async () => {
    await expect(
      contexto.banco.consultar(
        "UPDATE versao_dataset SET hash_sha256 = repeat('0', 64) WHERE id = $1",
        [versao1],
      ),
    ).rejects.toThrow("imutáveis");
    await expect(
      contexto.banco.consultar("DELETE FROM versao_dataset WHERE id = $1", [
        versao1,
      ]),
    ).rejects.toThrow("imutáveis");
  });

  it("exclui logicamente: sai da listagem ativa, mantém histórico e bloqueia novas operações", async () => {
    const exclusao = await analista.delete(`/api/datasets/${datasetId}`);
    expect(exclusao.status).toBe(200);
    expect(exclusao.body.situacao).toBe("EXCLUIDO_LOGICAMENTE");

    const lista = await analista.get("/api/datasets");
    expect(lista.body.map((d: { id: string }) => d.id)).not.toContain(
      datasetId,
    );

    const detalhe = await analista.get(`/api/datasets/${datasetId}`);
    expect(detalhe.body.versoes).toHaveLength(2);
    const [linha] = await contexto.banco.consultar<{ total: string }>(
      "SELECT count(*) AS total FROM versao_dataset WHERE dataset_id = $1",
      [datasetId],
    );
    expect(Number(linha.total)).toBe(2);
    const arquivo = await readFile(
      path.join(contexto.armazenamentoDir, `${sha256(original)}.csv`),
    );
    expect(arquivo.equals(original)).toBe(true);

    expect(
      (await analista.patch(`/api/datasets/${datasetId}`).send({ nome: "x" }))
        .status,
    ).toBe(409);
    expect((await analista.delete(`/api/datasets/${datasetId}`)).status).toBe(
      409,
    );
    const novaVersao = await analista
      .post(`/api/datasets/${datasetId}/versoes`)
      .attach("arquivo", Buffer.from("a\n1\n"), "x.csv");
    expect(novaVersao.status).toBe(409);
    expect(novaVersao.body.erro).toBe("DATASET_EXCLUIDO");
  });

  it("devolve 404 para dataset inexistente e 400 para identificador inválido", async () => {
    expect(
      (await analista.get("/api/datasets/9b2f4d4e-3c1a-4b7e-8f00-000000000000"))
        .status,
    ).toBe(404);
    expect((await analista.get("/api/datasets/nao-e-uuid")).status).toBe(400);
  });
});
