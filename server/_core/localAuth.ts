import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import * as db from "../db";

const PASSWORD_KEY_LENGTH = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString("hex");
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, expectedHex] = storedHash.split(":");
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(password, salt, PASSWORD_KEY_LENGTH);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function registerLocalUser(input: { email: string; name: string; password: string; role: "patient" | "client" }) {
  return db.createLocalUser({
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    passwordHash: hashPassword(input.password),
    role: input.role,
  });
}

export async function authenticateLocalUser(email: string, password: string) {
  const user = await db.getUserByEmail(email.trim().toLowerCase());
  if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
    throw new Error("E-mail ou mot de passe incorrect");
  }
  await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
  return user;
}