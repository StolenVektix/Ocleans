export const DEMO_ACCOUNTS = [
  { email: "mireille.demo@example.com", label: "Mireille — hôte aux Chartrons" },
  { email: "lea.demo@example.com", label: "Léa — étudiante vérifiée" },
  { email: "admin.demo@example.com", label: "Admin Ocleans" },
] as const;

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}
