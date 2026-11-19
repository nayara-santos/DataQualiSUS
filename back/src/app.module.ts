import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfiguracaoModule } from './config/configuracao.module';
import { DatabaseModule } from './database/database.module';
import { SaudeController } from './saude/saude.controller';

@Module({
  imports: [ConfiguracaoModule, DatabaseModule, AuthModule],
  controllers: [SaudeController],
})
export class AppModule {}
