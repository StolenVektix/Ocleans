// Seules ces adresses peuvent être supprimées par le nettoyage des tests de bout en bout.
const E2E_EMAIL = /^e2e\+[a-z0-9-]+@example\.com$/;

export function isE2eEmail(email: string): boolean {
  return E2E_EMAIL.test(email);
}
