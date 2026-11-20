/*
 * CTN003 — Segurança de acesso (RNF003, ADR-006): cada rota protegida é testada sem sessão,
 * após logout e com perfil vedado, além da exigência de token CSRF.
 * As rotas são descobertas a partir dos controladores, portanto novas rotas entram no teste
 * automaticamente.
 */
import request from "supertest";
import { MATRIZ_PERMISSOES } from "../../back/src/auth/matriz-permissoes";
import { PapelUsuario } from "../../back/src/auth/papel-usuario";
import {
  ClienteApi,
  ContextoTeste,
  criarAplicacao,
  criarContas,
} from "./suporte/aplicacao";
import { listarRotas, RotaDescoberta } from "./suporte/rotas";

function chamar(
  cliente: ClienteApi | null,
  contexto: ContextoTeste,
  rota: RotaDescoberta,
): request.Test {
  if (!cliente) {
    return request(contexto.app.getHttpServer())[rota.metodo](rota.caminho);
  }
  return cliente[rota.metodo](rota.caminho);
}

describe("CTN003 — autorização por rota", () => {
  let contexto: ContextoTeste;
  let rotas: RotaDescoberta[];
  let protegidas: RotaDescoberta[];

  beforeAll(async () => {
    contexto = await criarAplicacao();
    await criarContas(contexto);
    rotas = listarRotas(contexto.app);
    protegidas = rotas.filter((r) => !r.publica);
  });

  afterAll(() => contexto.encerrar());

  it("descobre as rotas e somente entrada e saúde são públicas", () => {
    expect(protegidas.length).toBeGreaterThan(0);
    expect(
      rotas
        .filter((r) => r.publica)
        .map((r) => r.caminho)
        .sort(),
    ).toEqual(["/api/auth/entrar", "/api/saude"]);
  });

  it("toda rota protegida declara uma operação da matriz", () => {
    const semOperacao = protegidas.filter(
      (r) => !r.operacao || !MATRIZ_PERMISSOES[r.operacao],
    );
    expect(semOperacao).toEqual([]);
  });

  it("nega todas as rotas protegidas sem sessão (401)", async () => {
    for (const rota of protegidas) {
      const resposta = await chamar(null, contexto, rota);
      expect({
        rota: `${rota.metodo} ${rota.caminho}`,
        status: resposta.status,
      }).toEqual({
        rota: `${rota.metodo} ${rota.caminho}`,
        status: 401,
      });
    }
  });

  it("nega todas as rotas protegidas após logout (401)", async () => {
    const cliente = await ClienteApi.autenticado(
      contexto.app,
      PapelUsuario.ANALISTA,
    );
    expect((await cliente.post("/api/auth/sair")).status).toBe(204);
    for (const rota of protegidas) {
      const resposta = await chamar(cliente, contexto, rota);
      expect(`${rota.metodo} ${rota.caminho} ${resposta.status}`).toBe(
        `${rota.metodo} ${rota.caminho} 401`,
      );
    }
  });

  it.each(Object.values(PapelUsuario))(
    "nega com 403 as operações vedadas ao perfil %s",
    async (papel) => {
      const cliente = await ClienteApi.autenticado(contexto.app, papel);
      const vedadas = protegidas.filter(
        (r) => !MATRIZ_PERMISSOES[r.operacao!].includes(papel),
      );
      for (const rota of vedadas) {
        const resposta = await chamar(cliente, contexto, rota);
        expect(`${rota.metodo} ${rota.caminho} ${resposta.status}`).toBe(
          `${rota.metodo} ${rota.caminho} 403`,
        );
        expect(resposta.body.erro).toBe("OPERACAO_NAO_PERMITIDA");
      }
    },
  );

  it("exige token CSRF nas operações que alteram estado", async () => {
    const cliente = await ClienteApi.autenticado(
      contexto.app,
      PapelUsuario.ANALISTA,
    );
    const semCsrf = await cliente.post("/api/auth/sair", false);
    expect(semCsrf.status).toBe(403);
    expect(semCsrf.body.erro).toBe("CSRF_INVALIDO");
    const csrfErrado = await cliente
      .post("/api/auth/sair", false)
      .set("X-CSRF-Token", "outro");
    expect(csrfErrado.status).toBe(403);
    // A sessão continua válida, pois a operação foi recusada.
    expect((await cliente.get("/api/auth/sessao")).status).toBe(200);
  });
});
