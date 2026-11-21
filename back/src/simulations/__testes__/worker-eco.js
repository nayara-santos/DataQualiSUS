// Worker de teste: devolve os dados recebidos após o atraso pedido.
const { parentPort, workerData } = require('worker_threads');
setTimeout(() => parentPort.postMessage({ ok: true, resultado: workerData }), workerData.atrasoMs || 0);
