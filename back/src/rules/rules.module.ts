import { Module } from '@nestjs/common';
import { DatasetsModule } from '../datasets/datasets.module';
import { ConjuntoService } from './conjunto.service';
import { NotificadorRevisaoConjunto } from './notificador-revisao';
import { RegraService } from './regra.service';
import { RegrasController } from './regras.controller';
import { RegrasRepository } from './regras.repository';
import { VocabulariosModule } from './vocabularios/vocabularios.module';

@Module({
  imports: [DatasetsModule, VocabulariosModule],
  controllers: [RegrasController],
  providers: [RegraService, ConjuntoService, RegrasRepository, NotificadorRevisaoConjunto],
  exports: [RegraService, ConjuntoService, NotificadorRevisaoConjunto, VocabulariosModule],
})
export class RulesModule {}
