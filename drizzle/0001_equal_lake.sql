CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `model_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`api_key_encrypted` text NOT NULL,
	`params` text,
	`models_refreshed_at` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `models` (
	`id` text PRIMARY KEY NOT NULL,
	`model_config_id` text NOT NULL,
	`model_id` text NOT NULL,
	`display_name` text,
	`icon` text,
	`context_window` integer,
	`pricing` text,
	`capabilities` text DEFAULT '{"chat":true,"vision":false,"tools":false,"json":false,"reasoning":false}' NOT NULL,
	`params_override` text,
	`pinned` integer DEFAULT false NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`source` text DEFAULT 'fetched' NOT NULL,
	`last_tested_at` integer,
	`last_test_result` text,
	FOREIGN KEY (`model_config_id`) REFERENCES `model_configs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_models_config` ON `models` (`model_config_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `personas` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`avatar` text DEFAULT '🤖' NOT NULL,
	`system_prompt` text NOT NULL,
	`recommended_model` text,
	`params` text,
	`greeting` text,
	`builtin` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `usage_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`model_id` text,
	`provider` text,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`request_type` text DEFAULT 'chat' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_usage_logs_created` ON `usage_logs` (`created_at`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `persona_id` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD `folder_id` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD `pinned` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `archived` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `parent_message_id` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `attachments` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `token_usage` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `model_id` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `latency_ms` integer;--> statement-breakpoint
CREATE INDEX `idx_messages_conversation` ON `messages` (`conversation_id`,`created_at`);