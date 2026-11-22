import { Module } from '@nestjs/common';
import { DatasetsModule } from '../datasets/datasets.module';
import { RulesModule } from '../rules/rules.module';
import { SimulationsModule } from '../simulations/simulations.module';
import { DiagnosticoController } from './diagnostico.controller';
import { DiagnosticoRepository } from './diagnostico.repository';
import { DiagnosticoService } from './diagnostico.service';
import { ExportacaoModule } from './exportacao/exportacao.module';

@Module({
  imports: [DatasetsModule, RulesModule, SimulationsModule, ExportacaoModule],
  controllers: [DiagnosticoController],
  providers: [DiagnosticoService, DiagnosticoRepository],
})
export class DiagnosticsModule {}
