CREATE TABLE "agentRuns" (
	"id" serial PRIMARY KEY NOT NULL,
	"caseId" integer NOT NULL,
	"agentKey" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"confidence" integer,
	"output" text,
	"startedAt" timestamp,
	"completedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"patientUserId" integer NOT NULL,
	"doctorUserId" integer NOT NULL,
	"clinicOrganizationId" integer,
	"caseId" integer,
	"status" varchar(32) DEFAULT 'requested' NOT NULL,
	"startsAt" timestamp NOT NULL,
	"endsAt" timestamp NOT NULL,
	"reason" varchar(500),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditEvents" (
	"id" serial PRIMARY KEY NOT NULL,
	"caseId" integer,
	"actorId" integer,
	"eventType" varchar(96) NOT NULL,
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "caseShares" (
	"id" serial PRIMARY KEY NOT NULL,
	"caseId" integer NOT NULL,
	"sharedBy" integer NOT NULL,
	"sharedWith" integer NOT NULL,
	"clinicOrganizationId" integer NOT NULL,
	"permission" varchar(32) DEFAULT 'view' NOT NULL,
	"expiresAt" timestamp,
	"revokedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinicalCases" (
	"id" serial PRIMARY KEY NOT NULL,
	"patientRef" varchar(32) NOT NULL,
	"initials" varchar(8) NOT NULL,
	"age" integer NOT NULL,
	"sex" varchar(32) DEFAULT 'unknown' NOT NULL,
	"status" varchar(32) DEFAULT 'new' NOT NULL,
	"acuity" varchar(32) DEFAULT 'medium' NOT NULL,
	"chiefComplaint" varchar(255) NOT NULL,
	"symptoms" text NOT NULL,
	"createdBy" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clinicalCases_patientRef_unique" UNIQUE("patientRef")
);
--> statement-breakpoint
CREATE TABLE "clinicalChatMessages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationId" integer NOT NULL,
	"role" varchar(32) NOT NULL,
	"content" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinicalConversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"caseId" integer NOT NULL,
	"ownerId" integer NOT NULL,
	"title" varchar(180) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinicalRecommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"caseId" integer NOT NULL,
	"recommendationType" varchar(32) NOT NULL,
	"title" varchar(255) NOT NULL,
	"detail" text NOT NULL,
	"priority" varchar(32) DEFAULT 'routine' NOT NULL,
	"requiresReview" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consultations" (
	"id" serial PRIMARY KEY NOT NULL,
	"patientUserId" integer NOT NULL,
	"doctorUserId" integer,
	"clinicOrganizationId" integer,
	"caseId" integer,
	"status" varchar(32) DEFAULT 'requested' NOT NULL,
	"scheduledAt" timestamp,
	"summary" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctorAvailabilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"doctorUserId" integer NOT NULL,
	"clinicOrganizationId" integer,
	"weekday" integer NOT NULL,
	"startMinute" integer NOT NULL,
	"endMinute" integer NOT NULL,
	"slotDuration" integer DEFAULT 30 NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"type" varchar(64) NOT NULL,
	"title" varchar(180) NOT NULL,
	"body" text NOT NULL,
	"caseId" integer,
	"appointmentId" integer,
	"readAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizationMembers" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"userId" integer NOT NULL,
	"membershipRole" varchar(32) DEFAULT 'staff' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(180) NOT NULL,
	"type" varchar(32) DEFAULT 'clinic' NOT NULL,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "userProfiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"phone" varchar(40),
	"specialty" varchar(120),
	"licenseNumber" varchar(120),
	"organizationName" varchar(180),
	"address" text,
	"preferences" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "userProfiles_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"passwordHash" varchar(255),
	"loginMethod" varchar(64),
	"role" varchar(32) DEFAULT 'user' NOT NULL,
	"stripeCustomerId" varchar(255),
	"stripeSubscriptionId" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
