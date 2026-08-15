CREATE TABLE `uploads` (
	`key` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`previewable` integer DEFAULT false NOT NULL,
	`data` blob NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_uploads_created_at` ON `uploads` (`created_at`);