/*
 * Demonstração ponta a ponta (OBJ05; P1, seção 11): autenticar antes das operações protegidas e
 * percorrer importar → configurar → simular → aplicar → auditar → diagnosticar → sair, somente
 * pela API e com os três perfis.
 */
import { PapelUsuario } from "../../back/src/auth/papel-usuario";
import {
  ClienteApi,
  ContextoTeste,
  criarAplicacao,
  criarContas,
} from "./suporte/aplicacao";
import { importarCsv } from "./suporte/datasets";
import { simularEAguardar } from "./suporte/cenarios";

describe("Fluxo completo do MVP pela API", () => {
  let contexto: ContextoTeste;

  beforeAll(async () => {
    contexto = await criarAplicacao();
    await criarContas(contexto);
  });

  afterAll(() => contexto.encerrar());

  it("executa o fluxo do analista, do gestor e da equipe técnica", async () => {
    const analista = await ClienteApi.autenticado(
      contexto.app,
      PapelUsuario.ANALISTA,
    );

    const csv = "id;uf;obs\n1;se; ok \n2;AL;\n2;AL;\n3;SE;x\n";
    const dataset = await importarCsv(analista, csv, {
      nome: "Demonstração",
      separador: "PONTO_E_VIRGULA",
    });
    expect(dataset.status).toBe(201);
    const versaoId = dataset.body.versaoAtual.id;

    const regras = [];
    for (const [nome, configuracao] of [
      [
        "Id único",
        {
          dimensao: "UNICIDADE",
          colunas: [{ nome: "id", tipo: "TEXTO" }],
          acao: { tipo: "REMOVER_REPETICOES" },
        },
      ],
      [
        "Obs preenchida",
        {
          dimensao: "COMPLETUDE",
          colunas: [{ nome: "obs", tipo: "TEXTO" }],
          acao: { tipo: "APARAR_ESPACOS", coluna: "obs" },
        },
      ],
      [
        "UF válida",
        {
          dimensao: "VALIDADE",
          combinador: "E",
          condicoes: [
            {
              coluna: "uf",
              tipo: "TEXTO",
              operador: "PERTENCE_LISTA",
              valores: ["SE", "AL"],
            },
          ],
          acao: { tipo: "CONVERTER_CAIXA", coluna: "uf", caixa: "MAIUSCULAS" },
        },
      ],
    ] as const) {
      const resposta = await analista
        .post("/api/regras")
        .send({ nome, configuracao });
      expect(resposta.status).toBe(201);
      regras.push(resposta.body.id);
    }
    const conjunto = await analista
      .post("/api/conjuntos")
      .send({ nome: "Demonstração", regras });
    expect(conjunto.status).toBe(201);
    expect(
      (
        await analista.put(
          `/api/conjuntos/${conjunto.body.id}/datasets/${dataset.body.id}`,
        )
      ).status,
    ).toBe(200);

    const { simulacao } = await simularEAguardar(
      analista,
      versaoId,
      conjunto.body.id,
    );
    expect(simulacao).toMatchObject({
      status: "CONCLUIDA",
      totalLinhasComViolacao: 3,
      aplicavel: true,
    });
    expect(
      simulacao.resultados.map(
        (r: { linhasVioladas: number[] }) => r.linhasVioladas,
      ),
    ).toEqual([[3], [2, 3], [1]]);

    const tratamento = await analista
      .post("/api/tratamentos")
      .send({ simulacaoId: simulacao.id, confirmado: true });
    expect(tratamento.status).toBe(201);
    expect(tratamento.body).toMatchObject({
      totalLinhasAlteradas: 1,
      totalLinhasRemovidas: 1,
      totalLinhasAfetadas: 2,
    });

    const gestor = await ClienteApi.autenticado(
      contexto.app,
      PapelUsuario.GESTOR,
    );
    const diagnostico = await gestor.get(
      `/api/diagnosticos/versoes/${versaoId}`,
    );
    expect(diagnostico.status).toBe(200);
    expect(
      diagnostico.body.indicadores.map(
        (i: { percentual: number }) => i.percentual,
      ),
    ).toEqual([75, 50, 75]);
    const pdf = await gestor.get(
      `/api/diagnosticos/versoes/${versaoId}/exportar?formato=PDF`,
    );
    expect(pdf.status).toBe(200);

    const equipe = await ClienteApi.autenticado(
      contexto.app,
      PapelUsuario.EQUIPE_TECNICA,
    );
    const extratos = await equipe.get(
      `/api/auditoria/extratos?datasetId=${dataset.body.id}`,
    );
    expect(extratos.body).toHaveLength(1);
    expect(extratos.body[0].id).toBe(tratamento.body.extratoId);
    expect(
      (
        await equipe.get(
          `/api/auditoria/extratos/${tratamento.body.extratoId}/pdf`,
        )
      ).status,
    ).toBe(200);

    for (const cliente of [analista, gestor, equipe]) {
      expect((await cliente.post("/api/auth/sair")).status).toBe(204);
      expect((await cliente.get("/api/auth/sessao")).status).toBe(401);
    }
  });
});
