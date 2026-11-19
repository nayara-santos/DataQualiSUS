import { Controller, Get } from '@nestjs/common';
import { Publica } from '../auth/decoradores';
import { DatabaseService } from '../database/database.service';

/** Verificação básica de disponibilidade da API e do banco (P3, seção 11). */
@Publica()
@Controller('saude')
export class SaudeController {
  constructor(private readonly banco: DatabaseService) {}

  @Get()
  async verificar(): Promise<{ status: string; banco: string; instante: string }> {
    let banco = 'indisponivel';
    try {
      await this.banco.consultar('SELECT 1');
      banco = 'disponivel';
    } catch {
      banco = 'indisponivel';
    }
    return { status: 'ok', banco, instante: new Date().toISOString() };
  }
}
