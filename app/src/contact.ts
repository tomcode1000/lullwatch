// Messages go from her own phone's messaging app: no SMS service, no server,
// nobody else holding her number or her news.

import type { Advice } from "./engine/labour";

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function partnerMessage(a: Advice, hospital: string, now: number): string | null {
  const where = hospital.trim() || "the hospital";
  if (a.stage === "go-now") return `I need to go to ${where} now. Please come or call me. (Lullwatch)`;
  if (a.stage === "leave") return `It's time to leave for ${where}. Please come now. (Lullwatch)`;
  if (a.stage === "pack" && a.leaveBy !== null) {
    return `Contractions are getting close. I'm packing; we should leave for ${where} by ${clock(a.leaveBy)}${a.leaveBy > now ? "" : " (now)"}. (Lullwatch)`;
  }
  return null;
}

const digits = (phone: string) => phone.replace(/[^\d+]/g, "");

// "?&body=" is understood by both iOS and Android messaging apps.
export const smsLink = (phone: string, body: string) => `sms:${digits(phone)}?&body=${encodeURIComponent(body)}`;
export const telLink = (phone: string) => `tel:${digits(phone)}`;
