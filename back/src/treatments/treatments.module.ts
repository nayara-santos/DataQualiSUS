import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DatasetsModule } from '../datasets/datasets.module';
import { SimulationsModule } from '../simulations/simulations.module';
import { TratamentoController } from './tratamento.controller';
import { TratamentoService } from './tratamento.service';

@Module({
  imports: [DatasetsModule, SimulationsModule, AuditModule],
  controllers: [TratamentoController],
  providers: [TratamentoService],
})
export class TreatmentsModule {}
