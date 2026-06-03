import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export function isValidPasswordPolicy(password: string): boolean {
  return PASSWORD_REGEX.test(password);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateRandomPassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  if (!/[A-Za-z]/.test(out)) out = `A${out.slice(1)}`;
  if (!/\d/.test(out)) out = `${out.slice(0, out.length - 1)}8`;
  return out;
}
