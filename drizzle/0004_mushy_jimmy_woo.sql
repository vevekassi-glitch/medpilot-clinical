CREATE TABLE `consultations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientUserId` int NOT NULL,
	`doctorUserId` int,
	`clinicOrganizationId` int,
	`caseId` int,
	`status` enum('requested','scheduled','completed','cancelled') NOT NULL DEFAULT 'requested',
	`scheduledAt` timestamp,
	`summary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `consultations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `organizationMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`userId` int NOT NULL,
	`membershipRole` enum('owner','doctor','patient','staff') NOT NULL DEFAULT 'staff',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `organizationMembers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`type` enum('clinic','client') NOT NULL DEFAULT 'clinic',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`phone` varchar(40),
	`specialty` varchar(120),
	`licenseNumber` varchar(120),
	`organizationName` varchar(180),
	`address` text,
	`preferences` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `userProfiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','patient','doctor','clinic','client','admin') NOT NULL DEFAULT 'user';