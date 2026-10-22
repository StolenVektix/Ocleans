# Ocleans

Repas partagés entre habitants et étudiants à Bordeaux : un hôte cuisine une portion de plus, un étudiant vérifié demande à partager le repas.

- Spec : `docs/superpowers/specs/2026-10-21-ocleans-repas-solidaires-design.md`
- Démo : https://ocleans-demo.vercel.app

## Démarrer en local

```bash
npm install
cp .env.example .env.local   # puis remplir les valeurs (branches Neon demo et test)
npm run db:migrate
npm run db:migrate:test
npm run seed:demo
npm run dev
```

## Vérification étudiante

- Par **email universitaire** : l'étudiant crée son compte avec son adresse `@etu.u-bordeaux.fr` et reçoit un code envoyé par Neon Auth. Les domaines acceptés sont dans `src/config/university-domains.ts` : n'y ajouter qu'un domaine confirmé.
- Par **carte étudiante** : la photo (4 Mo maximum) est stockée dans le bucket privé `student-cards` de Neon Object Storage, puis supprimée dès que l'admin a tranché sur `/admin/verifications`.
- Variables : `NEON_STORAGE_*` (voir `.env.example`). Vérification du bucket : `npx tsx scripts/check-storage.ts`.

## Commandes

| Commande | Rôle |
|---|---|
| `npm test` | Tests unitaires (règles métier) |
| `npm run test:integration` | Tests contre la branche Neon `test` |
| `npm run db:generate` | Générer une migration après modification de `src/db/schema.ts` |
| `npm run db:migrate` / `db:migrate:test` | Appliquer les migrations sur `demo` / `test` |
| `npm run seed:demo` | (Ré)initialiser les données de démo |
| `vercel deploy --target preview` | Déployer une Preview (démo), puis `vercel alias set <url> ocleans-demo.vercel.app` |

La Production Vercel n'a volontairement aucune variable d'environnement : elle est réservée au futur pilote. La démo Preview est publique : `npm run seed:demo` remet ses données à zéro.
