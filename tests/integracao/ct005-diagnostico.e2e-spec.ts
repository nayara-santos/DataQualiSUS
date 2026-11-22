/*
 * CT005 — Indicadores e diagnóstico (RF005, RN01, UC-07, ADR-007) e CTN005 — exportação inerte.
 */
import ExcelJS from "exceljs";
import { PapelUsuario } from "../../back/src/auth/papel-usuario";
import {
  ClienteApi,
  ContextoTeste,
  criarAplicacao,
  criarContas,
} from "./suporte/aplicacao";
import { importarCsv } from "./suporte/datasets";
import {
  carregarGabarito,
  montarCenario,
  simularEAguardar,
} from "./suporte/cenarios";
import { criarConjunto, criarRegra } from "./suporte/regras";
import { importarCid10Amostra } from "./suporte/vocabularios";

async function lerXlsx(conteudo: Buffer): Promise<ExcelJS.Workbook> {
  const pasta = new ExcelJS.Workbook();
  await pasta.xlsx.load(conteudo as never);
  return pasta;
}

function baixar(cliente: ClienteApi, url: string) {
  return cliente
    .get(url)
    .buffer(true)
    .parse((resposta, retorno) => {
      const partes: Buffer[] = [];
      resposta.on("data", (p: Buffer) => partes.push(p));
      resposta.on("end", () => retorno(null, Buffer.concat(partes)));
    });
}

