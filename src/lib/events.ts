/**
 * Tiny in-process SSE hub: every open /api/events stream registers a sender,
 * and store mutations broadcast a "changed" event so all connected devices
 * refresh instantly (no waiting for the polling tick).
 */

export type SseSender = (chunk: string) => void;

const g = globalThis as typeof globalThis & { __stsSseClients?: Set<SseSender> };

export const sseClients = (g.__stsSseClients ??= new Set<SseSender>());

export function broadcast(event: { type: "changed" }): void {
  const chunk = `data: ${JSON.stringify(event)}\n\n`;
  for (const send of Array.from(sseClients)) {
    try {
      send(chunk);
    } catch {
      sseClients.delete(send);
    }
  }
}
