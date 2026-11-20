/*
 * CT002 (vocabulários) — RN02, ADR-009: importação versionada pela equipe e consulta pelo analista.
 */
import { PapelUsuario } from "../../back/src/auth/papel-usuario";
import { VocabularioService } from "../../back/src/rules/vocabularios/vocabulario.service";
import {
  ClienteApi,
  ContextoTeste,
  criarAplicacao,
  criarContas,
} from "./suporte/aplicacao";
import { importarCid10Amostra } from "./suporte/vocabularios";

describe("CT002 — vocabulários oficiais versionados", () => {
  let contexto: ContextoTeste;
  let analista: ClienteApi;

  beforeAll(async () => {
    contexto = await criarAplicacao();
    await criarContas(contexto);
    analista = await ClienteApi.autenticado(
      contexto.app,
      PapelUsuario.ANALISTA,
    );
  });

  afterAll(() => contexto.encerrar());

  it("importa a lista com origem, versão, licença e hash e a disponibiliza ao analista", async () => {
    const importado = await importarCid10Amostra(contexto);
    expect(importado).toMatchObject({
      nome: "CID-10",
      versao: "amostra-teste-1",
      totalCodigos: 25,
    });
    const lista = await analista.get("/api/vocabularios");
    expect(lista.status).toBe(200);
    expect(lista.body).toEqual([
      expect.objectContaining({
        id: importado.id,
        hashArquivo: importado.hashArquivo,
      }),
    ]);
    const detalhe = await analista.get(`/api/vocabularios/${importado.id}`);
    expect(detalhe.body.licenca).toBe("Uso restrito aos testes acadêmicos");
    const servico = contexto.app.get(VocabularioService);
    await expect(servico.contem(importado.id, "J18.9")).resolves.toBe(true);
    await expect(servico.contem(importado.id, "j18.9")).resolves.toBe(false);
  });

  it("mantém versões distintas lado a lado e recusa reimportar a mesma versão", async () => {
    await importarCid10Amostra(contexto, "amostra-teste-2");
    await expect(
      importarCid10Amostra(contexto, "amostra-teste-2"),
    ).rejects.toMatchObject({ status: 409 });
    const lista = await analista.get("/api/vocabularios");
    expect(lista.body.map((v: { versao: string }) => v.versao)).toEqual([
      "amostra-teste-1",
      "amostra-teste-2",
    ]);
  });

  it("recusa vocabulário fora da baseline e sem licença", async () => {
    const servico = contexto.app.get(VocabularioService);
    const conteudo = Buffer.from("codigo\n10101012\n");
    await expect(
      servico.importar(conteudo, {
        nome: "TUSS",
        origem: "x",
        versao: "1",
        licenca: "x",
      }),
    ).rejects.toThrow("fora da baseline");
    await expect(
      servico.importar(conteudo, {
        nome: "CID-10",
        origem: "x",
        versao: "9",
        licenca: "",
      }),
    ).rejects.toThrow("licenca");
  });

  it("não expõe vocabulários a perfis sem RF002 e não oferece rota de importação", async () => {
    const gestor = await ClienteApi.autenticado(
      contexto.app,
      PapelUsuario.GESTOR,
    );
    expect((await gestor.get("/api/vocabularios")).status).toBe(403);
    expect((await analista.post("/api/vocabularios").send({})).status).toBe(
      404,
    );
  });
});
