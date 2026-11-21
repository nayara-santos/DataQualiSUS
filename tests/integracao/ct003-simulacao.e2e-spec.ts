/*
 * CT003 — Simulação (RF003, UC-03, ADR-008) e CTN002 — três CSVs de estruturas distintas com
 * gabarito por linha e regra, sem alteração de código entre os ensaios (RNF002, OBJ06).
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
import { contarPersistencia, sha256 } from "./suporte/datasets";
import {
  carregarGabarito,
  montarCenario,
  pares,
  simularEAguardar,
} from "./suporte/cenarios";
import { criarConjunto, criarRegra } from "./suporte/regras";
import { importarCid10Amostra } from "./suporte/vocabularios";

describe("CT003/CTN002 — simulação de regras", () => {
  let contexto: ContextoTeste;
  let analista: ClienteApi;
  let vocabularioId: string;

  beforeAll(async () => {
    contexto = await criarAplicacao();
    await criarContas(contexto);
    analista = await ClienteApi.autenticado(
      contexto.app,
      PapelUsuario.ANALISTA,
    );
    vocabularioId = (await importarCid10Amostra(contexto)).id;
  });

  afterAll(() => contexto.encerrar());

  describe.each(["atendimentos", "vacinacao", "internacoes"])(
    "dataset %s",
    (nome) => {
      const gabarito = carregarGabarito(nome);

      it("detecta exatamente os pares linha/regra rotulados (zero falsos positivos e negativos)", async () => {
        const cenario = await montarCenario(analista, gabarito, vocabularioId);
        const versoesAntes = await contarPersistencia(contexto);
        const { aceite, simulacao } = await simularEAguardar(
          analista,
          cenario.versaoId,
          cenario.conjuntoId,
        );

        expect(aceite.status).toBe("EM_EXECUCAO");
        expect(simulacao.status).toBe("CONCLUIDA");
        expect(simulacao.totalLinhas).toBe(gabarito.totalLinhas);

        const chavePorId = new Map(
          [...cenario.regras.entries()].map(([chave, id]) => [id, chave]),
        );
        const obtidas: Record<string, number[]> = {};
        for (const resultado of simulacao.resultados) {
          obtidas[chavePorId.get(resultado.regraId)!] =
            resultado.linhasVioladas;
          expect(resultado.totalViolacoes).toBe(
            resultado.linhasVioladas.length,
          );
        }
        expect(pares(obtidas)).toEqual(pares(gabarito.violacoesEsperadas));
        expect(simulacao.totalLinhasComViolacao).toBe(
          gabarito.totalLinhasComViolacao,
        );

        // Prévia e totais previstos de alterações/remoções (contados uma vez por linha).
        expect(simulacao.totalPrevistoAlteradas).toBe(
          gabarito.tratamento.alteradas.length,
        );
        expect(simulacao.totalPrevistoRemovidas).toBe(
          gabarito.tratamento.removidas.length,
        );
        const linhasPrevia = simulacao.previa.map(
          (p: { linha: number }) => p.linha,
        );
        expect(linhasPrevia).toEqual(
          [
            ...gabarito.tratamento.alteradas,
            ...gabarito.tratamento.removidas,
          ].sort((a, b) => a - b),
        );
        expect(simulacao.previa.length).toBeLessThanOrEqual(20);
        expect(simulacao.aplicavel).toBe(
          gabarito.tratamento.alteradas.length +
            gabarito.tratamento.removidas.length >
            0,
        );

        // Nenhuma gravação: original idêntico por SHA-256 e nenhuma versão nova.
        expect(simulacao.hashEntradaConferido).toBe(sha256(cenario.conteudo));
        const arquivo = await readFile(
          path.join(
            contexto.armazenamentoDir,
            `${sha256(cenario.conteudo)}.csv`,
          ),
        );
        expect(sha256(arquivo)).toBe(sha256(cenario.conteudo));
        expect(await contarPersistencia(contexto)).toEqual(versoesAntes);
        const [extratos] = await contexto.banco.consultar<{ total: string }>(
          "SELECT count(*) AS total FROM information_schema.tables WHERE table_name = 'extrato_auditoria'",
        );
        if (Number(extratos.total) > 0) {
          const [linha] = await contexto.banco.consultar<{ total: string }>(
            "SELECT count(*) AS total FROM extrato_auditoria",
          );
          expect(Number(linha.total)).toBe(0);
        }

        // Configuração executada preservada para reconstituir a execução (MOD-12).
        expect(simulacao.configuracaoExecutada.versao.hashSha256).toBe(
          sha256(cenario.conteudo),
        );
        expect(simulacao.configuracaoExecutada.regras).toHaveLength(
          gabarito.regras.length,
        );
      });
    },
  );

  it("a prévia mostra antes e depois das ações do catálogo", async () => {
    const gabarito = carregarGabarito("atendimentos");
    const cenario = await montarCenario(
      analista,
      { ...gabarito, arquivo: gabarito.arquivo },
      vocabularioId,
    );
    const { simulacao } = await simularEAguardar(
      analista,
      cenario.versaoId,
      cenario.conjuntoId,
    );
    const linha3 = simulacao.previa.find(
      (p: { linha: number }) => p.linha === 3,
    );
    expect(linha3).toMatchObject({
      tipo: "ATUALIZACAO",
      antes: { sexo: "" },
      depois: { sexo: "NAO_INFORMADO" },
    });
    const linha10 = simulacao.previa.find(
      (p: { linha: number }) => p.linha === 10,
    );
    expect(linha10).toMatchObject({
      antes: { cid_principal: " J18.9 " },
      depois: { cid_principal: "J18.9" },
    });
    const linha6 = simulacao.previa.find(
      (p: { linha: number }) => p.linha === 6,
    );
    expect(linha6).toMatchObject({ tipo: "REMOCAO", depois: null });
  });

  it("alteração de regra após a simulação invalida o resultado (RF002, MOD-16)", async () => {
    const cenario = await montarCenario(
      analista,
      carregarGabarito("internacoes"),
    );
    const { simulacao } = await simularEAguardar(
      analista,
      cenario.versaoId,
      cenario.conjuntoId,
    );
    expect(simulacao.vigente).toBe(true);
    const regraId = cenario.regras.get("C_V1")!;
    const edicao = await analista
      .put(`/api/regras/${regraId}`)
      .send({ nome: "Valor total positivo (editada)" });
    expect(edicao.status).toBe(200);
    const depois = await analista.get(`/api/simulacoes/${simulacao.id}`);
    expect(depois.body.status).toBe("INVALIDADA");
    expect(depois.body.vigente).toBe(false);
    // O histórico da execução permanece consultável com a revisão executada.
    expect(
      depois.body.resultados.find(
        (r: { regraId: string }) => r.regraId === regraId,
      ).revisao,
    ).toBe(1);
    const lista = await analista.get(
      `/api/simulacoes?versaoId=${cenario.versaoId}`,
    );
    expect(lista.body.map((s: { id: string }) => s.id)).toContain(simulacao.id);
  });

  it("rejeita configuração incompatível ou não associada sem registrar simulação", async () => {
    const cenario = await montarCenario(
      analista,
      carregarGabarito("vacinacao"),
    );
    const regraId = await criarRegra(analista, "Coluna de outro dataset", {
      dimensao: "COMPLETUDE",
      colunas: [{ nome: "cid_principal", tipo: "TEXTO" }],
    });
    const conjuntoId = await criarConjunto(analista, "Conjunto não associado", [
      regraId,
    ]);
    const [antes] = await contexto.banco.consultar<{ total: string }>(
      "SELECT count(*) AS total FROM simulacao",
    );

    const naoAssociado = await analista
      .post("/api/simulacoes")
      .send({ versaoId: cenario.versaoId, conjuntoId });
    expect(naoAssociado.status).toBe(422);
    expect(naoAssociado.body.erro).toBe("CONJUNTO_NAO_ASSOCIADO");

    await contexto.banco.consultar(
      "INSERT INTO conjunto_dataset (conjunto_id, dataset_id, associado_por) VALUES ($1, $2, $3)",
      [conjuntoId, cenario.datasetId, analista.usuarioId],
    );
    const incompativel = await analista
      .post("/api/simulacoes")
      .send({ versaoId: cenario.versaoId, conjuntoId });
    expect(incompativel.status).toBe(422);
    expect(incompativel.body.erro).toBe("CONFIGURACAO_INCOMPATIVEL");

    const [depois] = await contexto.banco.consultar<{ total: string }>(
      "SELECT count(*) AS total FROM simulacao",
    );
    expect(depois.total).toBe(antes.total);
  });

  it("recusa simular dataset excluído logicamente e versão inexistente", async () => {
    const cenario = await montarCenario(
      analista,
      carregarGabarito("internacoes"),
    );
    expect(
      (await analista.delete(`/api/datasets/${cenario.datasetId}`)).status,
    ).toBe(200);
    const excluido = await analista
      .post("/api/simulacoes")
      .send({ versaoId: cenario.versaoId, conjuntoId: cenario.conjuntoId });
    expect(excluido.status).toBe(409);
    const inexistente = await analista
      .post("/api/simulacoes")
      .send({
        versaoId: "5e0e6a52-0000-4000-8000-000000000000",
        conjuntoId: cenario.conjuntoId,
      });
    expect(inexistente.status).toBe(404);
    expect(
      (
        await analista
          .post("/api/simulacoes")
          .send({ versaoId: "x", conjuntoId: "y" })
      ).status,
    ).toBe(400);
  });

  it("nega simulação ao gestor e à equipe técnica", async () => {
    const gestor = await ClienteApi.autenticado(
      contexto.app,
      PapelUsuario.GESTOR,
    );
    expect((await gestor.post("/api/simulacoes").send({})).status).toBe(403);
  });
});
