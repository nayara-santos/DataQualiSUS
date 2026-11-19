import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Violação de regra de negócio ou de configuração (P1, seção 8.3), devolvida com código
 * estável para que a SPA apresente mensagens claras (RNF004).
 */
export class ErroNegocio extends HttpException {
  constructor(
    readonly codigo: string,
    mensagem: string,
    status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
    detalhes?: unknown,
  ) {
    super({ erro: codigo, mensagem, detalhes }, status);
  }
}

export class RecursoNaoEncontrado extends HttpException {
  constructor(mensagem: string) {
    super({ erro: 'NAO_ENCONTRADO', mensagem }, HttpStatus.NOT_FOUND);
  }
}

export class ConflitoEstado extends HttpException {
  constructor(codigo: string, mensagem: string, detalhes?: unknown) {
    super({ erro: codigo, mensagem, detalhes }, HttpStatus.CONFLICT);
  }
}
