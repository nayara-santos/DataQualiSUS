import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfiguracaoModule } from './config/configuracao.module';
import { DatabaseModule } from './database/database.module';
import { DatasetsModule } from './datasets/datasets.module';
import { RulesModule } from './rules/rules.module';
import { SimulationsModule } from './simulations/simulations.module';
import { SaudeController } from './saude/saude.controller';

@Module({
  imports: [ConfiguracaoModule, DatabaseModule, AuthModule, DatasetsModule, RulesModule, SimulationsModule],
  controllers: [SaudeController],
})
export class AppModule {}
