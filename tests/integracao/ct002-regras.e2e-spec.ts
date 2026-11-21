/*
 * CT002 — Regras e conjuntos (RF002, RN01, RN02, ADR-002/ADR-005/ADR-009).
 */
import { PapelUsuario } from "../../back/src/auth/papel-usuario";
import {
  ClienteApi,
  ContextoTeste,
  criarAplicacao,
  criarContas,
} from "./suporte/aplicacao";
import { importarCsv } from "./suporte/datasets";
import { criarConjunto, criarRegra } from "./suporte/regras";
import { importarCid10Amostra } from "./suporte/vocabularios";

describe("CT002 — configuração de regras visuais", () => {
  let contexto: ContextoTeste;
  let analista: ClienteApi;
  let vocabularioId: string;
  let datasetId: string;

  const unicidade = {
    dimensao: "UNICIDADE",
    colunas: [{ nome: "id", tipo: "TEXTO" }],
    acao: { tipo: "REMOVER_REPETICOES" },
  };
  const completude = {
    dimensao: "COMPLETUDE",
    colunas: [{ nome: "sexo", tipo: "TEXTO" }],
    marcadoresAusencia: ["ignorado"],
    acao: { tipo: "PREENCHER_VAZIO", coluna: "sexo", valor: "NAO_INFORMADO" },
  };
  const validadeIdade = {
    dimensao: "VALIDADE",
    combinador: "E",
    condicoes: [
      { coluna: "idade", tipo: "DECIMAL", operador: "MAIOR_IGUAL", valor: "0" },
      {
        coluna: "idade",
        tipo: "DECIMAL",
        operador: "MENOR_IGUAL",
        valor: "130",
      },
    ],
  };

  beforeAll(async () => {
    contexto = await criarAplicacao();
    await criarContas(contexto);
    analista = await ClienteApi.autenticado(
      contexto.app,
      PapelUsuario.ANALISTA,
    );
    vocabularioId = (await importarCid10Amostra(contexto)).id;
    const dataset = await importarCsv(
      analista,
      "id,sexo,idade,cid\n1,F,30,J18.9\n2,M,40,I10\n",
    );
    datasetId = dataset.body.id;
  });

  afterAll(() => contexto.encerrar());

  it("publica o catálogo fechado para a interface", async () => {
    const resposta = await analista.get("/api/catalogo");
    expect(resposta.status).toBe(200);
    expect(resposta.body.dimensoes).toEqual([
      "UNICIDADE",
      "COMPLETUDE",
      "VALIDADE",
    ]);
    expect(resposta.body.acoes).toHaveLength(4);
    expect(resposta.body.limiteCondicoes).toBe(5);
  });

  it("cria uma regra de cada dimensão, inclusive validade por vocabulário versionado", async () => {
    const ids = [
      await criarRegra(analista, "Chave única", unicidade),
      await criarRegra(analista, "Sexo preenchido", completude),
      await criarRegra(analista, "Idade na faixa", validadeIdade),
      await criarRegra(analista, "CID-10 válido", {
        dimensao: "VALIDADE",
        combinador: "E",
        condicoes: [
          {
            coluna: "cid",
            tipo: "TEXTO",
            operador: "PERTENCE_VOCABULARIO",
            vocabularioId,
          },
        ],
      }),
    ];
    const lista = await analista.get("/api/regras");
    expect(lista.body.map((r: { id: string }) => r.id)).toEqual(
      expect.arrayContaining(ids),
    );
    const reaberta = await analista.get(`/api/regras/${ids[1]}`);
    expect(reaberta.body).toMatchObject({
      revisao: 1,
      dimensao: "COMPLETUDE",
      configuracao: completude,
    });
  });

  it.each([
    [
      "operador não listado",
      {
        dimensao: "VALIDADE",
        combinador: "E",
        condicoes: [
          { coluna: "id", tipo: "TEXTO", operador: "REGEX", valor: ".*" },
        ],
      },
    ],
    [
      "tipo incompatível",
      {
        dimensao: "VALIDADE",
        combinador: "E",
        condicoes: [
          { coluna: "idade", tipo: "TEXTO", operador: "MAIOR", valor: "1" },
        ],
      },
    ],
    [
      "condição incompleta",
      {
        dimensao: "VALIDADE",
        combinador: "E",
        condicoes: [{ coluna: "idade", tipo: "DECIMAL", operador: "IGUAL" }],
      },
    ],
    [
      "mais de cinco condições",
      {
        dimensao: "VALIDADE",
        combinador: "OU",
        condicoes: Array.from({ length: 6 }, () => ({
          coluna: "sexo",
          tipo: "TEXTO",
          operador: "NAO_VAZIO",
        })),
      },
    ],
    [
      "vocabulário sem versão",
      {
        dimensao: "VALIDADE",
        combinador: "E",
        condicoes: [
          { coluna: "cid", tipo: "TEXTO", operador: "PERTENCE_VOCABULARIO" },
        ],
      },
    ],
    [
      "vocabulário inexistente",
      {
        dimensao: "VALIDADE",
        combinador: "E",
        condicoes: [
          {
            coluna: "cid",
            tipo: "TEXTO",
            operador: "PERTENCE_VOCABULARIO",
            vocabularioId: "7d8c1e2a-0000-4000-8000-000000000000",
          },
        ],
      },
    ],
    [
      "ação fora do catálogo",
      { ...completude, acao: { tipo: "INFERIR_VALOR", coluna: "sexo" } },
    ],
    [
      "dimensão fora das três",
      { dimensao: "CONFORMIDADE", colunas: [{ nome: "id", tipo: "TEXTO" }] },
    ],
  ])(
    "impede salvar regra com %s e aponta o campo",
    async (_caso, configuracao) => {
      const antes = (await analista.get("/api/regras")).body.length;
      const resposta = await analista
        .post("/api/regras")
        .send({ nome: "Inválida", configuracao });
      expect(resposta.status).toBe(422);
      expect(resposta.body.erro).toBe("CONFIGURACAO_INVALIDA");
      expect(resposta.body.detalhes[0]).toEqual({
        campo: expect.any(String),
        mensagem: expect.any(String),
      });
      expect((await analista.get("/api/regras")).body.length).toBe(antes);
    },
  );

  it("cria, edita, lista, consulta, associa e reabre um conjunto preservando ordem e parâmetros", async () => {
    const r1 = await criarRegra(analista, "Chave", unicidade);
    const r2 = await criarRegra(analista, "Sexo", completude);
    const r3 = await criarRegra(analista, "Idade", validadeIdade);
    const conjuntoId = await criarConjunto(analista, "Conjunto padrão", [
      r3,
      r1,
      r2,
    ]);

    const criado = await analista.get(`/api/conjuntos/${conjuntoId}`);
    expect(criado.body.revisao).toBe(1);
    expect(
      criado.body.regras.map((r: { regraId: string }) => r.regraId),
    ).toEqual([r3, r1, r2]);

    const editado = await analista
      .put(`/api/conjuntos/${conjuntoId}`)
      .send({ regras: [r1, r2, r3], descricao: "reordenado" });
    expect(editado.status).toBe(200);
    expect(editado.body.revisao).toBe(2);
    expect(
      editado.body.regras.map((r: { ordem: number; regraId: string }) => [
        r.ordem,
        r.regraId,
      ]),
    ).toEqual([
      [1, r1],
      [2, r2],
      [3, r3],
    ]);

    const associado = await analista.put(
      `/api/conjuntos/${conjuntoId}/datasets/${datasetId}`,
    );
    expect(associado.status).toBe(200);
    expect(associado.body.datasets).toEqual([datasetId]);

    const lista = await analista.get("/api/conjuntos");
    expect(lista.body.map((c: { id: string }) => c.id)).toContain(conjuntoId);

    const reaberto = await analista.get(`/api/conjuntos/${conjuntoId}`);
    expect(reaberto.body.regras[1].configuracao).toEqual(completude);

    const revisoes = await analista.get(
      `/api/conjuntos/${conjuntoId}/revisoes`,
    );
    expect(
      revisoes.body.map((r: { revisao: number; motivo: string }) => [
        r.revisao,
        r.motivo,
      ]),
    ).toEqual([
      [1, "CRIACAO"],
      [2, "EDICAO_CONJUNTO"],
    ]);
  });

  it("edição de regra gera revisão, propaga para o conjunto e mantém revisões antigas consultáveis", async () => {
    const regraId = await criarRegra(analista, "Idade editável", validadeIdade);
    const conjuntoId = await criarConjunto(analista, "Conjunto com idade", [
      regraId,
    ]);
    const novaConfig = {
      ...validadeIdade,
      condicoes: [
        { coluna: "idade", tipo: "DECIMAL", operador: "MENOR", valor: "120" },
      ],
    };
    const editada = await analista
      .put(`/api/regras/${regraId}`)
      .send({ configuracao: novaConfig });
    expect(editada.status).toBe(200);
    expect(editada.body.revisao).toBe(2);

    const revisoes = await analista.get(`/api/regras/${regraId}/revisoes`);
    expect(revisoes.body.map((r: { revisao: number }) => r.revisao)).toEqual([
      1, 2,
    ]);
    expect(revisoes.body[0].configuracao).toEqual(validadeIdade);

    const conjunto = await analista.get(`/api/conjuntos/${conjuntoId}`);
    expect(conjunto.body.revisao).toBe(2);
    expect(conjunto.body.regras[0]).toMatchObject({
      regraId,
      revisao: 2,
      configuracao: novaConfig,
    });
  });

  it("rejeita conjunto com duas ações de escrita na mesma coluna ou nome duplicado", async () => {
    const a = await criarRegra(analista, "Aparar sexo", {
      dimensao: "COMPLETUDE",
      colunas: [{ nome: "sexo", tipo: "TEXTO" }],
      acao: { tipo: "APARAR_ESPACOS", coluna: "sexo" },
    });
    const b = await criarRegra(analista, "Caixa sexo", {
      dimensao: "VALIDADE",
      combinador: "E",
      condicoes: [
        {
          coluna: "sexo",
          tipo: "TEXTO",
          operador: "PERTENCE_LISTA",
          valores: ["F", "M"],
        },
      ],
      acao: { tipo: "CONVERTER_CAIXA", coluna: "sexo", caixa: "MAIUSCULAS" },
    });
    const conflito = await analista
      .post("/api/conjuntos")
      .send({ nome: "Conflito", regras: [a, b] });
    expect(conflito.status).toBe(422);
    expect(conflito.body.erro).toBe("CONJUNTO_INCOMPATIVEL");

    const c = await criarRegra(analista, "aparar SEXO", unicidade);
    const nomes = await analista
      .post("/api/conjuntos")
      .send({ nome: "Nomes", regras: [a, c] });
    expect(nomes.status).toBe(422);
  });

  it("rejeita associar conjunto com coluna inexistente no dataset", async () => {
    const regraId = await criarRegra(analista, "Coluna ausente", {
      dimensao: "COMPLETUDE",
      colunas: [{ nome: "municipio", tipo: "TEXTO" }],
    });
    const conjuntoId = await criarConjunto(analista, "Conjunto incompatível", [
      regraId,
    ]);
    const resposta = await analista.put(
      `/api/conjuntos/${conjuntoId}/datasets/${datasetId}`,
    );
    expect(resposta.status).toBe(422);
    expect(resposta.body.erro).toBe("CONJUNTO_INCOMPATIVEL_COM_DATASET");
  });

  it("exclui logicamente conjunto e regra, sem apagar revisões", async () => {
    const regraId = await criarRegra(analista, "Temporária", unicidade);
    const conjuntoId = await criarConjunto(analista, "Temporário", [regraId]);
    const emUso = await analista.delete(`/api/regras/${regraId}`);
    expect(emUso.status).toBe(409);
    expect(emUso.body.erro).toBe("REGRA_EM_USO");

    expect(
      (await analista.delete(`/api/conjuntos/${conjuntoId}`)).body.situacao,
    ).toBe("EXCLUIDO_LOGICAMENTE");
    expect(
      (await analista.get("/api/conjuntos")).body.map(
        (c: { id: string }) => c.id,
      ),
    ).not.toContain(conjuntoId);
    expect(
      (await analista.put(`/api/conjuntos/${conjuntoId}`).send({ nome: "x" }))
        .status,
    ).toBe(409);

    expect(
      (await analista.delete(`/api/regras/${regraId}`)).body.situacao,
    ).toBe("EXCLUIDO_LOGICAMENTE");
    expect(
      (await analista.get(`/api/regras/${regraId}/revisoes`)).body,
    ).toHaveLength(1);
    const [linha] = await contexto.banco.consultar<{ total: string }>(
      "SELECT count(*) AS total FROM conjunto_revisao WHERE conjunto_id = $1",
      [conjuntoId],
    );
    expect(Number(linha.total)).toBe(1);
  });

  it("impede alterar revisões diretamente no banco", async () => {
    await expect(
      contexto.banco.consultar("UPDATE regra_revisao SET nome = 'x'"),
    ).rejects.toThrow("imutáveis");
    await expect(
      contexto.banco.consultar("DELETE FROM conjunto_revisao"),
    ).rejects.toThrow("imutáveis");
  });
});
