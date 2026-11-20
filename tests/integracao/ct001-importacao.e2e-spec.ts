/*
 * CT001 (parte de importação) e CTN001/CTN005 aplicáveis — RF001, RNF001, RNF005, ADR-003.
 */
import { readdir, readFile } from "fs/promises";
import * as path from "path";
import { PapelUsuario } from "../../back/src/auth/papel-usuario";
import { ArmazenamentoArquivosService } from "../../back/src/datasets/armazenamento-arquivos.service";
import { DatasetRepository } from "../../back/src/datasets/dataset.repository";
import {
  ClienteApi,
  ContextoTeste,
  criarAplicacao,
  criarContas,
} from "./suporte/aplicacao";
import {
  contarPersistencia,
  csvComTamanho,
  importarCsv,
  sha256,
} from "./suporte/datasets";

describe("CT001 — importação de datasets CSV", () => {
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

  async function arquivosArmazenados(): Promise<string[]> {
    return (await readdir(contexto.armazenamentoDir)).filter(
      (n) => !n.startsWith("."),
    );
  }

  it("importa CSV válido, grava o original byte a byte e registra a versão 1", async () => {
    const conteudo = Buffer.from(
      "﻿id;nome;idade\n1;Ana;30\n2;Bia;41\n3;Caio;27\n",
      "utf8",
    );
    const resposta = await importarCsv(analista, conteudo, {
      nome: "Atendimentos 2025",
      descricao: "Base sintética",
      separador: "PONTO_E_VIRGULA",
    });
    expect(resposta.status).toBe(201);
    expect(resposta.body).toMatchObject({
      nome: "Atendimentos 2025",
      descricao: "Base sintética",
      situacao: "ATIVO",
      totalVersoes: 1,
      versaoAtual: {
        numero: 1,
        origem: "IMPORTACAO",
        colunas: ["id", "nome", "idade"],
        totalRegistros: 3,
        totalColunas: 3,
        separador: ";",
        hashSha256: sha256(conteudo),
        tamanhoBytes: conteudo.length,
        versaoPredecessoraId: null,
      },
    });
    const gravado = await readFile(
      path.join(contexto.armazenamentoDir, `${sha256(conteudo)}.csv`),
    );
    expect(gravado.equals(conteudo)).toBe(true);
  });

  it(`aceita exatamente 10.000.000 bytes`, async () => {
    const conteudo = csvComTamanho(10_000_000);
    const resposta = await importarCsv(analista, conteudo, {
      nome: "Limite exato",
    });
    expect(resposta.status).toBe(201);
    expect(resposta.body.versaoAtual.tamanhoBytes).toBe(10_000_000);
  });

  describe("rejeições sem persistência parcial", () => {
    const casos: [string, Buffer, string, number, string][] = [
      [
        "limite de bytes + 1",
        csvComTamanho(10_000_001),
        "a.csv",
        422,
        "LIMITE_BYTES_EXCEDIDO",
      ],
      [
        "arquivo muito acima do limite",
        csvComTamanho(10_002_000),
        "a.csv",
        413,
        "LIMITE_BYTES_EXCEDIDO",
      ],
      ["arquivo vazio", Buffer.alloc(0), "a.csv", 422, "ARQUIVO_VAZIO"],
      [
        "cabeçalho duplicado",
        Buffer.from("a,a\n1,2\n"),
        "a.csv",
        422,
        "CABECALHO_DUPLICADO",
      ],
      [
        "estrutura inconsistente",
        Buffer.from("a,b\n1,2\n3\n"),
        "a.csv",
        422,
        "ESTRUTURA_INCONSISTENTE",
      ],
      ["sem registros", Buffer.from("a,b\n"), "a.csv", 422, "SEM_REGISTROS"],
      [
        "codificação inválida",
        Buffer.from([0x61, 0x0a, 0xe9, 0x0a]),
        "a.csv",
        422,
        "CODIFICACAO_INVALIDA",
      ],
      [
        "binário renomeado para .csv",
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]),
        "foto.csv",
        422,
        "CODIFICACAO_INVALIDA",
      ],
      [
        "extensão diferente",
        Buffer.from("a\n1\n"),
        "base.xlsx",
        422,
        "EXTENSAO_INVALIDA",
      ],
    ];

    it.each(casos)(
      "rejeita %s",
      async (_caso, conteudo, nome, status, erro) => {
        const antes = await contarPersistencia(contexto);
        const arquivosAntes = await arquivosArmazenados();
        const resposta = await importarCsv(analista, conteudo, {
          arquivo: nome,
        });
        expect(resposta.status).toBe(status);
        expect(resposta.body.erro).toBe(erro);
        expect(resposta.body.mensagem).toEqual(expect.any(String));
        expect(await contarPersistencia(contexto)).toEqual(antes);
        expect(await arquivosArmazenados()).toEqual(arquivosAntes);
      },
    );

    it("rejeita requisição sem arquivo e sem nome", async () => {
      const semArquivo = await analista
        .post("/api/datasets")
        .field("nome", "x");
      expect(semArquivo.status).toBe(400);
      const semNome = await analista
        .post("/api/datasets")
        .attach("arquivo", Buffer.from("a\n1\n"), "a.csv");
      expect(semNome.status).toBe(400);
      const separadorInvalido = await importarCsv(analista, "a\n1\n", {
        separador: "TAB" as never,
      });
      expect(separadorInvalido.status).toBe(400);
    });
  });

  it("CTN001: falha na persistência da versão não deixa dataset parcial e o original permanece íntegro", async () => {
    const repositorio = contexto.app.get(DatasetRepository);
    const espiao = jest
      .spyOn(repositorio, "inserirVersao")
      .mockRejectedValueOnce(new Error("conexão perdida"));
    const antes = await contarPersistencia(contexto);
    const conteudo = Buffer.from("cod,valor\nA1,10\n");
    const resposta = await importarCsv(analista, conteudo, {
      nome: "Falha injetada",
    });
    espiao.mockRestore();

    expect(resposta.status).toBe(500);
    expect(resposta.body.mensagem).not.toContain("conexão perdida");
    expect(await contarPersistencia(contexto)).toEqual(antes);
    const nomes = await contexto.banco.consultar(
      "SELECT 1 FROM dataset WHERE nome = $1",
      ["Falha injetada"],
    );
    expect(nomes).toHaveLength(0);

    // O arquivo já gravado fica sem referência e é removido pela coleta de órfãos (ADR-004).
    const armazenamento = contexto.app.get(ArmazenamentoArquivosService);
    const referenciados = await repositorio.listarCaminhosReferenciados();
    const removidos = await armazenamento.coletarOrfaos(referenciados, 0);
    expect(removidos).toEqual([`${sha256(conteudo)}.csv`]);
    for (const caminho of referenciados) {
      expect(await arquivosArmazenados()).toContain(caminho);
    }
  });

  describe("CTN005 — entradas hostis tratadas como dado", () => {
    it("ignora diretórios no nome do arquivo e grava pelo hash", async () => {
      const conteudo = Buffer.from("a\n../\n");
      const resposta = await importarCsv(analista, conteudo, {
        arquivo: "../../../etc/cron.d/x.csv",
      });
      expect(resposta.status).toBe(201);
      expect(resposta.body.versaoAtual.nomeArquivoOriginal).toBe("x.csv");
      expect(await arquivosArmazenados()).toContain(`${sha256(conteudo)}.csv`);
    });

    it("armazena literalmente texto de injeção SQL e HTML em metadados e conteúdo", async () => {
      const nome = "Base'); DROP TABLE dataset; --";
      const conteudo = Buffer.from(
        "id,texto\n1,<script>alert(1)</script>\n2,=1+1\n3,@SOMA(A1)\n",
      );
      const resposta = await importarCsv(analista, conteudo, {
        nome,
        descricao: "<b>negrito</b>",
      });
      expect(resposta.status).toBe(201);
      expect(resposta.body.nome).toBe(nome);
      expect(resposta.body.descricao).toBe("<b>negrito</b>");
      const [linha] = await contexto.banco.consultar<{ total: string }>(
        "SELECT count(*) AS total FROM dataset",
      );
      expect(Number(linha.total)).toBeGreaterThan(0);
    });

    it("rejeita campos não previstos no formulário", async () => {
      const resposta = await analista
        .post("/api/datasets")
        .field("nome", "x")
        .field("situacao", "EXCLUIDO_LOGICAMENTE")
        .attach("arquivo", Buffer.from("a\n1\n"), "a.csv");
      expect(resposta.status).toBe(400);
    });
  });

  it("nega importação ao gestor e à equipe técnica", async () => {
    for (const papel of [PapelUsuario.GESTOR, PapelUsuario.EQUIPE_TECNICA]) {
      const cliente = await ClienteApi.autenticado(contexto.app, papel);
      const resposta = await importarCsv(cliente, "a\n1\n");
      expect(resposta.status).toBe(403);
    }
  });
});
