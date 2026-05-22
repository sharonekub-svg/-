export function formatPhoneIL(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

export function phoneDigitsOnly(formatted: string): string {
  return formatted.replace(/\D/g, '');
}

export function formatAgorot(amount: number): string {
  const shekels = amount / 100;
  return `\u20aa${shekels.toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
}
