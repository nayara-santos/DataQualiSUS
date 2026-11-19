import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { FiltroExcecoes } from './common/filtros/filtro-excecoes';
import { Configuracao } from './config/configuracao';

/**
 * Configurações transversais aplicadas tanto na execução quanto nos testes de integração,
 * garantindo que os testes exercitem o mesmo pipeline de validação e erros.
 */
export function configurarAplicacao(app: INestApplication, configuracao: Configuracao): void {
  const express = app as NestExpressApplication;
  express.disable('x-powered-by');
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
    }),
  );
  app.useGlobalFilters(new FiltroExcecoes());
  app.enableCors({
    origin: configuracao.corsOrigem,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
}
