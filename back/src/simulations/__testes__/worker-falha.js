// Worker de teste: falha de processamento informada por mensagem e por exceção.
const { parentPort, workerData } = require('worker_threads');
if (workerData.modo === 'mensagem') {
  parentPort.postMessage({ ok: false, mensagem: 'falha controlada' });
} else if (workerData.modo === 'saida') {
  process.exit(3);
} else {
  throw new Error('exceção controlada');
}
