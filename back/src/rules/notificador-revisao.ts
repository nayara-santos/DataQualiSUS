import { Injectable } from '@nestjs/common';
import { Executor } from '../database/database.service';

export type ObservadorRevisao = (conjuntoIds: string[], tx: Executor) => Promise<void>;

/**
 * Ponto de extensão para reagir a novas revisões de conjuntos dentro da mesma transação.
 * O módulo de simulações o usa para invalidar simulações anteriores (RF002, MOD-16) sem que o
 * módulo de regras dependa dele.
 */
@Injectable()
export class NotificadorRevisaoConjunto {
  private readonly observadores: ObservadorRevisao[] = [];

  registrar(observador: ObservadorRevisao): void {
    this.observadores.push(observador);
  }

  async notificar(conjuntoIds: string[], tx: Executor): Promise<void> {
    if (conjuntoIds.length === 0) {
      return;
    }
    for (const observador of this.observadores) {
      await observador(conjuntoIds, tx);
    }
  }
}
