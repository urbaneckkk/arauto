import { createHash } from "node:crypto";

export function sha1(texto: string): string {
  return createHash("sha1").update(texto).digest("hex");
}
