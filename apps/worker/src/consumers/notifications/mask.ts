/**
 * Masking for anything that is logged or stored as a "recipient" (NotificationLog.recipient).
 * Never write a full email or phone number to logs (AGENTS.md rule 5). Owner: M8.
 */

/** `john.doe@example.com` → `j******e@example.com` (first and last character of the local part kept). */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0]}*${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 6))}${local[local.length - 1]}${domain}`;
}

/** `+94771234567` → `*********567` (only the last 3 digits survive). */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 3) return '***';
  return `${'*'.repeat(Math.min(digits.length - 3, 9))}${digits.slice(-3)}`;
}
