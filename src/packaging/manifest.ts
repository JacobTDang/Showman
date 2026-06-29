/**
 * LMS package manifests — the standards files an LMS/LRS ingests: SCORM 1.2 / 2004
 * (imsmanifest.xml), cmi5 (cmi5.xml, xAPI-based), and IMS Common Cartridge (imsmanifest.xml).
 * Pure string builders; all author-supplied text is XML-escaped.
 */

import { createHash } from "node:crypto";

export interface PackageFile {
  /** Path within the package (forward slashes). */
  path: string;
  content: Buffer;
}

export interface LessonMeta {
  /** Course/lesson id — an IRI for cmi5/xAPI, or any stable string for SCORM/CC. */
  id: string;
  title: string;
  description?: string;
  /** Launch file within the package. Default `"index.html"`. */
  launch?: string;
}

const ESC: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" };
const esc = (s: string): string => s.replace(/[<>&'"]/g, (c) => ESC[c]!);
const norm = (p: string): string => p.replace(/\\/g, "/");

/** A schema-safe NCName for a SCORM/CC manifest `identifier` (xs:ID): a stable hash of the id,
 * so an IRI/arbitrary id (which can't be an NCName) still yields a valid, unique identifier. */
const safeId = (s: string): string => `M-${createHash("sha1").update(s).digest("hex").slice(0, 24)}`;

/** `<file href="…"/>` lines for every bundled file (the manifest itself is excluded). */
function fileEntries(files: PackageFile[]): string {
  return files.map((f) => `      <file href="${esc(norm(f.path))}"/>`).join("\n");
}

export function scormManifest(meta: LessonMeta, files: PackageFile[], version: "1.2" | "2004" = "1.2"): string {
  const id = safeId(meta.id); // @identifier is xs:ID (NCName) — an IRI would be invalid
  const title = esc(meta.title);
  const launch = esc(norm(meta.launch ?? "index.html"));
  const schemaVer = version === "1.2" ? "1.2" : "2004 4th Edition";
  const cpNs = version === "1.2" ? "http://www.imsproject.org/xsd/imscp_rootv1p1p2" : "http://www.imsglobal.org/xsd/imscp_v1p1";
  const adlcpNs = version === "1.2" ? "http://www.adlnet.org/xsd/adlcp_rootv1p2" : "http://www.adlnet.org/xsd/adlcp_v1p3";
  const scormType = version === "1.2" ? "adlcp:scormtype" : "adlcp:scormType";
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}" version="1.0"
  xmlns="${cpNs}"
  xmlns:adlcp="${adlcpNs}">
  <metadata><schema>ADL SCORM</schema><schemaversion>${schemaVer}</schemaversion></metadata>
  <organizations default="ORG">
    <organization identifier="ORG">
      <title>${title}</title>
      <item identifier="ITEM" identifierref="RES"><title>${title}</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES" type="webcontent" ${scormType}="sco" href="${launch}">
${fileEntries(files)}
    </resource>
  </resources>
</manifest>
`;
}

export function cmi5Manifest(meta: LessonMeta): string {
  const id = esc(meta.id);
  const title = esc(meta.title);
  const desc = esc(meta.description ?? meta.title);
  const launch = esc(norm(meta.launch ?? "index.html"));
  return `<?xml version="1.0" encoding="UTF-8"?>
<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd">
  <course id="${id}">
    <title><langstring lang="en-US">${title}</langstring></title>
    <description><langstring lang="en-US">${desc}</langstring></description>
  </course>
  <au id="${id}/au" launchMethod="OwnWindow" moveOn="Completed">
    <title><langstring lang="en-US">${title}</langstring></title>
    <description><langstring lang="en-US">${desc}</langstring></description>
    <url>${launch}</url>
  </au>
</courseStructure>
`;
}

export function commonCartridgeManifest(meta: LessonMeta, files: PackageFile[]): string {
  const id = safeId(meta.id); // @identifier is xs:ID (NCName)
  const title = esc(meta.title);
  const launch = esc(norm(meta.launch ?? "index.html"));
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}"
  xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1">
  <metadata><schema>IMS Common Cartridge</schema><schemaversion>1.1.0</schemaversion></metadata>
  <organizations>
    <organization identifier="ORG" structure="rooted-hierarchy">
      <item identifier="ROOT">
        <item identifier="ITEM" identifierref="RES"><title>${title}</title></item>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES" type="webcontent" href="${launch}">
${fileEntries(files)}
    </resource>
  </resources>
</manifest>
`;
}
