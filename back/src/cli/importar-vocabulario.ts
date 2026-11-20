/*
 * Importa um vocabulário oficial versionado (ADR-009). Executado pela equipe de desenvolvimento.
 * Uso:
 *   npm run vocabulario:importar -- --arquivo=cid10.csv --nome=CID-10 --origem="..." \
 *     --versao="2008" --licenca="..." [--separador=;] [--coluna-codigo=codigo] [--coluna-descricao=descricao]
 */
import 'dotenv/config';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { readFile } from 'fs/promises';
import { ConfiguracaoModule } from '../config/configuracao.module';
import { DatabaseModule } from '../database/database.module';
import { VocabularioRepository } from '../rules/vocabularios/vocabulario.repository';
import { VocabularioService } from '../rules/vocabularios/vocabulario.service';

@Module({
  imports: [ConfiguracaoModule, DatabaseModule],
  providers: [VocabularioService, VocabularioRepository],
})
class ImportacaoVocabularioModule {}

function argumento(nome: string): string | undefined {
  const prefixo = `--${nome}=`;
  return process.argv.find((a) => a.startsWith(prefixo))?.slice(prefixo.length);
}

async function principal(): Promise<void> {
  const arquivo = argumento('arquivo');
  if (!arquivo) {
    throw new Error('Informe --arquivo=<caminho do CSV do vocabulário>.');
  }
  const separador = argumento('separador') === ';' ? ';' : ',';
  const contexto = await NestFactory.createApplicationContext(ImportacaoVocabularioModule, {
    logger: ['error'],
  });
  try {
    const vocabulario = await contexto.get(VocabularioService).importar(
      await readFile(arquivo),
      {
        nome: argumento('nome') ?? '',
        origem: argumento('origem') ?? '',
        versao: argumento('versao') ?? '',
        licenca: argumento('licenca') ?? '',
      },
      { separador, colunaCodigo: argumento('coluna-codigo'), colunaDescricao: argumento('coluna-descricao') },
    );
    console.log(
      `Vocabulário importado: ${vocabulario.nome} ${vocabulario.versao} (${vocabulario.totalCodigos} códigos, id ${vocabulario.id})`,
    );
  } finally {
    await contexto.close();
  }
}

principal().catch((erro: Error) => {
  console.error(erro.message);
  process.exit(1);
});
