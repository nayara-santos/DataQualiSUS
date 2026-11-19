import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurarAplicacao } from './app.setup';
import { CONFIGURACAO, Configuracao } from './config/configuracao';

async function iniciar(): Promise<void> {
  // Logs sem corpo de requisição: senhas e conteúdo de datasets não são registrados (ADR-006).
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  const configuracao = app.get<Configuracao>(CONFIGURACAO);
  configurarAplicacao(app, configuracao);
  app.enableShutdownHooks();
  await app.listen(configuracao.porta);
  Logger.log(`API DataQualiSUS ouvindo na porta ${configuracao.porta}`, 'Inicializacao');
}

void iniciar();
