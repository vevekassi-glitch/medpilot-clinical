CREATE TABLE `agentRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` int NOT NULL,
	`agentKey` varchar(64) NOT NULL,
	`status` enum('queued','running','completed','blocked','failed') NOT NULL DEFAULT 'queued',
	`confidence` int,
	`output` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	CONSTRAINT `agentRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` int,
	`actorId` int,
	`eventType` varchar(96) NOT NULL,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clinicalCases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientRef` varchar(32) NOT NULL,
	`initials` varchar(8) NOT NULL,
	`age` int NOT NULL,
	`sex` enum('female','male','other','unknown') NOT NULL DEFAULT 'unknown',
	`status` enum('new','in_review','needs_review','closed') NOT NULL DEFAULT 'new',
	`acuity` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`chiefComplaint` varchar(255) NOT NULL,
	`symptoms` text NOT NULL,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clinicalCases_id` PRIMARY KEY(`id`),
	CONSTRAINT `clinicalCases_patientRef_unique` UNIQUE(`patientRef`)
);
--> statement-breakpoint
CREATE TABLE `clinicalRecommendations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` int NOT NULL,
	`recommendationType` enum('triage','exam','medication_safety','follow_up') NOT NULL,
	`title` varchar(255) NOT NULL,
	`detail` text NOT NULL,
	`priority` enum('routine','soon','urgent') NOT NULL DEFAULT 'routine',
	`requiresReview` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `clinicalRecommendations_id` PRIMARY KEY(`id`)
);
