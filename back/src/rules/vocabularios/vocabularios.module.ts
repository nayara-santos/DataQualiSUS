import { Module } from '@nestjs/common';
import { VocabularioController } from './vocabulario.controller';
import { VocabularioRepository } from './vocabulario.repository';
import { VocabularioService } from './vocabulario.service';

@Module({
  controllers: [VocabularioController],
  providers: [VocabularioService, VocabularioRepository],
  exports: [VocabularioService],
})
export class VocabulariosModule {}
