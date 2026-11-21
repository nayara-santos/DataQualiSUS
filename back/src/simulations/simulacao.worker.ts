/* Worker thread da simulação (ADR-008). Recebe a tarefa por workerData e devolve o resultado. */
import { parentPort, workerData } from 'worker_threads';
import { MensagemWorker } from './executor-com-limite';
import {
  DadosTarefaSimulacao,
  ErroTarefaSimulacao,
  executarTarefaSimulacao,
  ResultadoTarefaSimulacao,
} from './tarefa-simulacao';
import { ErroMotor } from '../rules/motor/motor-regras';

executarTarefaSimulacao(workerData as DadosTarefaSimulacao)
  .then((resultado) => {
    const mensagem: MensagemWorker<ResultadoTarefaSimulacao> = { ok: true, resultado };
    parentPort?.postMessage(mensagem);
  })
  .catch((erro: Error) => {
    const conhecido = erro instanceof ErroTarefaSimulacao || erro instanceof ErroMotor;
    const mensagem: MensagemWorker<ResultadoTarefaSimulacao> = {
      ok: false,
      mensagem: conhecido ? erro.message : 'Falha ao processar os registros da versão.',
    };
    parentPort?.postMessage(mensagem);
  });
