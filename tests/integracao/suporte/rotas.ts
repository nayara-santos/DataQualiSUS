import { INestApplication, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { ModulesContainer } from "@nestjs/core";
import {
  CHAVE_OPERACAO,
  CHAVE_ROTA_PUBLICA,
} from "../../../back/src/auth/decoradores";
import { Operacao } from "../../../back/src/auth/matriz-permissoes";

export interface RotaDescoberta {
  metodo: "get" | "post" | "put" | "patch" | "delete";
  caminho: string;
  operacao?: Operacao;
  publica: boolean;
}

const ID_FICTICIO = "00000000-0000-4000-8000-000000000000";

function juntar(...partes: (string | undefined)[]): string {
  return (
    "/" +
    partes
      .flatMap((p) => (p ?? "").split("/"))
      .filter(Boolean)
      .map((p) => (p.startsWith(":") ? ID_FICTICIO : p))
      .join("/")
  );
}

/**
 * Lista todas as rotas registradas pelos controladores, com a operação e a marcação de rota pública.
 * Usada pelo CTN003 para verificar cada rota sem sessão, após logout e com perfil vedado.
 */
export function listarRotas(app: INestApplication): RotaDescoberta[] {
  const rotas: RotaDescoberta[] = [];
  for (const modulo of app.get(ModulesContainer).values()) {
    for (const wrapper of modulo.controllers.values()) {
      const classe = wrapper.metatype as
        | (new (...args: unknown[]) => unknown)
        | undefined;
      if (!classe) {
        continue;
      }
      const prefixo = Reflect.getMetadata(PATH_METADATA, classe) as
        | string
        | undefined;
      const prototipo = classe.prototype as Record<string, unknown>;
      for (const nome of Object.getOwnPropertyNames(prototipo)) {
        const manipulador = prototipo[nome];
        if (nome === "constructor" || typeof manipulador !== "function") {
          continue;
        }
        const caminho = Reflect.getMetadata(PATH_METADATA, manipulador) as
          | string
          | undefined;
        const metodo = Reflect.getMetadata(METHOD_METADATA, manipulador) as
          | RequestMethod
          | undefined;
        if (caminho === undefined || metodo === undefined) {
          continue;
        }
        rotas.push({
          metodo: RequestMethod[
            metodo
          ].toLowerCase() as RotaDescoberta["metodo"],
          caminho: juntar("api", prefixo, caminho),
          operacao:
            (Reflect.getMetadata(CHAVE_OPERACAO, manipulador) as
              | Operacao
              | undefined) ??
            (Reflect.getMetadata(CHAVE_OPERACAO, classe) as
              | Operacao
              | undefined),
          publica: Boolean(
            Reflect.getMetadata(CHAVE_ROTA_PUBLICA, manipulador) ??
              Reflect.getMetadata(CHAVE_ROTA_PUBLICA, classe),
          ),
        });
      }
    }
  }
  return rotas;
}
