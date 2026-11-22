import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IsBoolean, IsUUID } from 'class-validator';
import { ExigeOperacao, UsuarioAtual } from '../auth/decoradores';
import { Operacao } from '../auth/matriz-permissoes';
import { UsuarioAutenticado } from '../auth/papel-usuario';
import { ResultadoTratamento, TratamentoService } from './tratamento.service';

export class ConfirmarTratamentoDto {
  @IsUUID('all', { message: 'Selecione o resultado da simulação.' })
  simulacaoId: string;

  /** Confirmação explícita do analista após revisar ações, ordem e prévia (UC-04, passo 2). */
  @IsBoolean({ message: 'Informe a confirmação explícita do tratamento.' })
  confirmado: boolean;
}

/** UC-04 — Aplicar regra de tratamento (tela T05). */
@Controller('tratamentos')
export class TratamentoController {
  constructor(private readonly tratamentos: TratamentoService) {}

  @ExigeOperacao(Operacao.TRATAMENTO_APLICAR)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  aplicar(
    @Body() dto: ConfirmarTratamentoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<ResultadoTratamento> {
    return this.tratamentos.aplicar(dto.simulacaoId, dto.confirmado, usuario.id);
  }
}
