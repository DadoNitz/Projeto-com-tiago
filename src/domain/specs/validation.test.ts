import { describe, expect, it } from "vitest";

import { CATALOGO_PADRAO } from "./default-catalog";
import type { SpecDefinition } from "./types";
import {
  construirSchemaDeSpecs,
  specLista,
  specNumero,
  specTexto,
} from "./validation";

function categoria(slug: string): readonly SpecDefinition[] {
  const encontrada = CATALOGO_PADRAO.find((c) => c.slug === slug);
  if (!encontrada) throw new Error(`categoria ${slug} ausente do catálogo`);
  return encontrada.specs;
}

describe("construirSchemaDeSpecs", () => {
  const schemaCpu = construirSchemaDeSpecs(categoria("cpu"));

  it("aceita specs válidas e converte números vindos como texto", () => {
    // Formulário HTML sempre entrega string; o banco precisa de número, senão
    // as comparações do motor de compatibilidade viram comparação de texto
    // ("9" > "10" seria verdadeiro).
    const resultado = schemaCpu.safeParse({
      socket: "AM4",
      cores: "6",
      threads: "12",
      tdpWatts: "65",
      integratedGraphics: "false",
    });

    expect(resultado.success).toBe(true);
    if (!resultado.success) return;

    expect(resultado.data.cores).toBe(6);
    expect(typeof resultado.data.cores).toBe("number");
    expect(resultado.data.integratedGraphics).toBe(false);
  });

  it("rejeita valor de ENUM fora do vocabulário controlado", () => {
    // "Socket AM4" e "AM4" precisam ser tratados como valores diferentes, ou
    // a regra de compatibilidade compararia strings distintas e falharia em
    // silêncio.
    const resultado = schemaCpu.safeParse({ socket: "Socket AM4" });
    expect(resultado.success).toBe(false);
  });

  it("exige as specs marcadas como obrigatórias", () => {
    const resultado = schemaCpu.safeParse({ cores: "6" });
    expect(resultado.success).toBe(false);
    if (resultado.success) return;
    expect(
      resultado.error.issues.some((issue) => issue.path[0] === "socket"),
    ).toBe(true);
  });

  it("descarta chaves desconhecidas em vez de gravá-las no JSONB", () => {
    const resultado = schemaCpu.safeParse({
      socket: "AM4",
      campoInventado: "lixo",
      __proto__: "ataque",
    });

    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(resultado.data).not.toHaveProperty("campoInventado");
    expect(Object.keys(resultado.data)).toEqual(["socket"]);
  });

  it("omite campos vazios em vez de gravar zero ou null", () => {
    // Diferença essencial: ausente significa "não sabemos", e o motor de
    // compatibilidade responde NEEDS_VERIFICATION. Zero significaria "esta
    // CPU consome 0 W" e produziria um veredito errado com aparência de certo.
    const resultado = schemaCpu.safeParse({
      socket: "AM4",
      tdpWatts: "",
      generation: "   ",
    });

    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(resultado.data).toEqual({ socket: "AM4", generation: "" });
    expect(resultado.data.tdpWatts).toBeUndefined();
  });

  it("respeita os limites de sanidade dos números", () => {
    const resultado = schemaCpu.safeParse({ socket: "AM4", cores: "5000" });
    expect(resultado.success).toBe(false);
  });
});

describe("MULTI_ENUM", () => {
  const schemaCooler = construirSchemaDeSpecs(categoria("cooler"));

  it("normaliza a ordem e remove duplicados", () => {
    // Dois coolers com o mesmo suporte precisam gerar o mesmo JSONB, senão
    // buscas por igualdade e comparações entre produtos falham.
    const a = schemaCooler.safeParse({
      coolerType: "Air cooler",
      socketSupport: ["LGA1700", "AM4", "AM4"],
    });
    const b = schemaCooler.safeParse({
      coolerType: "Air cooler",
      socketSupport: ["AM4", "LGA1700"],
    });

    expect(a.success && b.success).toBe(true);
    if (!a.success || !b.success) return;
    expect(a.data.socketSupport).toEqual(b.data.socketSupport);
  });

  it("recusa valor fora do vocabulário em vez de descartá-lo", () => {
    // Descartar em silêncio produziria uma lista vazia, que afirma "não tem
    // nenhum" — informação falsa, diferente de "não sabemos". O motor de
    // compatibilidade leria a afirmação como fato.
    const resultado = schemaCooler.safeParse({
      coolerType: "Air cooler",
      socketSupport: ["AM4", "socket inventado"],
    });
    expect(resultado.success).toBe(false);
    if (resultado.success) return;
    expect(resultado.error.issues[0]?.message).toContain("socket inventado");
  });

  it("não grava lista vazia: ausência significa dado desconhecido", () => {
    const schemaGpu = construirSchemaDeSpecs(categoria("gpu"));
    const resultado = schemaGpu.safeParse({ powerConnectors: [] });

    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(resultado.data).not.toHaveProperty("powerConnectors");
  });

  it("recusa lista vazia quando a spec é obrigatória", () => {
    const resultado = schemaCooler.safeParse({
      coolerType: "Air cooler",
      socketSupport: [],
    });
    expect(resultado.success).toBe(false);
  });
});

describe("leitores de spec", () => {
  it("devolvem undefined em vez de propagar valor de tipo errado", () => {
    const specs = { socket: "AM4", cores: 6, integrado: true };

    expect(specNumero(specs, "cores")).toBe(6);
    expect(specNumero(specs, "socket")).toBeUndefined();
    expect(specNumero(specs, "inexistente")).toBeUndefined();
    expect(specTexto(specs, "socket")).toBe("AM4");
    expect(specTexto(specs, "cores")).toBeUndefined();
    expect(specLista(specs, "socket")).toEqual([]);
    expect(specNumero(null, "cores")).toBeUndefined();
  });
});

describe("catálogo padrão", () => {
  it("não tem slug de categoria repetido", () => {
    const slugs = CATALOGO_PADRAO.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("não tem chave de spec repetida dentro de uma categoria", () => {
    for (const cat of CATALOGO_PADRAO) {
      const keys = cat.specs.map((s) => s.key);
      expect(new Set(keys).size, `categoria ${cat.slug}`).toBe(keys.length);
    }
  });

  it("mantém toda spec de compatibilidade fora de texto livre", () => {
    // Regra estrutural: o motor compara valores por igualdade e por ordem.
    // Texto livre reintroduziria divergência de grafia e faria a regra falhar
    // sem avisar. STRING só é aceita quando a regra a trata como sinal de
    // alerta, e não como valor comparável.
    const excecoes = new Set(["biosUpdateNeededFor"]);

    for (const cat of CATALOGO_PADRAO) {
      for (const spec of cat.specs) {
        if (!spec.usedInCompatibility || excecoes.has(spec.key)) continue;
        expect(
          ["ENUM", "MULTI_ENUM", "NUMBER", "BOOLEAN"],
          `${cat.slug}.${spec.key}`,
        ).toContain(spec.type);
      }
    }
  });

  it("define opções para toda spec de vocabulário controlado", () => {
    for (const cat of CATALOGO_PADRAO) {
      for (const spec of cat.specs) {
        if (spec.type !== "ENUM" && spec.type !== "MULTI_ENUM") continue;
        expect(spec.options?.length ?? 0, `${cat.slug}.${spec.key}`).toBeGreaterThan(0);
      }
    }
  });
});