describe("CT005 — diagnóstico de qualidade", () => {
  let contexto: ContextoTeste;
  let analista: ClienteApi;
  let gestor: ClienteApi;
  let vocabularioId: string;

  beforeAll(async () => {
    contexto = await criarAplicacao();
    await criarContas(contexto);
    analista = await ClienteApi.autenticado(
      contexto.app,
      PapelUsuario.ANALISTA,
    );
    gestor = await ClienteApi.autenticado(contexto.app, PapelUsuario.GESTOR);
    vocabularioId = (await importarCid10Amostra(contexto)).id;
  });

  afterAll(() => contexto.encerrar());

  describe.each(["atendimentos", "vacinacao", "internacoes"])(
    "dataset %s",
    (nome) => {
      const gabarito = carregarGabarito(nome);

      it("apresenta os três indicadores iguais ao cálculo manual do gabarito e exporta PDF/XLSX equivalentes", async () => {
        const cenario = await montarCenario(analista, gabarito, vocabularioId);
        await simularEAguardar(analista, cenario.versaoId, cenario.conjuntoId);

        const resposta = await gestor.get(
          `/api/diagnosticos/versoes/${cenario.versaoId}`,
        );
        expect(resposta.status).toBe(200);
        const dto = resposta.body;
        expect(dto.versao).toMatchObject({ id: cenario.versaoId, numero: 1 });
        expect(dto.totalLinhas).toBe(gabarito.totalLinhas);
        expect(
          dto.indicadores.map((i: { dimensao: string }) => i.dimensao),
        ).toEqual(["UNICIDADE", "COMPLETUDE", "VALIDADE"]);
        for (const indicador of dto.indicadores) {
          expect({
            situacao: indicador.situacao,
            numerador: indicador.numerador,
            denominador: indicador.denominador,
            percentual: indicador.percentual,
          }).toEqual(gabarito.indicadores[indicador.dimensao]);
        }
        expect(dto.cobertura.dimensoesAvaliadas).toBe(gabarito.cobertura);
        expect(dto.cobertura.situacao).toBe(
          gabarito.cobertura === 3 ? "COMPLETA" : "PARCIAL",
        );
        expect(Date.parse(dto.avaliadoEm)).not.toBeNaN();
        expect(dto.aviso).toContain("não constituem certificação");
        expect(JSON.stringify(dto)).not.toMatch(
          /certificad[oa]"|atestad[oa]"/i,
        );

        const xlsx = await baixar(
          gestor,
          `/api/diagnosticos/versoes/${cenario.versaoId}/exportar?formato=XLSX`,
        );
        expect(xlsx.status).toBe(200);
        const pasta = await lerXlsx(xlsx.body as Buffer);
        const folha = pasta.getWorksheet("Diagnóstico")!;
        const porRotulo = new Map<string, string[]>();
        folha.eachRow((linha) => {
          const valores = (linha.values as string[]).slice(1);
          porRotulo.set(valores[0], valores);
        });
        expect(porRotulo.get("ID da versão")![1]).toBe(cenario.versaoId);
        expect(porRotulo.get("Instante da avaliação (UTC)")![1]).toBe(
          dto.avaliadoEm,
        );
        const rotulos: Record<string, string> = {
          UNICIDADE: "Unicidade",
          COMPLETUDE: "Completude",
          VALIDADE: "Validade",
        };
        for (const indicador of dto.indicadores) {
          const linha = porRotulo.get(rotulos[indicador.dimensao])!;
          if (indicador.situacao === "AVALIADA") {
            expect(Number(linha[2])).toBe(indicador.percentual);
            expect(Number(linha[3])).toBe(indicador.numerador);
            expect(Number(linha[4])).toBe(indicador.denominador);
          } else {
            expect(linha[2]).toBe("Não avaliada");
          }
        }

        const pdf = await baixar(
          gestor,
          `/api/diagnosticos/versoes/${cenario.versaoId}/exportar?formato=pdf`,
        );
        expect(pdf.status).toBe(200);
        expect(pdf.headers["content-type"]).toBe("application/pdf");
        expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
      });
    },
  );

  it("CTN005: conteúdo de origem iniciado por =, +, - e @ permanece texto inerte no XLSX", async () => {
    const importado = await importarCsv(
      analista,
      "=cmd|calc,+soma,-1,@id\n1,2,3,4\n",
      { nome: "@SOMA(A1:A9)" },
    );
    expect(importado.status).toBe(201);
    const regra = await criarRegra(analista, '=HYPERLINK("http://exemplo")', {
      dimensao: "COMPLETUDE",
      colunas: [
        { nome: "=cmd|calc", tipo: "TEXTO" },
        { nome: "+soma", tipo: "TEXTO" },
        { nome: "-1", tipo: "TEXTO" },
        { nome: "@id", tipo: "TEXTO" },
      ],
    });
    const conjunto = await criarConjunto(analista, "-conjunto", [regra]);
    await analista.put(
      `/api/conjuntos/${conjunto}/datasets/${importado.body.id}`,
    );
    await simularEAguardar(analista, importado.body.versaoAtual.id, conjunto);

    const xlsx = await baixar(
      analista,
      `/api/diagnosticos/versoes/${importado.body.versaoAtual.id}/exportar?formato=xlsx`,
    );
    const pasta = await lerXlsx(xlsx.body as Buffer);
    const valores: string[] = [];
    pasta.eachSheet((folha) =>
      folha.eachRow((linha) =>
        linha.eachCell((celula) => {
          expect(celula.type).toBe(ExcelJS.ValueType.String);
          expect(celula.formula).toBeUndefined();
          valores.push(String(celula.value));
        }),
      ),
    );
    expect(valores).toEqual(
      expect.arrayContaining([
        "@SOMA(A1:A9)",
        "-conjunto",
        '=HYPERLINK("http://exemplo")',
        "=cmd|calc, +soma, -1, @id",
      ]),
    );
  });

  it("versão sem avaliação orienta nova simulação; versão tratada exige nova avaliação", async () => {
    const gabarito = carregarGabarito("atendimentos");
    const cenario = await montarCenario(analista, gabarito, vocabularioId);
    const sem = await gestor.get(
      `/api/diagnosticos/versoes/${cenario.versaoId}`,
    );
    expect(sem.status).toBe(404);
    expect(sem.body.erro).toBe("SEM_AVALIACAO");
    expect(sem.body.mensagem).toContain("Execute uma simulação");
    expect(
      (
        await gestor.get(
          `/api/diagnosticos/versoes/${cenario.versaoId}/exportar?formato=PDF`,
        )
      ).status,
    ).toBe(404);

    const { simulacao } = await simularEAguardar(
      analista,
      cenario.versaoId,
      cenario.conjuntoId,
    );
    const tratamento = await analista
      .post("/api/tratamentos")
      .send({ simulacaoId: simulacao.id, confirmado: true });
    expect(tratamento.status).toBe(201);
    const versaoTratada = tratamento.body.versaoSaida.id;

    // A versão de entrada mantém seu diagnóstico; a nova versão não herda números da anterior.
    expect(
      (await gestor.get(`/api/diagnosticos/versoes/${cenario.versaoId}`))
        .status,
    ).toBe(200);
    const tratadaSem = await gestor.get(
      `/api/diagnosticos/versoes/${versaoTratada}`,
    );
    expect(tratadaSem.status).toBe(404);
    expect(tratadaSem.body.erro).toBe("SEM_AVALIACAO");

    await simularEAguardar(analista, versaoTratada, cenario.conjuntoId);
    const tratada = await gestor.get(
      `/api/diagnosticos/versoes/${versaoTratada}`,
    );
    expect(tratada.status).toBe(200);
    expect(tratada.body.totalLinhas).toBe(22);
    const [unicidade, completude, validade] = tratada.body.indicadores;
    expect(unicidade).toMatchObject({
      numerador: 22,
      denominador: 22,
      percentual: 100,
    });
    // Linha com "ignorado" segue incompleta: o tratamento não infere valores.
    expect(completude).toMatchObject({
      numerador: 21,
      denominador: 22,
      percentual: 95.45,
    });
    expect(validade.denominador).toBe(22);
  });

  it("avaliação desatualizada pela edição de regra exige nova simulação", async () => {
    const cenario = await montarCenario(
      analista,
      carregarGabarito("internacoes"),
    );
    await simularEAguardar(analista, cenario.versaoId, cenario.conjuntoId);
    expect(
      (await gestor.get(`/api/diagnosticos/versoes/${cenario.versaoId}`))
        .status,
    ).toBe(200);
    await analista
      .put(`/api/regras/${cenario.regras.get("C_C1")}`)
      .send({ descricao: "nova revisão" });
    const desatualizada = await gestor.get(
      `/api/diagnosticos/versoes/${cenario.versaoId}`,
    );
    expect(desatualizada.status).toBe(409);
    expect(desatualizada.body.erro).toBe("AVALIACAO_DESATUALIZADA");
    await simularEAguardar(analista, cenario.versaoId, cenario.conjuntoId);
    expect(
      (await gestor.get(`/api/diagnosticos/versoes/${cenario.versaoId}`))
        .status,
    ).toBe(200);
  });

  it("lista versões para seleção do gestor e valida o formato de exportação", async () => {
    const versoes = await gestor.get("/api/diagnosticos/versoes");
    expect(versoes.status).toBe(200);
    expect(versoes.body.length).toBeGreaterThan(0);
    expect(versoes.body[0]).toEqual(
      expect.objectContaining({
        datasetId: expect.any(String),
        versaoId: expect.any(String),
        possuiAvaliacao: expect.any(Boolean),
      }),
    );
    const formato = await gestor.get(
      `/api/diagnosticos/versoes/${versoes.body[0].versaoId}/exportar?formato=CSV`,
    );
    expect(formato.status).toBe(400);
  });

  it("nega o diagnóstico à equipe técnica", async () => {
    const equipe = await ClienteApi.autenticado(
      contexto.app,
      PapelUsuario.EQUIPE_TECNICA,
    );
    expect((await equipe.get("/api/diagnosticos/versoes")).status).toBe(403);
  });
});
