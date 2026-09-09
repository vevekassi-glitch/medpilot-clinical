CREATE TABLE `appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientUserId` int NOT NULL,
	`doctorUserId` int NOT NULL,
	`clinicOrganizationId` int,
	`caseId` int,
	`status` enum('requested','confirmed','cancelled','completed') NOT NULL DEFAULT 'requested',
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`reason` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `caseShares` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` int NOT NULL,
	`sharedBy` int NOT NULL,
	`sharedWith` int NOT NULL,
	`clinicOrganizationId` int NOT NULL,
	`permission` enum('view','comment') NOT NULL DEFAULT 'view',
	`expiresAt` timestamp,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `caseShares_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `doctorAvailabilities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`doctorUserId` int NOT NULL,
	`clinicOrganizationId` int,
	`weekday` int NOT NULL,
	`startMinute` int NOT NULL,
	`endMinute` int NOT NULL,
	`slotDuration` int NOT NULL DEFAULT 30,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `doctorAvailabilities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` varchar(64) NOT NULL,
	`title` varchar(180) NOT NULL,
	`body` text NOT NULL,
	`caseId` int,
	`appointmentId` int,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
