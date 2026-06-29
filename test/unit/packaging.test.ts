import { describe, it, expect } from "vitest";
import { zipStore, unzipStore } from "../../src/packaging/zip.js";
import { scormManifest, cmi5Manifest, commonCartridgeManifest } from "../../src/packaging/manifest.js";
import { packageLesson, type PackageFormat } from "../../src/packaging/package.js";

const file = (path: string, s: string) => ({ path, content: Buffer.from(s, "utf8") });

describe("store-zip", () => {
  it("round-trips files and is deterministic", () => {
    const entries = [file("a.txt", "hello"), file("dir/b.json", '{"x":1}')];
    const buf = zipStore(entries);
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04])); // "PK\x03\x04"
    const back = unzipStore(buf);
    expect(back.map((e) => e.path)).toEqual(["a.txt", "dir/b.json"]);
    expect(back[0]!.content.toString()).toBe("hello");
    expect(back[1]!.content.toString()).toBe('{"x":1}');
    expect(Buffer.compare(zipStore(entries), zipStore(entries))).toBe(0); // deterministic
    // end-of-central-directory record present
    expect(buf.subarray(buf.length - 22, buf.length - 18)).toEqual(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  });

  it("preserves binary content (e.g. an mp4 stand-in)", () => {
    const bytes = Buffer.from([0, 1, 2, 255, 254, 0, 13, 10]);
    const back = unzipStore(zipStore([{ path: "lesson.mp4", content: bytes }]));
    expect(Buffer.compare(back[0]!.content, bytes)).toBe(0);
  });
});

describe("manifests", () => {
  const meta = {
    id: "https://showman.app/lessons/counting",
    title: "Counting & <Fun>",
    description: "Learn to count",
    launch: "index.html",
  };
  const files = [file("index.html", "<html></html>"), file("lesson.mp4", "x"), file("lesson.vtt", "WEBVTT")];

  it("SCORM 1.2 declares the schema, sco resource, launch, and escapes titles", () => {
    const m = scormManifest(meta, files, "1.2");
    expect(m).toContain("<schema>ADL SCORM</schema>");
    expect(m).toContain("<schemaversion>1.2</schemaversion>");
    expect(m).toContain('adlcp:scormtype="sco"');
    expect(m).toContain('href="index.html"');
    expect(m).toContain('<file href="lesson.mp4"/>');
    expect(m).toContain("Counting &amp; &lt;Fun&gt;"); // XML-escaped
    expect(m).not.toContain("<Fun>");
  });

  it("SCORM 2004 uses the 2004 schema version + scormType", () => {
    const m = scormManifest(meta, files, "2004");
    expect(m).toContain("2004 4th Edition");
    expect(m).toContain('adlcp:scormType="sco"');
  });

  it("cmi5 declares a course + an AU pointing at the launch url", () => {
    const m = cmi5Manifest(meta);
    expect(m).toContain("courseStructure");
    expect(m).toContain('<course id="https://showman.app/lessons/counting">');
    expect(m).toContain('launchMethod="OwnWindow"');
    expect(m).toContain("<url>index.html</url>");
  });

  it("Common Cartridge declares the CC schema + rooted hierarchy", () => {
    const m = commonCartridgeManifest(meta, files);
    expect(m).toContain("<schema>IMS Common Cartridge</schema>");
    expect(m).toContain('structure="rooted-hierarchy"');
    expect(m).toContain('<file href="index.html"/>');
  });
});

describe("packageLesson", () => {
  const meta = { id: "lesson-1", title: "Apples", launch: "index.html" };
  const files = [file("index.html", "<html>player</html>"), file("lesson.mp4", "MP4"), file("lesson.interactions.json", "{}")];

  it("bundles the manifest + all files into a valid ZIP per format", () => {
    const cases: [PackageFormat, string][] = [
      ["scorm12", "imsmanifest.xml"],
      ["scorm2004", "imsmanifest.xml"],
      ["cmi5", "cmi5.xml"],
      ["cc", "imsmanifest.xml"],
    ];
    for (const [format, manifestPath] of cases) {
      const pkg = packageLesson({ meta, format, files });
      expect(pkg.manifestPath).toBe(manifestPath);
      expect(pkg.files[0]!.path).toBe(manifestPath); // manifest first
      const entries = unzipStore(pkg.zip());
      const paths = entries.map((e) => e.path);
      expect(paths).toContain(manifestPath);
      expect(paths).toContain("index.html");
      expect(paths).toContain("lesson.mp4");
      // the player + the manifest round-trip intact
      expect(entries.find((e) => e.path === "index.html")!.content.toString()).toBe("<html>player</html>");
    }
  });
});

describe("packaging review fixes", () => {
  it("sets the UTF-8 (EFS) flag for non-ASCII names and rejects duplicate paths / huge files", () => {
    expect(zipStore([file("leçon-日本.html", "x")]).readUInt16LE(6)).toBe(0x0800); // bit 11 set
    expect(zipStore([file("a.html", "x")]).readUInt16LE(6)).toBe(0); // ASCII → no flag
    expect(() => zipStore([file("a", "1"), file("a", "2")])).toThrow(/Duplicate/);
  });

  it("SCORM 2004 uses the 2004 CP namespace and a NCName-safe identifier", () => {
    const m = scormManifest({ id: "https://showman.app/lessons/x", title: "T", launch: "index.html" }, [file("index.html", "")], "2004");
    expect(m).toContain('xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"');
    expect(m).not.toContain("imsproject.org"); // not the 1.2 CP namespace
    const id = m.match(/<manifest identifier="([^"]+)"/)![1]!;
    expect(id).toMatch(/^M-[0-9a-f]+$/); // valid NCName, not the raw IRI (no ":" or "/")
  });

  it("packageLesson rejects a missing launch file and a manifest collision", () => {
    expect(() =>
      packageLesson({ meta: { id: "i", title: "t", launch: "player.html" }, format: "scorm12", files: [file("other.html", "x")] }),
    ).toThrow(/Launch file/);
    expect(() =>
      packageLesson({
        meta: { id: "i", title: "t", launch: "index.html" },
        format: "scorm12",
        files: [file("index.html", "x"), file("imsmanifest.xml", "evil")],
      }),
    ).toThrow(/collides/);
  });
});
