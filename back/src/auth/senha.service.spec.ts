import { Configuracao } from '../config/configuracao';
import { SenhaService } from './senha.service';

describe('SenhaService', () => {
  const servico = new SenhaService({ bcryptCusto: 4 } as Configuracao);

  it('produz hashes bcrypt distintos para a mesma senha (salt aleatório, CTN003)', async () => {
    const a = await servico.gerarHash('mesma-senha');
    const b = await servico.gerarHash('mesma-senha');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^\$2[aby]\$04\$/);
    expect(a).not.toContain('mesma-senha');
  });

  it('verifica a senha correta e rejeita a incorreta', async () => {
    const hash = await servico.gerarHash('segredo');
    await expect(servico.verificar('segredo', hash)).resolves.toBe(true);
    await expect(servico.verificar('Segredo', hash)).resolves.toBe(false);
  });

  it('executa comparação de referência sem lançar erro', async () => {
    await expect(servico.compararComReferencia('qualquer')).resolves.toBeUndefined();
  });
});
