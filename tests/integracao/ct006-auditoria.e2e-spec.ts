/*
 * CT006 (registro, consulta e exportação) — RF006, RN03, ADR-006/ADR-007: extratos somente de
 * inserção, consultáveis pelos três perfis, inclusive de datasets excluídos logicamente.
 * O fluxo completo com o tratamento real está em ct004-tratamento.e2e-spec.ts.
 */
import { readFile } from "fs/promises";
import * as path from "path";
import { Client } from "pg";
import request from "supertest";
import { AuditoriaService } from "../../back/src/audit/auditoria.service";
import { PapelUsuario } from "../../back/src/auth/papel-usuario";
import { TipoAlteracao } from "../../back/src/rules/motor/motor-regras";
import { TipoAcao } from "../../back/src/rules/motor/tipos";
import {
  ClienteApi,
  ContextoTeste,
  criarAplicacao,
  criarContas,
} from "./suporte/aplicacao";
import {
  carregarGabarito,
  montarCenario,
  simularEAguardar,
} from "./suporte/cenarios";

describe("CT006 — extrato de auditoria", () => {
  let contexto: ContextoTeste;
  let analista: ClienteApi;
  let extratoId: string;
  let datasetId: string;

  beforeAll(async () => {
    contexto = await criarAplicacao();
    await criarContas(contexto);
    analista = await ClienteApi.autenticado(
      contexto.app,
      PapelUsuario.ANALISTA,
    );

    const cenario = await montarCenario(
      analista,
      carregarGabarito("vacinacao"),
    );
    datasetId = cenario.datasetId;
    const { simulacao } = await simularEAguardar(
      analista,
      cenario.versaoId,
      cenario.conjuntoId,
    );
    const saida = await analista
      .post(`/api/datasets/${cenario.datasetId}/versoes`)
      .attach(
        "arquivo",
        Buffer.from("codigo_registro,vacina\nR01,BCG\n"),
        "saida.csv",
      );
    const regraId = cenario.regras.get("B_V1")!;
    const servico = contexto.app.get(AuditoriaService);
    const registrado = await contexto.banco.transacao((tx) =>
      servico.registrarExtrato(
        {
          simulacaoId: simulacao.id,
          datasetId: cenario.datasetId,
          usuarioId: analista.usuarioId!,
          versaoEntradaId: cenario.versaoId,
          versaoSaidaId: saida.body.id,
          conjuntoId: cenario.conjuntoId,
          conjuntoRevisao: 1,
          revisoesRegras: [
            { regraId, revisao: 1, nome: "Vacina do calendário", ordem: 3 },
          ],
          acoesAplicadas: [
            {
              ordem: 3,
              regraId,
              acao: TipoAcao.CONVERTER_CAIXA,
              coluna: "vacina",
            },
          ],
          totalLinhasAlteradas: 2,
          totalLinhasRemovidas: 0,
        },
        [2, 10].map((linha) => ({
          linha,
          tipo: TipoAlteracao.ATUALIZACAO,
          regraId,
          regraRevisao: 1,
          acao: TipoAcao.CONVERTER_CAIXA,
          coluna: "vacina",
          valorAnterior: linha === 2 ? "Hepatite B" : "pentavalente",
          valorNovo: linha === 2 ? "HEPATITE B" : "PENTAVALENTE",
          linhaRepresentante: null,
        })),
        tx,
      ),
    );
    extratoId = registrado.id;
  });

  afterAll(() => contexto.encerrar());

  it.each(Object.values(PapelUsuario))(
    "permite ao perfil %s consultar e exportar o extrato",
    async (papel) => {
      const cliente = await ClienteApi.autenticado(contexto.app, papel);
      const datasets = await cliente.get("/api/auditoria/datasets");
      expect(datasets.status).toBe(200);
      expect(datasets.body).toEqual([
        expect.objectContaining({ id: datasetId, totalExtratos: 1 }),
      ]);

      const lista = await cliente.get(
        `/api/auditoria/extratos?datasetId=${datasetId}`,
      );
      expect(lista.body.map((e: { id: string }) => e.id)).toEqual([extratoId]);

      const detalhe = await cliente.get(
        `/api/auditoria/extratos/${extratoId}?pagina=1&tamanho=1`,
      );
      expect(detalhe.status).toBe(200);
      expect(detalhe.body).toMatchObject({
        operacao: "TRATAMENTO",
        usuarioId: expect.any(String),
        totalLinhasAlteradas: 2,
        totalLinhasRemovidas: 0,
        totalLinhasAfetadas: 2,
        versaoEntrada: { numero: 1 },
        versaoSaida: { numero: 2 },
        alteracoes: {
          total: 2,
          itens: [
            expect.objectContaining({
              linha: 2,
              valorAnterior: "Hepatite B",
              valorNovo: "HEPATITE B",
            }),
          ],
        },
      });

      const pdf = await cliente
        .get(`/api/auditoria/extratos/${extratoId}/pdf`)
        .buffer(true);
      expect(pdf.status).toBe(200);
      expect(pdf.headers["content-type"]).toBe("application/pdf");
      expect(pdf.headers["content-disposition"]).toContain(
        `extrato-auditoria-${extratoId}.pdf`,
      );
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    },
  );

  it("não oferece edição ou remoção de extratos pelas rotas", async () => {
    expect(
      (await analista.put(`/api/auditoria/extratos/${extratoId}`).send({}))
        .status,
    ).toBe(404);
    expect(
      (await analista.delete(`/api/auditoria/extratos/${extratoId}`)).status,
    ).toBe(404);
    expect(
      (await analista.patch(`/api/auditoria/extratos/${extratoId}`).send({}))
        .status,
    ).toBe(404);
  });

  it("informa indisponibilidade de extrato inexistente sem expor detalhes", async () => {
    const resposta = await analista.get(
      "/api/auditoria/extratos/1d6a2f1c-0000-4000-8000-000000000000",
    );
    expect(resposta.status).toBe(404);
    expect(resposta.body.mensagem).toBe("Extrato de auditoria indisponível.");
    expect((await analista.get("/api/auditoria/extratos")).status).toBe(400);
  });

  it("rejeita UPDATE e DELETE nas tabelas de auditoria pelo gatilho", async () => {
    await expect(
      contexto.banco.consultar(
        "UPDATE extrato_auditoria SET total_linhas_alteradas = 0",
      ),
    ).rejects.toThrow("somente de inserção");
    await expect(
      contexto.banco.consultar("DELETE FROM alteracao_registro"),
    ).rejects.toThrow("somente de inserção");
  });

  it("usuário de banco da aplicação não possui UPDATE/DELETE em auditoria e versões (ADR-006)", async () => {
    const sql = (
      await readFile(
        path.resolve(__dirname, "..", "..", "database", "papeis.sql"),
        "utf8",
      )
    ).replace(":senha_app", "'senha-papel-teste'");
    await contexto.banco.consultar(sql);
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.username = "dataqualisus_app";
    url.password = "senha-papel-teste";
    const app = new Client({ connectionString: url.toString() });
    await app.connect();
    try {
      const leitura = await app.query(
        "SELECT count(*) AS total FROM extrato_auditoria",
      );
      expect(Number(leitura.rows[0].total)).toBe(1);
      for (const comando of [
        "UPDATE extrato_auditoria SET total_linhas_alteradas = 0",
        "DELETE FROM extrato_auditoria",
        "DELETE FROM alteracao_registro",
        "UPDATE versao_dataset SET caminho_arquivo = 'x'",
        "TRUNCATE extrato_auditoria CASCADE",
      ]) {
        await expect(app.query(comando)).rejects.toMatchObject({
          code: "42501",
        });
      }
      await expect(
        app.query("UPDATE dataset SET descricao = descricao WHERE id = $1", [
          datasetId,
        ]),
      ).resolves.toBeDefined();
    } finally {
      await app.end();
    }
  });

  it("mantém o extrato consultável após a exclusão lógica do dataset", async () => {
    expect((await analista.delete(`/api/datasets/${datasetId}`)).status).toBe(
      200,
    );
    const equipe = await ClienteApi.autenticado(
      contexto.app,
      PapelUsuario.EQUIPE_TECNICA,
    );
    const lista = await equipe.get(
      `/api/auditoria/extratos?datasetId=${datasetId}`,
    );
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].dataset.situacao).toBe("EXCLUIDO_LOGICAMENTE");
    const sem = await request(contexto.app.getHttpServer()).get(
      `/api/auditoria/extratos/${extratoId}`,
    );
    expect(sem.status).toBe(401);
  });
});
