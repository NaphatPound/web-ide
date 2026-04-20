export type TerminalSender = (text: string) => void;

const senders = new Map<string, TerminalSender>();

export function registerTerminalSender(
  id: string,
  send: TerminalSender
): () => void {
  senders.set(id, send);
  return () => {
    if (senders.get(id) === send) senders.delete(id);
  };
}

export function sendToTerminal(id: string, text: string): boolean {
  const send = senders.get(id);
  if (!send) return false;
  send(text);
  return true;
}

export function hasTerminalSender(id: string): boolean {
  return senders.has(id);
}

export function __resetTerminalBusForTests(): void {
  senders.clear();
}
