export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  readonly mode: "log" | "resend";
  send(message: EmailMessage): Promise<void>;
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

export function renderEmail(n: { title: string; body: string; link: string }, appUrl: string): { subject: string; text: string } {
  const url = new URL(n.link, appUrl).toString();
  return {
    subject: `Ocleans — ${n.title}`,
    text: `${n.body}\n\nVoir sur Ocleans : ${url}\n\n— L'équipe Ocleans`,
  };
}

// Sans domaine configuré : on journalise seulement l'essentiel, jamais le texte (il peut contenir des données personnelles).
export function createLogEmailSender(log: (line: string) => void = (l) => console.info(l)): EmailSender {
  return {
    mode: "log",
    async send(message) {
      log(`[email:log] à ${maskEmail(message.to)} — ${message.subject}`);
    },
  };
}

export function createResendEmailSender(cfg: { apiKey: string; from: string; fetchImpl?: typeof fetch }): EmailSender {
  const doFetch = cfg.fetchImpl ?? fetch;
  return {
    mode: "resend",
    async send(message) {
      const response = await doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: cfg.from, to: [message.to], subject: message.subject, text: message.text }),
      });
      if (!response.ok) throw new Error(`Resend a répondu ${response.status}`);
    },
  };
}

export function getEmailSender(env: Record<string, string | undefined> = process.env): EmailSender {
  if (env.RESEND_API_KEY && env.EMAIL_FROM) return createResendEmailSender({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
  return createLogEmailSender();
}
