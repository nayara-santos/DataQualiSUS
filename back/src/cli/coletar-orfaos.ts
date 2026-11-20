/*
 * Coleta de arquivos CSV órfãos (ADR-003/ADR-004; DA02 da P3): remove arquivos do armazenamento
 * que nenhuma versão referencia, respeitando uma carência para gravações em andamento.
 * Uso: npm run armazenamento:coletar-orfaos [-- --carencia-minutos=60]
 */
import 'dotenv/config';
import { Client } from 'pg';
import { carregarConfiguracao } from '../config/configuracao';
import { ArmazenamentoArquivosService } from '../datasets/armazenamento-arquivos.service';

async function principal(): Promise<void> {
  const configuracao = carregarConfiguracao(process.env);
  const argumento = process.argv.find((a) => a.startsWith('--carencia-minutos='));
  const carenciaMinutos = argumento ? Number(argumento.split('=')[1]) : 60;
  if (!Number.isFinite(carenciaMinutos) || carenciaMinutos < 1) {
    throw new Error('Carência inválida: informe ao menos 1 minuto.');
  }
  const cliente = new Client({ connectionString: configuracao.bancoUrl });
  await cliente.connect();
  try {
    const linhas = await cliente.query<{ caminho_arquivo: string }>(
      'SELECT DISTINCT caminho_arquivo FROM versao_dataset',
    );
    const referenciados = new Set(linhas.rows.map((l) => l.caminho_arquivo));
    const armazenamento = new ArmazenamentoArquivosService(configuracao);
    const removidos = await armazenamento.coletarOrfaos(referenciados, carenciaMinutos * 60_000);
    console.log(removidos.length ? `Removidos: ${removidos.join(', ')}` : 'Nenhum arquivo órfão encontrado.');
  } finally {
    await cliente.end();
  }
}

principal().catch((erro: Error) => {
  console.error(erro.message);
  process.exit(1);
});
