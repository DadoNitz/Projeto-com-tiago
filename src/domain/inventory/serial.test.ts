import { describe, expect, it } from "vitest";

import {
  conteudoQrCode,
  derivarSerialFinal,
  formatarCodigoInterno,
  lerQrCode,
  normalizarBuscaSerial,
} from "./serial";

describe("derivarSerialFinal", () => {
  it("extrai os últimos caracteres", () => {
    expect(derivarSerialFinal("SN1234567812")).toBe("567812");
  });

  it("ignora separadores e caixa, para que a mesma peça gere o mesmo valor", () => {
    // A mesma etiqueta digitada de formas diferentes por pessoas diferentes
    // precisa ser encontrada pela mesma busca.
    expect(derivarSerialFinal("1234-5678")).toBe(derivarSerialFinal("12345678"));
    expect(derivarSerialFinal("abc 1234")).toBe(derivarSerialFinal("ABC1234"));
  });

  it("devolve o serial inteiro quando ele é mais curto que o limite", () => {
    expect(derivarSerialFinal("7812")).toBe("7812");
  });

  it("devolve null para serial ausente ou sem conteúdo útil", () => {
    expect(derivarSerialFinal(null)).toBeNull();
    expect(derivarSerialFinal(undefined)).toBeNull();
    expect(derivarSerialFinal("")).toBeNull();
    expect(derivarSerialFinal("---")).toBeNull();
  });

  it("casa com o termo normalizado de busca", () => {
    // É esta propriedade que faz a busca por "final do serial" funcionar:
    // gravação e consulta precisam passar pela mesma normalização.
    const gravado = derivarSerialFinal("SN-9A8B-7291");
    expect(gravado).not.toBeNull();
    expect(gravado?.endsWith(normalizarBuscaSerial("7291"))).toBe(true);
    expect(gravado?.endsWith(normalizarBuscaSerial("72 91"))).toBe(true);
  });
});

describe("código interno e QR Code", () => {
  it("formata com zeros à esquerda para manter ordenação e alinhamento", () => {
    expect(formatarCodigoInterno(1)).toBe("EST-00001");
    expect(formatarCodigoInterno(431)).toBe("EST-00431");
    expect(formatarCodigoInterno(123456)).toBe("EST-123456");
  });

  it("faz ida e volta entre código interno e conteúdo do QR", () => {
    const codigo = formatarCodigoInterno(431);
    expect(lerQrCode(conteudoQrCode(codigo))).toBe(codigo);
  });

  it("aceita o código digitado direto da etiqueta, sem o prefixo do QR", () => {
    expect(lerQrCode("EST-00431")).toBe("EST-00431");
    expect(lerQrCode(" est-00431 ")).toBe("EST-00431");
  });

  it("recusa conteúdo que não é etiqueta deste sistema", () => {
    // Ler um QR Code qualquer não pode navegar para uma unidade arbitrária.
    expect(lerQrCode("https://exemplo.com/estoque/1")).toBeNull();
    expect(lerQrCode("")).toBeNull();
    expect(lerQrCode("INV-")).toBeNull();
  });
});
