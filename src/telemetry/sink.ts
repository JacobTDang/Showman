/**
 * LRS sink — where xAPI statements go. The interface lets a real deployment POST to a Learning
 * Record Store; the in-memory sink is for tests and local runs. (No network here — emitting to
 * a real LRS is a deployment concern, kept out of the deterministic core.)
 */

import type { XapiStatement } from "./xapi.js";

export interface LrsSink {
  send(statements: XapiStatement[]): Promise<void> | void;
}

/** Collects statements in memory — for tests and for buffering before a flush. */
export class InMemoryLrs implements LrsSink {
  readonly statements: XapiStatement[] = [];
  send(statements: XapiStatement[]): void {
    this.statements.push(...statements);
  }
  /** The xAPI statement payload (a JSON array) ready to POST to an LRS. */
  toJson(): string {
    return JSON.stringify(this.statements);
  }
}
