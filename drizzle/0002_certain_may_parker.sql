CREATE TABLE `images` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt` text NOT NULL,
	`model_id` text,
	`provider` text,
	`size` text,
	`file_path` text NOT NULL,
	`status` text DEFAULT 'success' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_images_created` ON `images` (`created_at`);--> statement-breakpoint
CREATE TABLE `search_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`base_url` text,
	`api_key_encrypted` text,
	`kind` text DEFAULT 'function' NOT NULL,
	`params` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `share_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`conversation_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`expires_at` integer,
	`view_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_tokens_token_unique` ON `share_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_share_token` ON `share_tokens` (`token`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `search_mode` text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `search_results` text;