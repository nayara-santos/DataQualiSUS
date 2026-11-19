/* Aplica as migrações SQL de /database/migrations. Uso: npm run db:migrar */
import 'dotenv/config';
import { aplicarMigracoes } from '../database/migrador';

async function principal(): Promise<void> {
  const url = process.env.DATABASE_URL_MIGRACAO || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Defina DATABASE_URL_MIGRACAO (ou DATABASE_URL).');
  }
  const aplicadas = await aplicarMigracoes(url);
  console.log(aplicadas.length ? `Migrações aplicadas: ${aplicadas.join(', ')}` : 'Banco já atualizado.');
}

principal().catch((erro: Error) => {
  console.error(erro.message);
  process.exit(1);
});
