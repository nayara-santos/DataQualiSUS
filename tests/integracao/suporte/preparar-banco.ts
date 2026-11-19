/*
 * Preparação global dos testes de integração: recria o banco de testes no PostgreSQL 16 e
 * aplica as migrações versionadas em /database/migrations.
 */
import { Client } from "pg";
import { aplicarMigracoes } from "../../../back/src/database/migrador";

export const URL_BANCO_TESTE =
  process.env.TEST_DATABASE_URL ??
  "postgres://dataqualisus:dataqualisus_dev@localhost:55432/dataqualisus_teste";

export default async function prepararBanco(): Promise<void> {
  const url = new URL(URL_BANCO_TESTE);
  const nomeBanco = url.pathname.replace(/^\//, "");
  if (!/^[a-z0-9_]+$/.test(nomeBanco)) {
    throw new Error("Nome do banco de testes inválido.");
  }
  const urlAdministrativa = new URL(URL_BANCO_TESTE);
  urlAdministrativa.pathname = "/postgres";
  const admin = new Client({ connectionString: urlAdministrativa.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${nomeBanco} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${nomeBanco}`);
  } finally {
    await admin.end();
  }
  await aplicarMigracoes(URL_BANCO_TESTE);
  process.env.TEST_DATABASE_URL = URL_BANCO_TESTE;
}
