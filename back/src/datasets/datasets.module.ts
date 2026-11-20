import { Module } from '@nestjs/common';
import { ArmazenamentoArquivosService } from './armazenamento-arquivos.service';
import { DatasetController } from './dataset.controller';
import { DatasetRepository } from './dataset.repository';
import { DatasetService } from './dataset.service';
import { ValidadorCsv } from './validador-csv';
import { VersionamentoService } from './versionamento.service';

@Module({
  controllers: [DatasetController],
  providers: [
    DatasetService,
    DatasetRepository,
    ValidadorCsv,
    ArmazenamentoArquivosService,
    VersionamentoService,
  ],
  exports: [DatasetRepository, ArmazenamentoArquivosService, VersionamentoService],
})
export class DatasetsModule {}
