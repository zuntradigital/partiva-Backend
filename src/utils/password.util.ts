import bcrypt from "bcrypt";
import { env } from "../config/env.js";

const MIN_PASSWORD_LENGTH = 8;

export const hashPassword = (plainPassword: string): Promise<string> => {
  return bcrypt.hash(plainPassword, env.bcryptSaltRounds);
};

export const comparePassword = (plainPassword: string, passwordHash: string): Promise<boolean> => {
  return bcrypt.compare(plainPassword, passwordHash);
};

export const isPasswordStrongEnough = (plainPassword: string): boolean => {
  return typeof plainPassword === "string" && plainPassword.length >= MIN_PASSWORD_LENGTH;
};
