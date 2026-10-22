import { describe, expect, it, vi } from "vitest";
import { createLogEmailSender, createResendEmailSender, getEmailSender, maskEmail, renderEmail } from "./email";

describe("maskEmail", () => {
  it("ne garde que la première lettre et le domaine", () => {
    expect(maskEmail("lea.martin@etu.u-bordeaux.fr")).toBe("l***@etu.u-bordeaux.fr");
    expect(maskEmail("pas-une-adresse")).toBe("***");
  });
});

describe("renderEmail", () => {
  it("compose sujet et texte avec un lien absolu", () => {
    const mail = renderEmail({ title: "Demande acceptée !", body: "Mireille vous attend.", link: "/etudiant/mes-repas" }, "https://ocleans-demo.vercel.app/");
    expect(mail.subject).toBe("Ocleans — Demande acceptée !");
    expect(mail.text).toContain("Mireille vous attend.");
    expect(mail.text).toContain("https://ocleans-demo.vercel.app/etudiant/mes-repas");
  });
});

describe("expéditeurs", () => {
  it("le mode log n'écrit ni le texte ni l'adresse complète", async () => {
    const lines: string[] = [];
    const sender = createLogEmailSender((l) => lines.push(l));
    await sender.send({ to: "lea@etu.u-bordeaux.fr", subject: "Ocleans — Rappel", text: "18 rue secrète" });
    expect(sender.mode).toBe("log");
    expect(lines.join("\n")).toContain("l***@etu.u-bordeaux.fr");
    expect(lines.join("\n")).toContain("Ocleans — Rappel");
    expect(lines.join("\n")).not.toContain("18 rue secrète");
  });

  it("le mode Resend appelle l'API et signale une erreur HTTP", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 200 })).mockResolvedValueOnce(new Response("bad", { status: 422 }));
    const sender = createResendEmailSender({ apiKey: "re_test", from: "Ocleans <bonjour@ocleans.fr>", fetchImpl });
    await sender.send({ to: "a@b.fr", subject: "S", text: "T" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(init.body)).toEqual({ from: "Ocleans <bonjour@ocleans.fr>", to: ["a@b.fr"], subject: "S", text: "T" });
    expect(init.headers.Authorization).toBe("Bearer re_test");
    await expect(sender.send({ to: "a@b.fr", subject: "S", text: "T" })).rejects.toThrow("422");
  });

  it("choisit Resend seulement si la clé et l'expéditeur sont définis", () => {
    expect(getEmailSender({}).mode).toBe("log");
    expect(getEmailSender({ RESEND_API_KEY: "re_x" }).mode).toBe("log");
    expect(getEmailSender({ RESEND_API_KEY: "re_x", EMAIL_FROM: "a@b.fr" }).mode).toBe("resend");
  });
});
