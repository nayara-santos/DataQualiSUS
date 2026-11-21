import { Logger } from '@nestjs/common';
import * as path from 'path';
import { Worker } from 'worker_threads';

export type ResultadoExecucao<S> =
  | { status: 'CONCLUIDO'; resultado: S; duracaoMs: number }
  | { status: 'TEMPO_ESGOTADO'; duracaoMs: number }
  | { status: 'FALHA'; mensagem: string; duracaoMs: number };

interface Tarefa {
  dados: unknown;
  aceitoEm: number;
  limiteMs: number;
  concluir: (resultado: ResultadoExecucao<unknown>) => void;
  worker?: Worker;
  temporizador?: NodeJS.Timeout;
  finalizada: boolean;
}

/** Mensagem trocada entre o worker e o executor. */
export type MensagemWorker<S> = { ok: true; resultado: S } | { ok: false; mensagem: string };

/**
 * ExecutorComLimite (P2, seção 2; ADR-008): executa cada tarefa em uma worker thread de um pool
 * limitado e encerra o worker quando o limite é atingido. O cronômetro começa no aceite da tarefa
 * pelo servidor, inclusive durante a espera na fila, como exige a P1 (seção 8.3).
 */
export class ExecutorComLimite {
  private readonly logger = new Logger(ExecutorComLimite.name);
  private readonly fila: Tarefa[] = [];
  private readonly emExecucao = new Set<Tarefa>();
  private encerrado = false;

  constructor(
    private readonly script: string,
    private readonly tamanhoPool: number,
    private readonly memoriaMaximaMb = 1024,
  ) {}

  executar<E, S>(dados: E, limiteMs: number, aceitoEm: number = Date.now()): Promise<ResultadoExecucao<S>> {
    return new Promise<ResultadoExecucao<S>>((resolver) => {
      const tarefa: Tarefa = {
        dados,
        aceitoEm,
        limiteMs,
        finalizada: false,
        concluir: resolver as (resultado: ResultadoExecucao<unknown>) => void,
      };
      if (this.encerrado) {
        this.finalizar(tarefa, { status: 'FALHA', mensagem: 'Executor encerrado.', duracaoMs: 0 });
        return;
      }
      const restante = aceitoEm + limiteMs - Date.now();
      tarefa.temporizador = setTimeout(() => this.esgotar(tarefa), Math.max(restante, 0));
      this.fila.push(tarefa);
      this.despachar();
    });
  }

  get ocupados(): number {
    return this.emExecucao.size;
  }

  get aguardando(): number {
    return this.fila.length;
  }

  private despachar(): void {
    while (!this.encerrado && this.emExecucao.size < this.tamanhoPool && this.fila.length > 0) {
      const tarefa = this.fila.shift()!;
      if (!tarefa.finalizada) {
        this.iniciar(tarefa);
      }
    }
  }

  private criarWorker(dados: unknown): Worker {
    const opcoes = { workerData: dados, resourceLimits: { maxOldGenerationSizeMb: this.memoriaMaximaMb } };
    if (this.script.endsWith('.ts')) {
      // Execução a partir do código-fonte (testes e ts-node): registra o transpilador no worker.
      const projeto = path.resolve(__dirname, '..', '..', 'tsconfig.json');
      const codigo =
        `require('ts-node').register({ transpileOnly: true, project: ${JSON.stringify(projeto)} });` +
        `require(${JSON.stringify(this.script)});`;
      return new Worker(codigo, { ...opcoes, eval: true });
    }
    return new Worker(this.script, opcoes);
  }

  private iniciar(tarefa: Tarefa): void {
    const worker = this.criarWorker(tarefa.dados);
    tarefa.worker = worker;
    this.emExecucao.add(tarefa);
    worker.once('message', (mensagem: MensagemWorker<unknown>) => {
      if (mensagem.ok) {
        this.finalizar(tarefa, {
          status: 'CONCLUIDO',
          resultado: mensagem.resultado,
          duracaoMs: this.duracao(tarefa),
        });
      } else {
        this.finalizar(tarefa, {
          status: 'FALHA',
          mensagem: mensagem.mensagem,
          duracaoMs: this.duracao(tarefa),
        });
      }
    });
    worker.once('error', (erro) => {
      const memoria = (erro as NodeJS.ErrnoException).code === 'ERR_WORKER_OUT_OF_MEMORY';
      this.logger.warn(`Falha no worker de simulação: ${erro.message}`);
      this.finalizar(tarefa, {
        status: 'FALHA',
        mensagem: memoria
          ? 'Memória insuficiente para processar a simulação.'
          : 'Falha no processamento da simulação.',
        duracaoMs: this.duracao(tarefa),
      });
    });
    worker.once('exit', (codigo) => {
      if (!tarefa.finalizada) {
        this.finalizar(tarefa, {
          status: 'FALHA',
          mensagem: `Processamento encerrado inesperadamente (código ${codigo}).`,
          duracaoMs: this.duracao(tarefa),
        });
      }
    });
  }

  private esgotar(tarefa: Tarefa): void {
    if (tarefa.finalizada) {
      return;
    }
    this.finalizar(tarefa, { status: 'TEMPO_ESGOTADO', duracaoMs: this.duracao(tarefa) });
  }

  private finalizar(tarefa: Tarefa, resultado: ResultadoExecucao<unknown>): void {
    if (tarefa.finalizada) {
      return;
    }
    tarefa.finalizada = true;
    if (tarefa.temporizador) {
      clearTimeout(tarefa.temporizador);
    }
    const indice = this.fila.indexOf(tarefa);
    if (indice >= 0) {
      this.fila.splice(indice, 1);
    }
    if (tarefa.worker) {
      this.emExecucao.delete(tarefa);
      tarefa.worker.removeAllListeners('exit');
      void tarefa.worker.terminate();
    }
    tarefa.concluir(resultado);
    this.despachar();
  }

  private duracao(tarefa: Tarefa): number {
    return Date.now() - tarefa.aceitoEm;
  }

  /** Encerra workers ativos e recusa novas tarefas (desligamento da API). */
  async encerrar(): Promise<void> {
    this.encerrado = true;
    for (const tarefa of [...this.fila, ...this.emExecucao]) {
      this.finalizar(tarefa, {
        status: 'FALHA',
        mensagem: 'Execução interrompida pelo desligamento da API.',
        duracaoMs: this.duracao(tarefa),
      });
    }
  }
}
