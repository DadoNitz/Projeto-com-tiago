import { describe, expect, it } from "vitest";

import type { MovementType, UnitStatus } from "@/generated/prisma/enums";

import {
  REGRAS_DE_MOVIMENTO,
  calcularNovoSaldo,
  permitidoParaQuantidade,
  validarTransicao,
} from "./movement-rules";

const TODOS_OS_STATUS: UnitStatus[] = [
  "AVAILABLE",
  "RESERVED",
  "IN_BUILD",
  "SOLD",
  "DEFECTIVE",
  "DISCARDED",
  "IN_TRANSIT",
];

const TODOS_OS_TIPOS = Object.keys(REGRAS_DE_MOVIMENTO) as MovementType[];

describe("validarTransicao", () => {
  it("permite reservar uma unidade disponível", () => {
    const resultado = validarTransicao("RESERVE", "AVAILABLE");
    expect(resultado).toEqual({ ok: true, novoStatus: "RESERVED" });
  });

  it("impede reservar uma unidade já reservada", () => {
    // Esta é a regra que impede prometer a mesma peça a dois clientes.
    const resultado = validarTransicao("RESERVE", "RESERVED");
    expect(resultado.ok).toBe(false);
  });

  it("impede reservar uma unidade já vendida", () => {
    expect(validarTransicao("RESERVE", "SOLD").ok).toBe(false);
  });

  it("impede alocar em montagem uma unidade vendida", () => {
    expect(validarTransicao("BUILD_ALLOCATE", "SOLD").ok).toBe(false);
  });

  it("devolve ao estoque uma unidade liberada de montagem", () => {
    // Cancelamento de montagem: as peças precisam voltar a ficar disponíveis,
    // ou o estoque perde unidades silenciosamente.
    expect(validarTransicao("BUILD_RELEASE", "IN_BUILD")).toEqual({
      ok: true,
      novoStatus: "AVAILABLE",
    });
  });

  it("trata descarte como estado terminal", () => {
    for (const tipo of TODOS_OS_TIPOS) {
      expect(validarTransicao(tipo, "DISCARDED").ok, tipo).toBe(false);
    }
  });

  it("mantém o status em transferência de local", () => {
    expect(validarTransicao("TRANSFER", "RESERVED")).toEqual({
      ok: true,
      novoStatus: "RESERVED",
    });
  });

  it("aceita ajuste manual a partir de qualquer status não terminal", () => {
    for (const status of TODOS_OS_STATUS) {
      if (status === "DISCARDED") continue;
      expect(validarTransicao("ADJUSTMENT", status).ok, status).toBe(true);
    }
  });

  it("nunca produz um status inválido", () => {
    for (const tipo of TODOS_OS_TIPOS) {
      for (const status of TODOS_OS_STATUS) {
        const resultado = validarTransicao(tipo, status);
        if (resultado.ok) {
          expect(TODOS_OS_STATUS, `${tipo} de ${status}`).toContain(
            resultado.novoStatus,
          );
        }
      }
    }
  });

  it("explica o motivo da recusa em vez de só negar", () => {
    const resultado = validarTransicao("UNRESERVE", "AVAILABLE");
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.motivo).toContain("disponível");
    expect(resultado.motivo.length).toBeGreaterThan(20);
  });
});

describe("calcularNovoSaldo", () => {
  it("soma nas entradas e subtrai nas saídas", () => {
    expect(calcularNovoSaldo(10, "INBOUND", 5)).toEqual({ ok: true, novoSaldo: 15 });
    expect(calcularNovoSaldo(10, "OUTBOUND", 4)).toEqual({ ok: true, novoSaldo: 6 });
    expect(calcularNovoSaldo(10, "SALE", 10)).toEqual({ ok: true, novoSaldo: 0 });
  });

  it("recusa saída maior que o saldo em vez de deixar negativo", () => {
    // Saldo negativo seria uma afirmação falsa sobre o estoque físico.
    const resultado = calcularNovoSaldo(3, "OUTBOUND", 4);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.motivo).toContain("3");
  });

  it("recusa quantidade zero, negativa ou fracionada", () => {
    expect(calcularNovoSaldo(10, "OUTBOUND", 0).ok).toBe(false);
    expect(calcularNovoSaldo(10, "OUTBOUND", -1).ok).toBe(false);
    expect(calcularNovoSaldo(10, "OUTBOUND", 1.5).ok).toBe(false);
  });

  it("não altera o saldo em transferência e ajuste", () => {
    expect(calcularNovoSaldo(7, "TRANSFER", 1)).toEqual({ ok: true, novoSaldo: 7 });
    expect(calcularNovoSaldo(7, "ADJUSTMENT", 1)).toEqual({ ok: true, novoSaldo: 7 });
  });
});

describe("itens controlados por quantidade", () => {
  it("não aceita reserva nem alocação em montagem", () => {
    // Item fungível não tem unidade física distinguível para prender.
    expect(permitidoParaQuantidade("RESERVE")).toBe(false);
    expect(permitidoParaQuantidade("BUILD_ALLOCATE")).toBe(false);
    expect(permitidoParaQuantidade("BUILD_RELEASE")).toBe(false);
  });

  it("aceita entrada, saída, venda e ajuste", () => {
    expect(permitidoParaQuantidade("INBOUND")).toBe(true);
    expect(permitidoParaQuantidade("OUTBOUND")).toBe(true);
    expect(permitidoParaQuantidade("SALE")).toBe(true);
    expect(permitidoParaQuantidade("ADJUSTMENT")).toBe(true);
  });
});
