import { describe, expect, it } from "vitest";

import type { Env } from "./env";
import {
  encodePng,
  mergeOcrText,
  OCR_MAX_TOKENS,
  runVision,
  splitForOcr,
  type RasterImage,
} from "./ocr";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function colorType(png: Uint8Array): number {
  return png[25];
}

function image(width: number, height: number, channels = 1): RasterImage {
  return {
    data: new Uint8ClampedArray(width * height * channels),
    width,
    height,
    channels,
  };
}

describe("encodePng", () => {
  it("writes a valid PNG signature", async () => {
    const png = await encodePng({
      data: new Uint8ClampedArray([0, 0, 0, 255]),
      width: 1,
      height: 1,
      channels: 4,
    });
    expect([...png.subarray(0, 8)]).toEqual(SIGNATURE);
  });

  it("preserves prepared image dimensions", async () => {
    const png = await encodePng(image(100, 1870));
    const width = (png[16] << 24) | (png[17] << 16) | (png[18] << 8) | png[19];
    const height = (png[20] << 24) | (png[21] << 16) | (png[22] << 8) | png[23];
    expect(width).toBe(100);
    expect(height).toBe(1870);
  });

  it("uses the correct PNG color type per channel count", async () => {
    expect(
      colorType(
        await encodePng({
          data: new Uint8ClampedArray([0, 0, 0, 255]),
          width: 1,
          height: 1,
          channels: 4,
        })
      )
    ).toBe(6);
    expect(
      colorType(
        await encodePng({
          data: new Uint8ClampedArray([1, 2, 3]),
          width: 1,
          height: 1,
          channels: 3,
        })
      )
    ).toBe(2);
    expect(
      colorType(
        await encodePng({
          data: new Uint8ClampedArray([128]),
          width: 1,
          height: 1,
          channels: 1,
        })
      )
    ).toBe(0);
  });
});

describe("splitForOcr", () => {
  it("splits a tall page into overlapping strips", () => {
    const strips = splitForOcr(image(10, 2300));
    expect(strips.map((strip) => strip.height)).toEqual([850, 850, 760]);
    expect(strips.every((strip) => strip.width === 10)).toBe(true);
  });

  it("downscales wide scanned pages without unnecessary splitting", () => {
    const strips = splitForOcr(image(1700, 2271));
    expect(strips).toHaveLength(1);
    expect(strips[0].width).toBe(1400);
    expect(strips[0].height).toBe(1870);
  });

  it("keeps typical page images as a single strip", () => {
    const strips = splitForOcr(image(1696, 1236));
    expect(strips).toHaveLength(1);
    expect(strips[0].width).toBe(1400);
    expect(strips[0].height).toBe(1020);
  });
});

describe("mergeOcrText", () => {
  it("removes duplicated lines from strip overlaps", () => {
    expect(
      mergeOcrText(["ARTÍCULO 1\nTexto inicial", "Texto inicial\nARTÍCULO 2"])
    ).toBe("ARTÍCULO 1\nTexto inicial\nARTÍCULO 2");
  });

  it("removes assistant preambles and Markdown from OCR text", () => {
    expect(
      mergeOcrText([
        "¡Hola!\n\nEstoy aquí para ayudarte.\n\n¿Qué tipo de texto necesitas?\n¡Claro, aquí está el texto:\nApreciados señores,\n**ARTÍCULO 1**",
      ])
    ).toBe("Apreciados señores,\nARTÍCULO 1");
  });

  it("removes administrative stamp lines from OCR text", () => {
    expect(
      mergeOcrText([
        "Texto principal\nAl contestar cite: 2021-01-574337\nConsecutivo 100.000016\nMás texto",
        "A contestar a: 2021-01-574337\nTipo: Interna\nFecha: 24/03/2021\nExp: 39241\nCircular Externa\nOtro texto",
      ])
    ).toBe("Texto principal\nMás texto\nOtro texto");
  });
});

describe("runVision", () => {
  it("builds a content-only Llama 3.2 Vision request", async () => {
    const calls: Array<{ model: string; payload: unknown }> = [];
    const env = {
      AI: {
        run: async (model: string, payload: unknown) => {
          calls.push({ model, payload });
          return { response: "texto" };
        },
      },
    } as unknown as Env;

    await runVision(
      env,
      "@cf/meta/llama-3.2-11b-vision-instruct",
      "data:image/png;base64,abc"
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe("@cf/meta/llama-3.2-11b-vision-instruct");

    const payload = calls[0].payload as {
      image?: unknown;
      messages: Array<{ role: string; content: unknown }>;
      max_tokens: number;
      temperature: number;
    };
    expect(payload.image).toBeUndefined();
    expect(payload.messages).toHaveLength(2);
    expect(payload.messages[1].content).toEqual([
      { type: "text", text: expect.any(String) },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,abc" },
      },
    ]);
    expect(payload.max_tokens).toBe(OCR_MAX_TOKENS);
    expect(payload.temperature).toBe(0);
  });

  it("accepts the Llama license once and retries the request", async () => {
    const payloads: unknown[] = [];
    const env = {
      AI: {
        run: async (_model: string, payload: unknown) => {
          payloads.push(payload);
          if (payloads.length === 1) {
            throw new Error(
              "5016: Prior to using this model, you must submit the prompt 'agree'."
            );
          }
          return { response: payloads.length === 2 ? "agreed" : "texto" };
        },
      },
    } as unknown as Env;

    await expect(
      runVision(
        env,
        "@cf/meta/llama-3.2-11b-vision-instruct",
        "data:image/png;base64,abc"
      )
    ).resolves.toEqual({ response: "texto" });
    expect(payloads).toHaveLength(3);
    expect(payloads[1]).toEqual({ prompt: "agree" });
  });
});
