/*
 * CT007 — Autenticação e sessão (RF007, UC-08, ADR-006) e parte de CTN003 (armazenamento de senhas).
 */
import request from "supertest";
import { PapelUsuario } from "../../back/src/auth/papel-usuario";
import {
  ClienteApi,
  ContextoTeste,
  criarAplicacao,
  criarContas,
  EMAILS,
  SENHA_PADRAO,
} from "./suporte/aplicacao";

describe("CT007 — autenticação e sessão", () => {
  let contexto: ContextoTeste;

  beforeAll(async () => {
    contexto = await criarAplicacao();
    await criarContas(contexto);
  });

  afterAll(() => contexto.encerrar());

  it.each(Object.values(PapelUsuario))(
    "entra com credenciais válidas do perfil %s",
    async (papel) => {
      const cliente = new ClienteApi(contexto.app);
      const resposta = await cliente.entrar(EMAILS[papel], SENHA_PADRAO);
      expect(resposta.status).toBe(200);
      expect(resposta.body.usuario).toMatchObject({
        email: EMAILS[papel],
        papel,
      });
      expect(resposta.body.csrfToken).toEqual(expect.any(String));
      expect(resposta.body.usuario.senha_hash).toBeUndefined();
      const cookie = (resposta.headers["set-cookie"] as unknown as string[])[0];
      expect(cookie).toMatch(/^dq_sessao=/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Secure/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
    },
  );

  it("rejeita senha inválida e e-mail inexistente com a mesma mensagem genérica", async () => {
    const senhaErrada = await new ClienteApi(contexto.app).entrar(
      EMAILS.ANALISTA,
      "senha-errada",
    );
    const emailInexistente = await new ClienteApi(contexto.app).entrar(
      "ninguem@teste.local",
      SENHA_PADRAO,
    );
    expect(senhaErrada.status).toBe(401);
    expect(emailInexistente.status).toBe(401);
    expect(senhaErrada.body.mensagem).toBe("Credenciais inválidas.");
    expect(emailInexistente.body.mensagem).toBe(senhaErrada.body.mensagem);
    expect(senhaErrada.headers["set-cookie"]).toBeUndefined();
  });

  it("valida o corpo da entrada no servidor", async () => {
    const resposta = await request(contexto.app.getHttpServer())
      .post("/api/auth/entrar")
      .send({ email: "invalido", senha: "", extra: "x" });
    expect(resposta.status).toBe(400);
  });

  it("bloqueia acesso direto sem sessão e com cookie forjado", async () => {
    expect(
      (await request(contexto.app.getHttpServer()).get("/api/auth/sessao"))
        .status,
    ).toBe(401);
    const forjado = await request(contexto.app.getHttpServer())
      .get("/api/auth/sessao")
      .set("Cookie", "dq_sessao=token-inexistente");
    expect(forjado.status).toBe(401);
  });

  it("mantém a sessão entre requisições e a invalida no logout", async () => {
    const cliente = await ClienteApi.autenticado(
      contexto.app,
      PapelUsuario.GESTOR,
    );
    const sessao = await cliente.get("/api/auth/sessao");
    expect(sessao.status).toBe(200);
    expect(sessao.body.usuario.papel).toBe(PapelUsuario.GESTOR);

    const saida = await cliente.post("/api/auth/sair");
    expect(saida.status).toBe(204);

    const depois = await cliente.get("/api/auth/sessao");
    expect(depois.status).toBe(401);
    const encerradas = await contexto.banco.consultar<{ total: string }>(
      "SELECT count(*) AS total FROM sessao WHERE usuario_id = $1 AND encerrada_em IS NOT NULL",
      [cliente.usuarioId],
    );
    expect(Number(encerradas[0].total)).toBeGreaterThanOrEqual(1);
  });

  it("recusa sessão expirada", async () => {
    const cliente = await ClienteApi.autenticado(
      contexto.app,
      PapelUsuario.ANALISTA,
    );
    await contexto.banco.consultar(
      "UPDATE sessao SET expira_em = now() - interval '1 minute' WHERE usuario_id = $1",
      [cliente.usuarioId],
    );
    expect((await cliente.get("/api/auth/sessao")).status).toBe(401);
  });

  it("CTN003: senhas iguais em contas distintas têm hashes bcrypt distintos e nenhuma senha em texto puro", async () => {
    const linhas = await contexto.banco.consultar<{ senha_hash: string }>(
      "SELECT senha_hash FROM usuario",
    );
    const hashes = linhas.map((l) => l.senha_hash);
    expect(new Set(hashes).size).toBe(hashes.length);
    for (const hash of hashes) {
      expect(hash).toMatch(/^\$2[aby]\$/);
      expect(hash).not.toContain(SENHA_PADRAO);
    }
    const tokens = await contexto.banco.consultar<{ token_hash: string }>(
      "SELECT token_hash FROM sessao",
    );
    for (const t of tokens) {
      expect(t.token_hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("mantém a rota de saúde pública", async () => {
    const resposta = await request(contexto.app.getHttpServer()).get(
      "/api/saude",
    );
    expect(resposta.status).toBe(200);
    expect(resposta.body.banco).toBe("disponivel");
  });
});
