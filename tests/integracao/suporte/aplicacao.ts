import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import * as path from "path";
import request from "supertest";
import { AppModule } from "../../../back/src/app.module";
import { configurarAplicacao } from "../../../back/src/app.setup";
import { PapelUsuario } from "../../../back/src/auth/papel-usuario";
import { SenhaService } from "../../../back/src/auth/senha.service";
import { UsuarioRepository } from "../../../back/src/auth/usuario.repository";
import {
  CONFIGURACAO,
  Configuracao,
} from "../../../back/src/config/configuracao";
import { DatabaseService } from "../../../back/src/database/database.service";

export const SENHA_PADRAO = "senha-de-teste-123";

export const EMAILS: Record<PapelUsuario, string> = {
  [PapelUsuario.ANALISTA]: "analista@teste.local",
  [PapelUsuario.GESTOR]: "gestor@teste.local",
  [PapelUsuario.EQUIPE_TECNICA]: "equipe@teste.local",
};

export interface ContextoTeste {
  app: INestApplication;
  banco: DatabaseService;
  configuracao: Configuracao;
  armazenamentoDir: string;
  encerrar(): Promise<void>;
}

/** Sobe a aplicação completa (mesmos módulos, pipes e filtros da execução real). */
export async function criarAplicacao(
  variaveis: Record<string, string> = {},
): Promise<ContextoTeste> {
  const armazenamentoDir = await mkdtemp(
    path.join(tmpdir(), "dataqualisus-teste-"),
  );
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    ARMAZENAMENTO_DIR: armazenamentoDir,
    BCRYPT_CUSTO: "4",
    SIMULACAO_LIMITE_MS: "60000",
    SIMULACAO_POOL_TAMANHO: "2",
    ...variaveis,
  });
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = modulo.createNestApplication({ logger: false });
  const configuracao = app.get<Configuracao>(CONFIGURACAO);
  configurarAplicacao(app, configuracao);
  await app.init();
  const banco = app.get(DatabaseService);
  await limparBanco(banco);
  return {
    app,
    banco,
    configuracao,
    armazenamentoDir,
    async encerrar() {
      await app.close();
      await rm(armazenamentoDir, { recursive: true, force: true });
    },
  };
}

/** Esvazia todas as tabelas da aplicação entre arquivos de teste (TRUNCATE não aciona gatilhos de linha). */
export async function limparBanco(banco: DatabaseService): Promise<void> {
  const tabelas = await banco.consultar<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migracoes'",
  );
  if (tabelas.length) {
    await banco.consultar(
      `TRUNCATE ${tabelas.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
    );
  }
}

export async function criarContas(
  contexto: ContextoTeste,
  senha = SENHA_PADRAO,
): Promise<void> {
  const senhas = contexto.app.get(SenhaService);
  const usuarios = contexto.app.get(UsuarioRepository);
  for (const papel of Object.values(PapelUsuario)) {
    await usuarios.salvar({
      nome: `Conta ${papel}`,
      email: EMAILS[papel],
      senhaHash: await senhas.gerarHash(senha),
      papel,
    });
  }
}

/** Cliente HTTP que reenvia o cookie de sessão e o token CSRF, como faria a SPA. */
export class ClienteApi {
  cookie?: string;
  csrf?: string;
  usuarioId?: string;

  constructor(private readonly app: INestApplication) {}

  static async autenticado(
    app: INestApplication,
    papel: PapelUsuario,
    senha = SENHA_PADRAO,
  ): Promise<ClienteApi> {
    const cliente = new ClienteApi(app);
    await cliente.entrar(EMAILS[papel], senha);
    return cliente;
  }

  async entrar(email: string, senha: string): Promise<request.Response> {
    const resposta = await request(this.app.getHttpServer())
      .post("/api/auth/entrar")
      .send({ email, senha });
    const setCookie = resposta.headers["set-cookie"] as unknown as
      | string[]
      | undefined;
    if (resposta.status === 200 && setCookie) {
      this.cookie = setCookie[0].split(";")[0];
      this.csrf = resposta.body.csrfToken;
      this.usuarioId = resposta.body.usuario.id;
    }
    return resposta;
  }

  private preparar(teste: request.Test, comCsrf = true): request.Test {
    if (this.cookie) {
      teste.set("Cookie", this.cookie);
    }
    if (comCsrf && this.csrf) {
      teste.set("X-CSRF-Token", this.csrf);
    }
    return teste;
  }

  get(url: string): request.Test {
    return this.preparar(request(this.app.getHttpServer()).get(url));
  }
  post(url: string, comCsrf = true): request.Test {
    return this.preparar(request(this.app.getHttpServer()).post(url), comCsrf);
  }
  put(url: string, comCsrf = true): request.Test {
    return this.preparar(request(this.app.getHttpServer()).put(url), comCsrf);
  }
  patch(url: string, comCsrf = true): request.Test {
    return this.preparar(request(this.app.getHttpServer()).patch(url), comCsrf);
  }
  delete(url: string, comCsrf = true): request.Test {
    return this.preparar(
      request(this.app.getHttpServer()).delete(url),
      comCsrf,
    );
  }
}
