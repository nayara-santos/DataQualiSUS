import { Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CONFIGURACAO, Configuracao } from '../config/configuracao';

/**
 * Armazenamento de senhas com bcrypt e salt aleatório por senha (RNF003, ADR-006).
 * Senhas iguais em contas distintas geram hashes distintos (CTN003).
 */
@Injectable()
export class SenhaService {
  private hashReferencia: Promise<string> | null = null;

  constructor(@Inject(CONFIGURACAO) private readonly configuracao: Configuracao) {}

  gerarHash(senha: string): Promise<string> {
    return bcrypt.hash(senha, this.configuracao.bcryptCusto);
  }

  verificar(senha: string, hash: string): Promise<boolean> {
    return bcrypt.compare(senha, hash);
  }

  /**
   * Executa uma comparação equivalente quando o e-mail não existe, para que o tempo de resposta
   * não revele quais contas estão cadastradas.
   */
  async compararComReferencia(senha: string): Promise<void> {
    this.hashReferencia ??= this.gerarHash('referencia-para-tempo-constante');
    await bcrypt.compare(senha, await this.hashReferencia);
  }
}
