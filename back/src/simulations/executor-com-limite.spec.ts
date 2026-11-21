import * as path from 'path';
import { ExecutorComLimite } from './executor-com-limite';

const script = (nome: string) => path.join(__dirname, '__testes__', nome);

describe('ExecutorComLimite (ADR-008)', () => {
  it('devolve o resultado do worker concluído', async () => {
    const executor = new ExecutorComLimite(script('worker-eco.js'), 2);
    const resultado = await executor.executar({ valor: 42 }, 5000);
    expect(resultado).toMatchObject({ status: 'CONCLUIDO', resultado: { valor: 42 } });
    expect(executor.ocupados).toBe(0);
  });

  it('encerra o worker e marca TEMPO_ESGOTADO ao atingir o limite', async () => {
    const executor = new ExecutorComLimite(script('worker-infinito.js'), 1);
    const inicio = Date.now();
    const resultado = await executor.executar({}, 300);
    expect(resultado.status).toBe('TEMPO_ESGOTADO');
    expect(Date.now() - inicio).toBeLessThan(2000);
    expect(executor.ocupados).toBe(0);
    // O pool continua utilizável depois do cancelamento.
    const seguinte = new ExecutorComLimite(script('worker-eco.js'), 1);
    await expect(seguinte.executar({ ok: 1 }, 5000)).resolves.toMatchObject({ status: 'CONCLUIDO' });
  });

  it('conta o limite desde o aceite, inclusive o tempo de espera na fila', async () => {
    const executor = new ExecutorComLimite(script('worker-eco.js'), 1);
    const primeira = executor.executar({ atrasoMs: 700 }, 5000);
    const naFila = executor.executar({ atrasoMs: 0 }, 300);
    expect(executor.aguardando).toBe(1);
    await expect(naFila).resolves.toMatchObject({ status: 'TEMPO_ESGOTADO' });
    await expect(primeira).resolves.toMatchObject({ status: 'CONCLUIDO' });
  });

  it('considera o instante de aceite informado', async () => {
    const executor = new ExecutorComLimite(script('worker-eco.js'), 1);
    const resultado = await executor.executar({}, 1000, Date.now() - 5000);
    expect(resultado.status).toBe('TEMPO_ESGOTADO');
  });

  it('respeita o tamanho do pool', async () => {
    const executor = new ExecutorComLimite(script('worker-eco.js'), 2);
    const tarefas = [1, 2, 3].map((n) => executor.executar({ n, atrasoMs: 150 }, 5000));
    expect(executor.ocupados).toBe(2);
    expect(executor.aguardando).toBe(1);
    const resultados = await Promise.all(tarefas);
    expect(resultados.map((r) => r.status)).toEqual(['CONCLUIDO', 'CONCLUIDO', 'CONCLUIDO']);
  });

  it.each([
    ['mensagem de falha', 'mensagem', 'falha controlada'],
    ['exceção no worker', 'excecao', 'Falha no processamento da simulação.'],
    ['saída inesperada', 'saida', 'encerrado inesperadamente'],
  ])('informa FALHA em %s', async (_caso, modo, mensagem) => {
    const executor = new ExecutorComLimite(script('worker-falha.js'), 1);
    const resultado = await executor.executar({ modo }, 5000);
    expect(resultado.status).toBe('FALHA');
    expect((resultado as { mensagem: string }).mensagem).toContain(mensagem);
  });

  it('interrompe tarefas no encerramento e recusa novas', async () => {
    const executor = new ExecutorComLimite(script('worker-infinito.js'), 1);
    const emAndamento = executor.executar({}, 10_000);
    const naFila = executor.executar({}, 10_000);
    await executor.encerrar();
    await expect(emAndamento).resolves.toMatchObject({ status: 'FALHA' });
    await expect(naFila).resolves.toMatchObject({ status: 'FALHA' });
    await expect(executor.executar({}, 1000)).resolves.toMatchObject({
      status: 'FALHA',
      mensagem: 'Executor encerrado.',
    });
  });
});
