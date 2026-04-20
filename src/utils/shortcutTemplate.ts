const TEMPLATE_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function extractTemplateVars(command: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  TEMPLATE_RE.lastIndex = 0;
  while ((m = TEMPLATE_RE.exec(command)) !== null) {
    const name = m[1];
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

export function fillTemplate(
  command: string,
  values: Record<string, string>
): string {
  return command.replace(TEMPLATE_RE, (_, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : ""
  );
}

export function hasTemplateVars(command: string): boolean {
  TEMPLATE_RE.lastIndex = 0;
  return TEMPLATE_RE.test(command);
}
