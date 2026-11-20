import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ExigeOperacao } from '../../auth/decoradores';
import { Operacao } from '../../auth/matriz-permissoes';
import { VocabularioService } from './vocabulario.service';
import { VocabularioDto } from './vocabulario.tipos';

/** Consulta de vocabulários disponíveis para regras de validade (T03). Não há importação via API. */
@Controller('vocabularios')
export class VocabularioController {
  constructor(private readonly vocabularios: VocabularioService) {}

  @ExigeOperacao(Operacao.VOCABULARIO_CONSULTAR)
  @Get()
  listar(): Promise<VocabularioDto[]> {
    return this.vocabularios.listarDisponiveis();
  }

  @ExigeOperacao(Operacao.VOCABULARIO_CONSULTAR)
  @Get(':id')
  obter(@Param('id', new ParseUUIDPipe()) id: string): Promise<VocabularioDto> {
    return this.vocabularios.obter(id);
  }
}
