/*
 * CT003 (tempo limite) e CTN001 (timeout) — RF003, ADR-008: ao atingir o limite contado a partir do
 * aceite, a simulação é cancelada, marcada TEMPO_ESGOTADO e não pode ser aplicada.
 * O limite é reduzido por configuração para tornar o ensaio determinístico.
 */
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
  simularEAguardar,
} from "./suporte/cenarios";

describe("CT003 — tempo limite da simulação", () => {
  let contexto: ContextoTeste;
  let analista: ClienteApi;

  beforeAll(async () => {
    contexto = await criarAplicacao({ SIMULACAO_LIMITE_MS: "1" });
    await criarContas(contexto);
    analista = await ClienteApi.autenticado(
      contexto.app,
      PapelUsuario.ANALISTA,
    );
  });

  afterAll(() => contexto.encerrar());

  it("cancela ao atingir o limite, informa o tempo esgotado e mantém a aplicação desabilitada", async () => {
    const cenario = await montarCenario(
      analista,
      carregarGabarito("vacinacao"),
    );
    const antes = await contarPersistencia(contexto);
    const { simulacao } = await simularEAguardar(
      analista,
      cenario.versaoId,
      cenario.conjuntoId,
    );

    expect(simulacao.status).toBe("TEMPO_ESGOTADO");
    expect(simulacao.mensagem).toContain("cancelada");
    expect(simulacao.limiteMs).toBe(1);
    expect(simulacao.vigente).toBe(false);
    expect(simulacao.aplicavel).toBe(false);
    expect(simulacao.resultados).toEqual([]);
    expect(simulacao.totalLinhas).toBeNull();
    expect(await contarPersistencia(contexto)).toEqual(antes);

    const [linha] = await contexto.banco.consultar<{ hash_sha256: string }>(
      "SELECT hash_sha256 FROM versao_dataset WHERE id = $1",
      [cenario.versaoId],
    );
    expect(linha.hash_sha256).toBe(sha256(cenario.conteudo));
  });
});
