/**
 * LMS packaging — bundle a rendered lesson (mp4 + captions + interactions + the player) into the
 * standard package an LMS/LRS ingests: a SCORM, cmi5, or Common Cartridge ZIP. Pure: the manifest
 * is generated from the metadata and the (caller-provided) files are stored uncompressed.
 */

import { zipStore, type ZipEntry } from "./zip.js";
import { scormManifest, cmi5Manifest, commonCartridgeManifest, type LessonMeta, type PackageFile } from "./manifest.js";

export type PackageFormat = "scorm12" | "scorm2004" | "cmi5" | "cc";

export interface PackageInput {
  meta: LessonMeta;
  format: PackageFormat;
  /** Bundle contents — must include the launch file (e.g. the player HTML at meta.launch). */
  files: PackageFile[];
}

export interface LessonPackage {
  format: PackageFormat;
  manifestPath: string;
  /** Every file in the package (manifest first), ready to write to disk. */
  files: PackageFile[];
  /** Build the ZIP bundle. */
  zip(): Buffer;
}

/** Assemble an LMS package: prepend the format's manifest to the provided files. */
export function packageLesson(input: PackageInput): LessonPackage {
  let manifestPath: string;
  let manifest: string;
  switch (input.format) {
    case "scorm12":
      manifestPath = "imsmanifest.xml";
      manifest = scormManifest(input.meta, input.files, "1.2");
      break;
    case "scorm2004":
      manifestPath = "imsmanifest.xml";
      manifest = scormManifest(input.meta, input.files, "2004");
      break;
    case "cmi5":
      manifestPath = "cmi5.xml";
      manifest = cmi5Manifest(input.meta);
      break;
    case "cc":
      manifestPath = "imsmanifest.xml";
      manifest = commonCartridgeManifest(input.meta, input.files);
      break;
  }
  const files: PackageFile[] = [{ path: manifestPath, content: Buffer.from(manifest, "utf8") }, ...input.files];
  return {
    format: input.format,
    manifestPath,
    files,
    zip: () => zipStore(files as ZipEntry[]),
  };
}
