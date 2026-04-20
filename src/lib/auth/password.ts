export const PASSWORD_MIN_LENGTH = 8;
const SPECIAL_CHAR_RE = /[^A-Za-z0-9]/;

export const PASSWORD_RULES_LABEL =
  "At least 8 characters and one special character (e.g. !@#$%).";

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!SPECIAL_CHAR_RE.test(password)) {
    return "Password must include at least one special character.";
  }
  return null;
}
