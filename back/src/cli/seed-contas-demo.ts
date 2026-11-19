/*
 * Provisiona as contas de demonstração dos três perfis (P1, seção 8.3: não há autocadastro).
 * As senhas vêm de variáveis de ambiente e nunca são versionadas. Uso: npm run db:seed
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { Client } from 'pg';
import { PapelUsuario } from '../auth/papel-usuario';

const CONTAS: { nome: string; email: string; papel: PapelUsuario; variavel: string }[] = [
  {
    nome: 'Analista de demonstração',
    email: 'analista@dataqualisus.local',
    papel: PapelUsuario.ANALISTA,
    variavel: 'SEED_SENHA_ANALISTA',
  },
  {
    nome: 'Gestor de demonstração',
    email: 'gestor@dataqualisus.local',
    papel: PapelUsuario.GESTOR,
    variavel: 'SEED_SENHA_GESTOR',
  },
  {
    nome: 'Equipe técnica de demonstração',
    email: 'equipe.tecnica@dataqualisus.local',
    papel: PapelUsuario.EQUIPE_TECNICA,
    variavel: 'SEED_SENHA_EQUIPE_TECNICA',
  },
];

async function principal(): Promise<void> {
  const url = process.env.DATABASE_URL_MIGRACAO || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Defina DATABASE_URL_MIGRACAO (ou DATABASE_URL).');
  }
  const custo = Number(process.env.BCRYPT_CUSTO ?? 12);
  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  try {
    for (const conta of CONTAS) {
      const senha = process.env[conta.variavel];
      if (!senha || senha.length < 8) {
        throw new Error(`Defina ${conta.variavel} com pelo menos 8 caracteres.`);
      }
      const hash = await bcrypt.hash(senha, custo);
      await cliente.query(
        `INSERT INTO usuario (nome, email, senha_hash, papel) VALUES ($1, $2, $3, $4)
         ON CONFLICT (lower(email)) DO UPDATE SET nome = EXCLUDED.nome, senha_hash = EXCLUDED.senha_hash,
           papel = EXCLUDED.papel, ativo = TRUE`,
        [conta.nome, conta.email, hash, conta.papel],
      );
      console.log(`Conta provisionada: ${conta.email} (${conta.papel})`);
    }
  } finally {
    await cliente.end();
  }
}

principal().catch((erro: Error) => {
  console.error(erro.message);
  process.exit(1);
});
