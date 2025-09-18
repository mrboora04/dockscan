// src/parser.js
export function summarizeFields(p) {
  const out = [];
  if (p.model) out.push(`model=${p.model}`);
  if (p.customer) out.push(`customer=${p.customer}`);
  return out.join(' · ');
}
