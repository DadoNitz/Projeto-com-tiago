import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  limparTudo,
  podeTentar,
  registrarFalha,
  registrarSucesso,
} from "./rate-limit";

describe("limite de tentativas de login", () => {
  beforeEach(() => {
    limparTudo();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("permite as primeiras tentativas", () => {
    for (let i = 0; i < 7; i += 1) {
      expect(podeTentar("pessoa@local").permitido).toBe(true);
      registrarFalha("pessoa@local");
    }
  });

  it("bloqueia depois de errar demais", () => {
    for (let i = 0; i < 8; i += 1) registrarFalha("alvo@local");

    const resultado = podeTentar("alvo@local");
    expect(resultado.permitido).toBe(false);
    expect(resultado.esperarSegundos).toBeGreaterThan(0);
  });

  it("bloqueia só o e-mail atacado, não os outros", () => {
    // A chave é o e-mail, e não o IP: numa oficina todo mundo divide o mesmo
    // IP, e bloquear por IP deixaria a equipe inteira de fora por causa de uma
    // pessoa que errou a senha.
    for (let i = 0; i < 8; i += 1) registrarFalha("alvo@local");

    expect(podeTentar("alvo@local").permitido).toBe(false);
    expect(podeTentar("outra.pessoa@local").permitido).toBe(true);
  });

  it("libera depois que o bloqueio expira", () => {
    for (let i = 0; i < 8; i += 1) registrarFalha("alvo@local");
    expect(podeTentar("alvo@local").permitido).toBe(false);

    vi.advanceTimersByTime(16 * 60 * 1000);
    expect(podeTentar("alvo@local").permitido).toBe(true);
  });

  it("acerto limpa o histórico de erros", () => {
    // Quem errou a senha três vezes e acertou na quarta não deve carregar o
    // contador para a próxima sessão.
    for (let i = 0; i < 5; i += 1) registrarFalha("pessoa@local");
    registrarSucesso("pessoa@local");

    for (let i = 0; i < 7; i += 1) {
      expect(podeTentar("pessoa@local").permitido).toBe(true);
      registrarFalha("pessoa@local");
    }
  });

  it("tentativas espaçadas não acumulam para sempre", () => {
    // Errar a senha uma vez por semana não pode acabar bloqueando a conta.
    for (let i = 0; i < 7; i += 1) {
      registrarFalha("distraido@local");
      vi.advanceTimersByTime(16 * 60 * 1000);
    }
    expect(podeTentar("distraido@local").permitido).toBe(true);
  });

  it("ignora diferença de caixa e espaços no e-mail", () => {
    for (let i = 0; i < 8; i += 1) registrarFalha("Alvo@Local  ");
    expect(podeTentar("alvo@local").permitido).toBe(false);
  });
});
