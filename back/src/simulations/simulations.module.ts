import { Module } from '@nestjs/common';
import * as path from 'path';
import { CONFIGURACAO, Configuracao } from '../config/configuracao';
import { DatasetsModule } from '../datasets/datasets.module';
import { RulesModule } from '../rules/rules.module';
import { ExecutorComLimite } from './executor-com-limite';
import { SimulacaoController } from './simulacao.controller';
import { SimulacaoRepository } from './simulacao.repository';
import { EXECUTOR_SIMULACAO, SimulacaoService } from './simulacao.service';

/** Caminho do worker compilado (.js) ou do código-fonte (.ts) quando executado via ts-node/Jest. */
export function caminhoWorkerSimulacao(): string {
  const extensao = __filename.endsWith('.ts') ? '.ts' : '.js';
  return path.join(__dirname, `simulacao.worker${extensao}`);
}

@Module({
  imports: [DatasetsModule, RulesModule],
  controllers: [SimulacaoController],
  providers: [
    SimulacaoService,
    SimulacaoRepository,
    {
      provide: EXECUTOR_SIMULACAO,
      inject: [CONFIGURACAO],
      useFactory: (configuracao: Configuracao) =>
        new ExecutorComLimite(caminhoWorkerSimulacao(), configuracao.simulacaoPoolTamanho),
    },
  ],
  exports: [SimulacaoService, SimulacaoRepository],
})
export class SimulationsModule {}
