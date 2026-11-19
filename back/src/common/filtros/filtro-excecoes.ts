import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

interface CorpoErro {
  statusCode: number;
  erro: string;
  mensagem: string | string[];
  detalhes?: unknown;
}

/**
 * Padroniza as respostas de erro da API. Erros inesperados não expõem pilha, SQL nem
 * conteúdo de datasets ao cliente; o log registra apenas a mensagem técnica (ADR-006).
 */
@Catch()
export class FiltroExcecoes implements ExceptionFilter {
  private readonly logger = new Logger('Erros');

  catch(excecao: unknown, host: ArgumentsHost): void {
    const resposta = host.switchToHttp().getResponse<Response>();
    if (resposta.headersSent) {
      return;
    }
    let corpo: CorpoErro;
    if (excecao instanceof HttpException) {
      const status = excecao.getStatus();
      const conteudo = excecao.getResponse();
      if (typeof conteudo === 'string') {
        corpo = { statusCode: status, erro: HttpStatus[status] ?? 'Erro', mensagem: conteudo };
      } else {
        const objeto = conteudo as Record<string, unknown>;
        corpo = {
          statusCode: status,
          erro: (objeto.erro as string) ?? (objeto.error as string) ?? HttpStatus[status] ?? 'Erro',
          mensagem: (objeto.mensagem as string) ?? (objeto.message as string | string[]) ?? excecao.message,
        };
        if (objeto.detalhes !== undefined) {
          corpo.detalhes = objeto.detalhes;
        }
      }
    } else {
      const mensagem = excecao instanceof Error ? excecao.message : String(excecao);
      this.logger.error(`Erro interno não tratado: ${mensagem}`);
      corpo = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        erro: 'Erro interno',
        mensagem: 'Não foi possível concluir a operação. Nenhuma alteração parcial foi confirmada.',
      };
    }
    resposta.status(corpo.statusCode).json(corpo);
  }
}
