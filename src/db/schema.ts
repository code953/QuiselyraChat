import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("新对话"),
  personaId: text("persona_id"),
  folderId: text("folder_id"),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  parentMessageId: text("parent_message_id"),
  role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
  content: text("content").notNull(),
  attachments: text("attachments", { mode: "json" }).$type<Array<{ type: string; url: string; name: string; size: number }>>(),
  tokenUsage: text("token_usage", { mode: "json" }).$type<{ prompt: number; completion: number; total: number; cost?: number }>(),
  modelId: text("model_id"),
  latencyMs: integer("latency_ms"),
  status: text("status", { enum: ["success", "error", "cancelled", "streaming"] }).notNull().default("success"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("idx_messages_conversation").on(table.conversationId, table.createdAt),
]);

export const personas = sqliteTable("personas", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  avatar: text("avatar").notNull().default("🤖"),
  systemPrompt: text("system_prompt").notNull(),
  recommendedModel: text("recommended_model"),
  params: text("params", { mode: "json" }).$type<Record<string, unknown>>(),
  greeting: text("greeting"),
  builtin: integer("builtin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const modelConfigs = sqliteTable("model_configs", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  params: text("params", { mode: "json" }).$type<Record<string, unknown>>(),
  modelsRefreshedAt: integer("models_refreshed_at", { mode: "timestamp" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const models = sqliteTable("models", {
  id: text("id").primaryKey(),
  modelConfigId: text("model_config_id").notNull().references(() => modelConfigs.id, { onDelete: "cascade" }),
  modelId: text("model_id").notNull(),
  displayName: text("display_name"),
  icon: text("icon"),
  contextWindow: integer("context_window"),
  pricing: text("pricing", { mode: "json" }).$type<{ inputPer1k?: number; outputPer1k?: number }>(),
  capabilities: text("capabilities", { mode: "json" }).$type<{ chat: boolean; vision: boolean; tools: boolean; json: boolean; reasoning: boolean }>().notNull().default({ chat: true, vision: false, tools: false, json: false, reasoning: false }),
  paramsOverride: text("params_override", { mode: "json" }).$type<Record<string, unknown>>(),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  order: integer("order").notNull().default(0),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  source: text("source", { enum: ["fetched", "manual"] }).notNull().default("fetched"),
  lastTestedAt: integer("last_tested_at", { mode: "timestamp" }),
  lastTestResult: text("last_test_result", { mode: "json" }).$type<Record<string, unknown>>(),
}, (table) => [
  index("idx_models_config").on(table.modelConfigId, table.enabled),
]);

export const folders = sqliteTable("folders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  order: integer("order").notNull().default(0),
});

export const usageLogs = sqliteTable("usage_logs", {
  id: text("id").primaryKey(),
  modelId: text("model_id"),
  provider: text("provider"),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  cost: real("cost").notNull().default(0),
  requestType: text("request_type", { enum: ["chat", "image", "search", "test"] }).notNull().default("chat"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("idx_usage_logs_created").on(table.createdAt),
]);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
});

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Persona = typeof personas.$inferSelect;
export type NewPersona = typeof personas.$inferInsert;
export type ModelConfig = typeof modelConfigs.$inferSelect;
export type NewModelConfig = typeof modelConfigs.$inferInsert;
export type Model = typeof models.$inferSelect;
export type NewModel = typeof models.$inferInsert;
export type Folder = typeof folders.$inferSelect;
export type UsageLog = typeof usageLogs.$inferSelect;
