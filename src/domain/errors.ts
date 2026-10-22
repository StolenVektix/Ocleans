export type DomainErrorCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "SUSPENDED"
  | "NOT_VERIFIED"
  | "MEAL_CANCELLED"
  | "MEAL_STARTED"
  | "MEAL_FULL"
  | "ALREADY_REQUESTED"
  | "INVALID_TRANSITION"
  | "SEATS_BELOW_ACCEPTED"
  | "ALREADY_VERIFIED"
  | "VERIFICATION_PENDING"
  | "NOT_UNIVERSITY_EMAIL"
  | "EMAIL_NOT_VERIFIED";

const MESSAGES: Record<DomainErrorCode, string> = {
  FORBIDDEN: "Vous n'avez pas le droit de faire cette action.",
  NOT_FOUND: "Élément introuvable.",
  SUSPENDED: "Votre compte est suspendu.",
  NOT_VERIFIED: "Votre statut étudiant doit être vérifié avant de demander un repas.",
  MEAL_CANCELLED: "Ce repas a été annulé.",
  MEAL_STARTED: "Ce repas a déjà commencé.",
  MEAL_FULL: "Ce repas est complet.",
  ALREADY_REQUESTED: "Vous avez déjà fait une demande pour ce repas.",
  INVALID_TRANSITION: "Cette demande a déjà reçu une réponse.",
  SEATS_BELOW_ACCEPTED: "Le nombre de places ne peut pas être inférieur au nombre d'étudiants déjà acceptés.",
  ALREADY_VERIFIED: "Votre statut étudiant est déjà vérifié.",
  VERIFICATION_PENDING: "Une vérification est déjà en cours d'examen.",
  NOT_UNIVERSITY_EMAIL: "L'adresse de votre compte n'est pas une adresse universitaire reconnue.",
  EMAIL_NOT_VERIFIED: "Votre adresse n'a pas encore été confirmée avec le code reçu par email.",
};

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode) {
    super(MESSAGES[code]);
    this.name = "DomainError";
    this.code = code;
  }
}
