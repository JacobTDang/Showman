import { describe, it, expect } from "vitest";
import { KokoroTtsProvider, type KokoroModule } from "../../src/audio/providers/kokoroTts.js";
import { SAMPLE_RATE } from "../../src/audio/wav.js";

interface Calls {
  device?: string;
  fromPretrained: number;
  generate: number;
}

/** A fake `kokoro-js` module: `from_pretrained` throws for any device in `failDevices`. */
function fakeModule(failDevices: string[] = []): { module: KokoroModule; calls: Calls } {
  const calls: Calls = { fromPretrained: 0, generate: 0 };
  const module: KokoroModule = {
    KokoroTTS: {
      from_pretrained: async (_model, o) => {
        calls.fromPretrained++;
        if (failDevices.includes(o.device ?? "")) throw new Error(`no ${o.device}`);
        calls.device = o.device;
        return {
          generate: async () => {
            calls.generate++;
            const audio = new Float32Array(2400).map((_, i) => 0.2 * Math.sin(i / 30)); // 0.1s @ 24 kHz
            return { audio, sampling_rate: 24000 };
          },
        };
      },
    },
  };
  return { module, calls };
}

const silent = (): void => {};

describe("KokoroTtsProvider", () => {
  it("converts Float32 24 kHz output to Int16 PCM at the engine rate", async () => {
    const { module } = fakeModule();
    const tts = new KokoroTtsProvider({ load: async () => module, log: silent });
    const s = await tts.synthesize("hello");
    expect(s.sampleRate).toBe(SAMPLE_RATE);
    expect(s.pcm).toBeInstanceOf(Int16Array);
    expect(s.pcm.length).toBe(2205); // 2400 @ 24k -> 2205 @ 22050
    expect(s.durationSec).toBeCloseTo(2205 / SAMPLE_RATE, 10);
  });

  it("tries the GPU first (cuda) by default", async () => {
    const { module, calls } = fakeModule();
    await new KokoroTtsProvider({ load: async () => module, log: silent }).synthesize("hi");
    expect(calls.device).toBe("cuda");
  });

  it("falls back through devices to CPU when the GPU is unavailable", async () => {
    const { module, calls } = fakeModule(["cuda", "webgpu"]);
    await new KokoroTtsProvider({ load: async () => module, log: silent }).synthesize("hi");
    expect(calls.device).toBe("cpu");
    expect(calls.fromPretrained).toBe(3); // cuda, webgpu, cpu
  });

  it("honors an explicit device", async () => {
    const { module, calls } = fakeModule();
    await new KokoroTtsProvider({ device: "webgpu", load: async () => module, log: silent }).synthesize("hi");
    expect(calls.device).toBe("webgpu");
  });

  it("loads the model once across calls (memoized)", async () => {
    const { module, calls } = fakeModule();
    const tts = new KokoroTtsProvider({ load: async () => module, log: silent });
    await tts.synthesize("one");
    await tts.synthesize("two");
    expect(calls.fromPretrained).toBe(1);
    expect(calls.generate).toBe(2);
  });

  it("returns silence without loading the model for empty text", async () => {
    let loaded = false;
    const tts = new KokoroTtsProvider({
      load: async () => {
        loaded = true;
        return fakeModule().module;
      },
      log: silent,
    });
    const s = await tts.synthesize("   ");
    expect(loaded).toBe(false);
    expect(s.pcm.length).toBe(Math.round(0.3 * SAMPLE_RATE));
  });

  it("exposes a stable cache id without the device", () => {
    expect(new KokoroTtsProvider({ model: "m", voice: "af_heart" }).id).toBe(`kokoro:m:af_heart:${SAMPLE_RATE}`);
  });

  it("falls back to the default voice when an unknown voice is requested (and memoizes it)", async () => {
    const calls = { generate: 0, lastVoice: undefined as string | undefined };
    const module: KokoroModule = {
      KokoroTTS: {
        from_pretrained: async () => ({
          generate: async (_t: string, o: { voice?: string }) => {
            calls.generate++;
            if (o.voice !== "af_heart") throw new Error(`Voice "${o.voice ?? ""}" not found`);
            calls.lastVoice = o.voice;
            return { audio: new Float32Array(2400), sampling_rate: 24000 };
          },
        }),
      },
    };
    const tts = new KokoroTtsProvider({ load: async () => module, log: silent });

    const s = await tts.synthesize("hi", { voice: "child-friendly" });
    expect(s.pcm.length).toBeGreaterThan(0); // did not crash
    expect(calls.lastVoice).toBe("af_heart"); // fell back to the default

    // A second call with the same bad voice skips it entirely (memoized) — one generate, no throw+retry.
    const before = calls.generate;
    await tts.synthesize("again", { voice: "child-friendly" });
    expect(calls.generate).toBe(before + 1);
  });

  it("gives a clear error when kokoro-js is not installed", async () => {
    const tts = new KokoroTtsProvider({
      load: async () => {
        throw new Error("Cannot find module 'kokoro-js'");
      },
      log: silent,
    });
    await expect(tts.synthesize("hi")).rejects.toThrow(/npm install kokoro-js/);
  });
});
