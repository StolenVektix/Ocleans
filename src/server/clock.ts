// Heure courante pour les composants serveur (la règle de pureté de React interdit Date.now() dans le rendu).
export function currentTime(): number {
  return Date.now();
}
