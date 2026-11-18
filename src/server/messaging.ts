import "server-only";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";

/**
 * Outbound messaging with pluggable providers. Every attempt is written to
 * OutboundMessage with its real outcome. When a provider's credentials are not
 * configured the message is stored with status NOT_CONFIGURED — never reported as sent.
 *
 * Providers:
 *  - Email: any SMTP server (Gmail Workspace, Zoho, Mailgun, Amazon SES SMTP)
 *  - SMS: Africa's Talking (Uganda: MTN/Airtel). ~UGX 25–35 per SMS segment.
 *  - WhatsApp: Meta WhatsApp Cloud API (business verification + approved templates).
 */
export type Channel = "SMS" | "EMAIL" | "WHATSAPP";

export function channelConfigured(channel: Channel) {
  if (channel === "EMAIL") return !!process.env.SMTP_HOST;
  if (channel === "SMS") return !!(process.env.AT_USERNAME && process.env.AT_API_KEY);
  return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

/** Uganda numbers to E.164 (+2567XXXXXXXX). */
export function normalizeUgPhone(raw: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("256")) return `+${digits}`;
  if (digits.startsWith("0")) return `+256${digits.slice(1)}`;
  if (digits.length === 9) return `+256${digits}`;
  return digits;
}

export function renderTemplate(body: string, vars: Record<string, string | number | null | undefined>) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(vars[k] ?? ""));
}

type SendInput = { channel: Channel; to: string; toName?: string; subject?: string; body: string; category: string; userId?: string | null };

export async function sendMessage(m: SendInput) {
  const recipient = m.channel === "EMAIL" ? m.to.trim() : normalizeUgPhone(m.to);
  const base = { channel: m.channel, recipient, recipientName: m.toName, subject: m.subject, body: m.body, category: m.category, createdById: m.userId ?? null };
  if (!channelConfigured(m.channel)) {
    return prisma.outboundMessage.create({ data: { ...base, status: "NOT_CONFIGURED", error: `${m.channel} provider credentials are not configured.` } });
  }
  try {
    let provider = "";
    let providerRef: string | null = null;
    if (m.channel === "EMAIL") {
      provider = "SMTP";
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT) === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      });
      const info = await transport.sendMail({ from: process.env.SMTP_FROM, to: recipient, subject: m.subject ?? "Bishop Ogez High School", text: m.body });
      providerRef = info.messageId;
    } else if (m.channel === "SMS") {
      provider = "AfricasTalking";
      const res = await fetch("https://api.africastalking.com/version1/messaging", {
        method: "POST",
        headers: { apiKey: process.env.AT_API_KEY!, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username: process.env.AT_USERNAME!, to: recipient, message: m.body, ...(process.env.AT_SENDER_ID ? { from: process.env.AT_SENDER_ID } : {}) }),
      });
      const json: any = await res.json().catch(() => ({}));
      const r = json?.SMSMessageData?.Recipients?.[0];
      if (!res.ok || !r || !String(r.status).toLowerCase().includes("success")) throw new Error(r?.status || json?.SMSMessageData?.Message || `HTTP ${res.status}`);
      providerRef = r.messageId;
    } else {
      provider = "WhatsAppCloud";
      const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: recipient.replace("+", ""), type: "text", text: { body: m.body } }),
      });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
      providerRef = json?.messages?.[0]?.id ?? null;
    }
    return prisma.outboundMessage.create({ data: { ...base, status: "SENT", provider, providerRef } });
  } catch (e) {
    return prisma.outboundMessage.create({ data: { ...base, status: "FAILED", error: e instanceof Error ? e.message.slice(0, 500) : "Unknown error" } });
  }
}
