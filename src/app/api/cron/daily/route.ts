import { getDb } from "@/db/client";
import { getEmailSender } from "@/services/email";
import { getCardStorage } from "@/services/storage";
import { isAuthorizedCron, runDailyJob } from "@/server/cron";
import { appUrl } from "@/server/notifications/delivery";

// Déclenché chaque jour par Vercel Cron, en Production uniquement (vercel.json).
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Non autorisé", { status: 401 });
  }
  const result = await runDailyJob(getDb(), getEmailSender(), { appUrl: appUrl(), storage: getCardStorage() });
  return Response.json(result);
}
