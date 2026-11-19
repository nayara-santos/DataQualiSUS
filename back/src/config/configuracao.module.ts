import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CONFIGURACAO, carregarConfiguracao } from './configuracao';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ envFilePath: ['.env'], ignoreEnvFile: process.env.NODE_ENV === 'test' })],
  providers: [{ provide: CONFIGURACAO, useFactory: () => carregarConfiguracao(process.env) }],
  exports: [CONFIGURACAO],
})
export class ConfiguracaoModule {}
