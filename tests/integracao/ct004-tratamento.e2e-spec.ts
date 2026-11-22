/*
 * CT004 — Aplicação do tratamento (RF004, UC-04/UC-05, ADR-004), CTN001 — falhas na persistência
 * da versão e do extrato com rollback integral, e CT006 — extrato gerado pelo tratamento real.
 */
import { readdir, readFile } from "fs/promises";
import * as path from "path";
import { AuditoriaRepository } from "../../back/src/audit/auditoria.repository";
import { PapelUsuario } from "../../back/src/auth/papel-usuario";
import { ArmazenamentoArquivosService } from "../../back/src/datasets/armazenamento-arquivos.service";
import { DatasetRepository } from "../../back/src/datasets/dataset.repository";
import { lerCsv } from "../../back/src/datasets/leitor-csv";
import { VersionamentoService } from "../../back/src/datasets/versionamento.service";
import { SimulacaoRepository } from "../../back/src/simulations/simulacao.repository";
import {
  ClienteApi,
  ContextoTeste,
  criarAplicacao,
  criarContas,
} from "./suporte/aplicacao";
import { sha256 } from "./suporte/datasets";
import {
  Cenario,
  carregarGabarito,
  montarCenario,
  simularEAguardar,
} from "./suporte/cenarios";
import { importarCid10Amostra } from "./suporte/vocabularios";

