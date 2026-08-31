import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { prisma } from "@/server/db/client";
import { lerEtiqueta } from "@/server/services/label-reader.service";

/**
 * Leitura de etiqueta com o modelo de verdade.
 *
 * Pulado quando nao ha chave configurada, para que a suite continue rodando em
 * maquina sem credencial. Quando ha, faz uma chamada real: mock aqui nao
 * provaria nada sobre a integracao, que e justamente o que pode quebrar.
 */
/**
 * Testes que chamam o modelo de verdade sao opt-in.
 *
 * Cada execucao consome cota do plano gratuito, que e por minuto e por dia.
 * Rodar a suite inteira algumas vezes seguidas esgota o limite e passa a
 * falhar por 429 — uma falha que nao diz nada sobre o codigo.
 *
 * Rodar com:  TESTAR_IA=1 npm test
 */
const temChave =
  Boolean(process.env.GEMINI_API_KEY) && process.env.TESTAR_IA === "1";

function etiquetaDeMemoria(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="360">
    <rect width="900" height="360" fill="#f2f2f0"/>
    <rect x="18" y="18" width="864" height="324" fill="#ffffff" stroke="#111" stroke-width="3"/>
    <text x="48" y="92" font-family="Arial" font-size="46" font-weight="bold" fill="#111">KINGSTON FURY BEAST</text>
    <text x="48" y="150" font-family="Arial" font-size="34" fill="#111">8GB 1Gx64-Bit DDR4-3200 CL16</text>
    <text x="48" y="200" font-family="Arial" font-size="30" fill="#111">P/N: KF432C16BB/8</text>
    <text x="48" y="248" font-family="Arial" font-size="30" fill="#111">S/N: KF3200A7812</text>
    <text x="48" y="296" font-family="Arial" font-size="26" fill="#444">1.35V  ASSEMBLED IN TAIWAN</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

describe.skipIf(!temChave)("leitura de etiqueta", () => {
  it("extrai marca, part number e serial de uma etiqueta de memoria", async () => {
    const categoria = await prisma.category.findUniqueOrThrow({
      where: { slug: "ram" },
      select: { id: true },
    });

    const sugestao = await lerEtiqueta({
      imagem: await etiquetaDeMemoria(),
      mimeType: "image/jpeg",
      categoryId: categoria.id,
    });

    console.log("sugestao:", JSON.stringify(sugestao, null, 1));

    expect(sugestao.marca?.toLowerCase()).toContain("kingston");
    expect(sugestao.partNumber).toContain("KF432C16BB");
    expect(sugestao.numeroSerie).toContain("KF3200A7812");

    // As specs precisam sair no vocabulario do catalogo, nao no texto cru.
    expect(sugestao.specs.memoryType).toBe("DDR4");
    expect(sugestao.specs.capacityGb).toBe(8);
    expect(sugestao.specs.speedMhz).toBe(3200);
  });

  it("nao inventa serial quando a etiqueta nao tem", async () => {
    // Serial inventado e pior que serial nenhum: vira uma peca rastreada por
    // um numero que nao existe no mundo fisico.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="240">
      <rect width="800" height="240" fill="#ffffff"/>
      <text x="40" y="110" font-family="Arial" font-size="44" font-weight="bold" fill="#111">CORSAIR CV650</text>
      <text x="40" y="175" font-family="Arial" font-size="34" fill="#111">650W 80 PLUS BRONZE</text>
    </svg>`;
    const imagem = await sharp(Buffer.from(svg)).jpeg().toBuffer();

    const categoria = await prisma.category.findUniqueOrThrow({
      where: { slug: "psu" },
      select: { id: true },
    });

    const sugestao = await lerEtiqueta({
      imagem,
      mimeType: "image/jpeg",
      categoryId: categoria.id,
    });

    console.log("sugestao psu:", JSON.stringify(sugestao, null, 1));

    expect(sugestao.numeroSerie ?? "").toBe("");
    expect(sugestao.specs.wattage).toBe(650);
  });
});
