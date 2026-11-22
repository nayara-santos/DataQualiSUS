import { Module } from '@nestjs/common';
import { DatasetsModule } from '../datasets/datasets.module';
import { ExportacaoModule } from '../diagnostics/exportacao/exportacao.module';
import { AuditoriaController } from './auditoria.controller';
import { AuditoriaRepository } from './auditoria.repository';
import { AuditoriaService } from './auditoria.service';

@Module({
  imports: [DatasetsModule, ExportacaoModule],
  controllers: [AuditoriaController],
  providers: [AuditoriaService, AuditoriaRepository],
  exports: [AuditoriaService],
})
export class AuditModule {}
