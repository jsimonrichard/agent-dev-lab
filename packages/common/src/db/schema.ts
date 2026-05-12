import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Placeholder table only — final run / conversation schema is deferred.
 * Exists so Drizzle + migrations have a concrete anchor during setup.
 */
export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  createdAt: text('created_at').notNull(),
});

export type RunRow = typeof runs.$inferSelect;