describe("CT004 — aplicação controlada do tratamento", () => {
  let contexto: ContextoTeste;
  let analista: ClienteApi;
  let vocabularioId: string;
  const gabarito = carregarGabarito("atendimentos");

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

  async function preparar(): Promise<{
    cenario: Cenario;
    simulacaoId: string;
  }> {
    const cenario = await montarCenario(analista, gabarito, vocabularioId);
    const { simulacao } = await simularEAguardar(
      analista,
      cenario.versaoId,
      cenario.conjuntoId,
    );
    expect(simulacao.status).toBe("CONCLUIDA");
    return { cenario, simulacaoId: simulacao.id };
  }

  async function contagens(datasetId: string) {
    const [linha] = await contexto.banco.consultar<{
      versoes: string;
      extratos: string;
      alteracoes: string;
    }>(
      `SELECT (SELECT count(*) FROM versao_dataset WHERE dataset_id = $1) AS versoes,
              (SELECT count(*) FROM extrato_auditoria WHERE dataset_id = $1) AS extratos,
              (SELECT count(*) FROM alteracao_registro a JOIN extrato_auditoria e ON e.id = a.extrato_id
                WHERE e.dataset_id = $1) AS alteracoes`,
      [datasetId],
    );
    return {
      versoes: Number(linha.versoes),
      extratos: Number(linha.extratos),
      alteracoes: Number(linha.alteracoes),
    };
  }

  it("exige confirmação explícita", async () => {
    const { cenario, simulacaoId } = await preparar();
    const semConfirmacao = await analista
      .post("/api/tratamentos")
      .send({ simulacaoId, confirmado: false });
    expect(semConfirmacao.status).toBe(400);
    expect(semConfirmacao.body.erro).toBe("CONFIRMACAO_OBRIGATORIA");
    expect(
      (await analista.post("/api/tratamentos").send({ simulacaoId })).status,
    ).toBe(400);
    expect(await contagens(cenario.datasetId)).toEqual({
      versoes: 1,
      extratos: 0,
      alteracoes: 0,
    });
  });

  it("gera nova versão e extrato juntos, na ordem exibida, preservando o original", async () => {
    const { cenario, simulacaoId } = await preparar();
    const resposta = await analista
      .post("/api/tratamentos")
      .send({ simulacaoId, confirmado: true });
    expect(resposta.status).toBe(201);
    expect(resposta.body).toMatchObject({
      simulacaoId,
      extratoId: expect.any(String),
      versaoEntrada: {
        id: cenario.versaoId,
        numero: 1,
        hashSha256: sha256(cenario.conteudo),
      },
      versaoSaida: {
        numero: 2,
        origem: "TRATAMENTO",
        versaoPredecessoraId: cenario.versaoId,
        totalRegistros: 22,
      },
      totalLinhasAlteradas: gabarito.tratamento.alteradas.length,
      totalLinhasRemovidas: gabarito.tratamento.removidas.length,
      totalLinhasAfetadas: 5,
    });

    // Original idêntico por SHA-256.
    const original = await readFile(
      path.join(contexto.armazenamentoDir, `${sha256(cenario.conteudo)}.csv`),
    );
    expect(sha256(original)).toBe(sha256(cenario.conteudo));

    // Conteúdo da nova versão: ações aplicadas e repetições removidas após a normalização.
    const saida = await readFile(
      path.join(
        contexto.armazenamentoDir,
        `${resposta.body.versaoSaida.hashSha256}.csv`,
      ),
    );
    expect(sha256(saida)).toBe(resposta.body.versaoSaida.hashSha256);
    const { colunas, registros } = await lerCsv(saida, ";");
    expect(colunas).toEqual([
      "id_atendimento",
      "data_atendimento",
      "sexo",
      "idade",
      "cid_principal",
      "municipio",
    ]);
    expect(registros).toHaveLength(22);
    expect(registros.find((r) => r[0] === "A003")![2]).toBe("NAO_INFORMADO");
    expect(registros.find((r) => r[0] === "A014")![2]).toBe("NAO_INFORMADO");
    expect(registros.find((r) => r[0] === "A010")![4]).toBe("J18.9");
    expect(registros.find((r) => r[0] === "A008")![2]).toBe("ignorado");
    expect(registros.filter((r) => r[0] === "A001")).toHaveLength(1);
    expect(registros.filter((r) => r[0] === "A002")).toHaveLength(1);

    // CT006: exatamente um extrato por operação, com os campos da RN03.
    expect(await contagens(cenario.datasetId)).toEqual({
      versoes: 2,
      extratos: 1,
      alteracoes: 5,
    });
    const extrato = await analista.get(
      `/api/auditoria/extratos/${resposta.body.extratoId}`,
    );
    expect(extrato.body).toMatchObject({
      operacao: "TRATAMENTO",
      usuarioId: analista.usuarioId,
      versaoEntrada: { id: cenario.versaoId },
      versaoSaida: { id: resposta.body.versaoSaida.id },
      conjunto: { id: cenario.conjuntoId, revisao: 1 },
      totalLinhasAlteradas: 3,
      totalLinhasRemovidas: 2,
      totalLinhasAfetadas: 5,
    });
    expect(Date.parse(extrato.body.instanteUtc)).not.toBeNaN();
    expect(extrato.body.instanteUtc.endsWith("Z")).toBe(true);
    expect(extrato.body.revisoesRegras).toHaveLength(5);
    expect(
      extrato.body.acoesAplicadas.map((a: { acao: string }) => a.acao),
    ).toEqual(["REMOVER_REPETICOES", "PREENCHER_VAZIO", "APARAR_ESPACOS"]);
    const itens = extrato.body.alteracoes.itens.map(
      (a: { linha: number; tipo: string }) => [a.linha, a.tipo],
    );
    expect(itens).toEqual([
      [3, "ATUALIZACAO"],
      [6, "REMOCAO"],
      [10, "ATUALIZACAO"],
      [14, "ATUALIZACAO"],
      [16, "REMOCAO"],
    ]);
    // Linhas distintas afetadas = diferença entre as versões (24 → 22 linhas e 3 atualizadas).
    expect(24 - registros.length).toBe(extrato.body.totalLinhasRemovidas);

    const simulacao = await analista.get(`/api/simulacoes/${simulacaoId}`);
    expect(simulacao.body.status).toBe("CONSOLIDADA");
    expect(simulacao.body.aplicavel).toBe(false);
  });

  it("impede a reaplicação da mesma simulação", async () => {
    const { cenario, simulacaoId } = await preparar();
    expect(
      (
        await analista
          .post("/api/tratamentos")
          .send({ simulacaoId, confirmado: true })
      ).status,
    ).toBe(201);
    const segunda = await analista
      .post("/api/tratamentos")
      .send({ simulacaoId, confirmado: true });
    expect(segunda.status).toBe(409);
    expect(segunda.body.erro).toBe("SIMULACAO_JA_APLICADA");
    expect(await contagens(cenario.datasetId)).toEqual({
      versoes: 2,
      extratos: 1,
      alteracoes: 5,
    });
  });

  it("confirmações concorrentes da mesma simulação geram uma única versão e um único extrato (A1)", async () => {
    const { cenario, simulacaoId } = await preparar();
    const respostas = await Promise.all(
      [1, 2, 3].map(() =>
        analista
          .post("/api/tratamentos")
          .send({ simulacaoId, confirmado: true }),
      ),
    );
    expect(respostas.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await contagens(cenario.datasetId)).toEqual({
      versoes: 2,
      extratos: 1,
      alteracoes: 5,
    });
  });

  it("impede aplicar simulação invalidada por edição de regra (A2)", async () => {
    const { cenario, simulacaoId } = await preparar();
    await analista
      .put(`/api/regras/${cenario.regras.get("A_V1")}`)
      .send({ descricao: "revisada" });
    const resposta = await analista
      .post("/api/tratamentos")
      .send({ simulacaoId, confirmado: true });
    expect(resposta.status).toBe(409);
    expect(resposta.body.erro).toBe("SIMULACAO_INVALIDADA");
    expect(await contagens(cenario.datasetId)).toEqual({
      versoes: 1,
      extratos: 0,
      alteracoes: 0,
    });
  });

  it("impede aplicar após exclusão lógica do dataset", async () => {
    const { cenario, simulacaoId } = await preparar();
    await analista.delete(`/api/datasets/${cenario.datasetId}`);
    const resposta = await analista
      .post("/api/tratamentos")
      .send({ simulacaoId, confirmado: true });
    expect(resposta.status).toBe(409);
    expect(resposta.body.erro).toBe("DATASET_EXCLUIDO");
  });

  it("informa que não há alterações e não cria versão quando nada muda", async () => {
    const cenario = await montarCenario(
      analista,
      carregarGabarito("internacoes"),
    );
    const { simulacao } = await simularEAguardar(
      analista,
      cenario.versaoId,
      cenario.conjuntoId,
    );
    expect(simulacao.aplicavel).toBe(false);
    const resposta = await analista
      .post("/api/tratamentos")
      .send({ simulacaoId: simulacao.id, confirmado: true });
    expect(resposta.status).toBe(422);
    expect(resposta.body.erro).toBe("SEM_ALTERACOES");
    expect(await contagens(cenario.datasetId)).toEqual({
      versoes: 1,
      extratos: 0,
      alteracoes: 0,
    });
  });

  describe("CTN001 — falhas injetadas com rollback integral", () => {
    it.each([
      [
        "persistência da versão",
        () =>
          jest.spyOn(
            contextoAtual().app.get(VersionamentoService),
            "criarVersaoDerivada",
          ),
      ],
      [
        "persistência do extrato",
        () =>
          jest.spyOn(
            contextoAtual().app.get(AuditoriaRepository),
            "inserirExtrato",
          ),
      ],
      [
        "persistência das alterações",
        () =>
          jest.spyOn(
            contextoAtual().app.get(AuditoriaRepository),
            "inserirAlteracoes",
          ),
      ],
      [
        "consolidação da simulação",
        () =>
          jest.spyOn(
            contextoAtual().app.get(SimulacaoRepository),
            "consolidar",
          ),
      ],
    ])("falha na %s não deixa versão nem extrato", async (_etapa, espionar) => {
      const { cenario, simulacaoId } = await preparar();
      const espiao = espionar().mockRejectedValueOnce(
        new Error("falha injetada"),
      );
      const resposta = await analista
        .post("/api/tratamentos")
        .send({ simulacaoId, confirmado: true });
      espiao.mockRestore();

      expect(resposta.status).toBe(500);
      expect(await contagens(cenario.datasetId)).toEqual({
        versoes: 1,
        extratos: 0,
        alteracoes: 0,
      });
      const simulacao = await analista.get(`/api/simulacoes/${simulacaoId}`);
      expect(simulacao.body.status).toBe("CONCLUIDA");
      const original = await readFile(
        path.join(contexto.armazenamentoDir, `${sha256(cenario.conteudo)}.csv`),
      );
      expect(sha256(original)).toBe(sha256(cenario.conteudo));

      // Depois da falha, a mesma simulação ainda pode ser aplicada com sucesso.
      const nova = await analista
        .post("/api/tratamentos")
        .send({ simulacaoId, confirmado: true });
      expect(nova.status).toBe(201);
      expect(await contagens(cenario.datasetId)).toEqual({
        versoes: 2,
        extratos: 1,
        alteracoes: 5,
      });
    });

    it("arquivo gravado antes do rollback fica sem referência e é coletado sem remover versões válidas", async () => {
      const { cenario, simulacaoId } = await preparar();
      const espiao = jest
        .spyOn(contexto.app.get(AuditoriaRepository), "inserirExtrato")
        .mockRejectedValueOnce(new Error("falha injetada"));
      await analista
        .post("/api/tratamentos")
        .send({ simulacaoId, confirmado: true });
      espiao.mockRestore();
      // Arquivo sem referência simulado: conteúdo tratado de outro dataset que nunca chegou ao banco.
      const orfao = await contexto.app
        .get(ArmazenamentoArquivosService)
        .gravar(Buffer.from("orfao\n1\n"));
      const referenciados = await contexto.app
        .get(DatasetRepository)
        .listarCaminhosReferenciados();
      expect(referenciados.has(orfao.caminho)).toBe(false);
      const removidos = await contexto.app
        .get(ArmazenamentoArquivosService)
        .coletarOrfaos(referenciados, 0);
      expect(removidos).toContain(orfao.caminho);
      const restantes = (await readdir(contexto.armazenamentoDir)).filter(
        (n) => !n.startsWith("."),
      );
      // Depois da coleta, só restam arquivos referenciados por versões, incluindo o original.
      expect(restantes.sort()).toEqual([...referenciados].sort());
      expect(restantes).toContain(`${sha256(cenario.conteudo)}.csv`);
    });
  });

  it("nega a aplicação ao gestor e à equipe técnica", async () => {
    for (const papel of [PapelUsuario.GESTOR, PapelUsuario.EQUIPE_TECNICA]) {
      const cliente = await ClienteApi.autenticado(contexto.app, papel);
      expect((await cliente.post("/api/tratamentos").send({})).status).toBe(
        403,
      );
    }
  });

  function contextoAtual(): ContextoTeste {
    return contexto;
  }
});
