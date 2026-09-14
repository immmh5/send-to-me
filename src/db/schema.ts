import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { StoredFile } from "@/lib/types";

/**
 * Single-row config table (id = "main"):
 *  - salt + passwordHash : scrypt credentials for the one shared password
 *  - secret              : HMAC key used to sign session tokens
 *  - passwordChanged     : becomes true once the default password is replaced
 */
export const config = pgTable("config", {
  id: text("id").primaryKey(),
  salt: text("salt").notNull(),
  passwordHash: text("password_hash").notNull(),
  secret: text("secret").notNull(),
  passwordChanged: boolean("password_changed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One inbox entry = optional text + any number of files.
 * File bytes live on disk under data/uploads/<fileId>, metadata lives here.
 */
export const items = pgTable("items", {
  id: text("id").primaryKey(),
  text: text("text"),
  files: jsonb("files").$type<StoredFile[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
