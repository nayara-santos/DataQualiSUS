import { Module } from '@nestjs/common';
import { ExportacaoService } from './exportacao.service';

@Module({
  providers: [ExportacaoService],
  exports: [ExportacaoService],
})
export class ExportacaoModule {}
