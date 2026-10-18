CREATE SCHEMA "public";
CREATE SCHEMA "neon_auth";
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"notes" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_check" CHECK ((end_at > start_at)),
	CONSTRAINT "appointments_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text])))
);
CREATE TABLE "bank_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"bank_code" text DEFAULT 'MAYBANK' NOT NULL,
	"original_filename" text NOT NULL,
	"storage_url" text NOT NULL,
	"storage_path" text,
	"file_size" bigint,
	"parse_status" text DEFAULT 'pending' NOT NULL,
	"parse_error" text,
	"statement_start_date" date,
	"statement_end_date" date,
	"opening_balance" numeric(18, 2),
	"ending_balance" numeric(18, 2),
	"reconciliation_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"parsed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_statements_parse_status_check" CHECK ((parse_status = ANY (ARRAY['pending'::text, 'processing'::text, 'success'::text, 'failed'::text])))
);
CREATE TABLE "bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"statement_id" uuid NOT NULL,
	"transaction_date" date,
	"ref_no" text,
	"description" text,
	"payee" text,
	"category_match" text,
	"spent" numeric(18, 2),
	"received" numeric(18, 2),
	"balance" numeric(18, 2),
	"memo" text,
	"action" text,
	"reconciliation_status" text DEFAULT 'unreconciled' NOT NULL,
	"reconciliation_note" text,
	"reconciled_by" uuid,
	"reconciled_at" timestamp with time zone,
	"duplicate_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_transactions_reconciliation_status_check" CHECK ((reconciliation_status = ANY (ARRAY['unreconciled'::text, 'reconciled'::text])))
);
CREATE TABLE "consultation_submissions" (
	"id" bigserial PRIMARY KEY,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"business_name" varchar(200),
	"email" varchar(255) NOT NULL,
	"phone" varchar(50) NOT NULL,
	"monthly_revenue" varchar(50) NOT NULL,
	"current_bookkeeping" varchar(50) NOT NULL,
	"bookkeeping_method" varchar(50) NOT NULL,
	"closing_frequency" varchar(50) NOT NULL,
	"contact_reason" varchar(50) NOT NULL,
	"support_timeline" varchar(50) NOT NULL,
	"consent" boolean DEFAULT false NOT NULL,
	"ip_address" inet,
	"user_agent" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(30) DEFAULT 'new' NOT NULL
);
CREATE TABLE "onboarding" (
	"user_id" uuid PRIMARY KEY,
	"current_step" integer DEFAULT 0 NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"new_business" boolean,
	"bank_age" text,
	"payroll" boolean,
	"loans" boolean,
	"sst" boolean,
	"company_name" text,
	"entity_type" text,
	"ssm_number" text,
	"tin" text,
	"registered_address" text,
	"contact_name" text,
	"phone" text,
	"email" text,
	"financial_year_end" text,
	"communication_preference" text,
	"signature_name" text,
	"signed_at" timestamp with time zone,
	"deposit_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "onboarding_items" (
	"user_id" uuid,
	"item_id" text,
	"status" text NOT NULL,
	"note" text,
	"file_url" text,
	"file_name" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_items_pkey" PRIMARY KEY("user_id","item_id")
);
CREATE TABLE "onboarding_owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"ownership_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "neon_auth"."account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" uuid NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
CREATE TABLE "neon_auth"."invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organizationId" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"inviterId" uuid NOT NULL
);
CREATE TABLE "neon_auth"."jwks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"publicKey" text NOT NULL,
	"privateKey" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"expiresAt" timestamp with time zone,
	"alg" text,
	"crv" text
);
CREATE TABLE "neon_auth"."member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organizationId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	"role" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL
);
CREATE TABLE "neon_auth"."organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"slug" text NOT NULL CONSTRAINT "organization_slug_key" UNIQUE,
	"logo" text,
	"createdAt" timestamp with time zone NOT NULL,
	"metadata" text
);
CREATE TABLE "neon_auth"."project_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"endpoint_id" text NOT NULL CONSTRAINT "project_config_endpoint_id_key" UNIQUE,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"trusted_origins" jsonb NOT NULL,
	"social_providers" jsonb NOT NULL,
	"email_provider" jsonb,
	"email_and_password" jsonb,
	"allow_localhost" boolean NOT NULL,
	"plugin_configs" jsonb,
	"webhook_config" jsonb
);
CREATE TABLE "neon_auth"."session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL CONSTRAINT "session_token_key" UNIQUE,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" uuid NOT NULL,
	"impersonatedBy" text,
	"activeOrganizationId" text
);
CREATE TABLE "neon_auth"."user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"email" text NOT NULL CONSTRAINT "user_email_key" UNIQUE,
	"emailVerified" boolean NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"role" text,
	"banned" boolean,
	"banReason" text,
	"banExpires" timestamp with time zone
);
CREATE TABLE "neon_auth"."verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX "appointments_pkey" ON "appointments" ("id");
CREATE INDEX "idx_appointments_start_at" ON "appointments" ("start_at");
CREATE INDEX "idx_appointments_user_id" ON "appointments" ("user_id");
CREATE UNIQUE INDEX "bank_statements_pkey" ON "bank_statements" ("id");
CREATE INDEX "idx_bank_statements_user_id" ON "bank_statements" ("user_id");
CREATE UNIQUE INDEX "bank_transactions_pkey" ON "bank_transactions" ("id");
CREATE INDEX "idx_bank_transactions_statement_id" ON "bank_transactions" ("statement_id");
CREATE UNIQUE INDEX "uq_bank_transactions_duplicate" ON "bank_transactions" ("statement_id","duplicate_key");
CREATE UNIQUE INDEX "consultation_submissions_pkey" ON "consultation_submissions" ("id");
CREATE UNIQUE INDEX "onboarding_pkey" ON "onboarding" ("user_id");
CREATE INDEX "idx_onboarding_items_user" ON "onboarding_items" ("user_id");
CREATE UNIQUE INDEX "onboarding_items_pkey" ON "onboarding_items" ("user_id","item_id");
CREATE INDEX "idx_onboarding_owners_user" ON "onboarding_owners" ("user_id");
CREATE UNIQUE INDEX "onboarding_owners_pkey" ON "onboarding_owners" ("id");
CREATE UNIQUE INDEX "account_pkey" ON "neon_auth"."account" ("id");
CREATE INDEX "account_userId_idx" ON "neon_auth"."account" ("userId");
CREATE INDEX "invitation_email_idx" ON "neon_auth"."invitation" ("email");
CREATE INDEX "invitation_organizationId_idx" ON "neon_auth"."invitation" ("organizationId");
CREATE UNIQUE INDEX "invitation_pkey" ON "neon_auth"."invitation" ("id");
CREATE UNIQUE INDEX "jwks_pkey" ON "neon_auth"."jwks" ("id");
CREATE INDEX "member_organizationId_idx" ON "neon_auth"."member" ("organizationId");
CREATE UNIQUE INDEX "member_pkey" ON "neon_auth"."member" ("id");
CREATE INDEX "member_userId_idx" ON "neon_auth"."member" ("userId");
CREATE UNIQUE INDEX "organization_pkey" ON "neon_auth"."organization" ("id");
CREATE UNIQUE INDEX "organization_slug_key" ON "neon_auth"."organization" ("slug");
CREATE UNIQUE INDEX "organization_slug_uidx" ON "neon_auth"."organization" ("slug");
CREATE UNIQUE INDEX "project_config_endpoint_id_key" ON "neon_auth"."project_config" ("endpoint_id");
CREATE UNIQUE INDEX "project_config_pkey" ON "neon_auth"."project_config" ("id");
CREATE UNIQUE INDEX "session_pkey" ON "neon_auth"."session" ("id");
CREATE UNIQUE INDEX "session_token_key" ON "neon_auth"."session" ("token");
CREATE INDEX "session_userId_idx" ON "neon_auth"."session" ("userId");
CREATE UNIQUE INDEX "user_email_key" ON "neon_auth"."user" ("email");
CREATE UNIQUE INDEX "user_pkey" ON "neon_auth"."user" ("id");
CREATE INDEX "verification_identifier_idx" ON "neon_auth"."verification" ("identifier");
CREATE UNIQUE INDEX "verification_pkey" ON "neon_auth"."verification" ("id");
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "neon_auth"."user"("id");
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE CASCADE;
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "neon_auth"."user"("id");
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE CASCADE;
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_reconciled_by_fkey" FOREIGN KEY ("reconciled_by") REFERENCES "neon_auth"."user"("id");
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "bank_statements"("id") ON DELETE CASCADE;
ALTER TABLE "onboarding" ADD CONSTRAINT "onboarding_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE CASCADE;
ALTER TABLE "onboarding_items" ADD CONSTRAINT "onboarding_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE CASCADE;
ALTER TABLE "onboarding_owners" ADD CONSTRAINT "onboarding_owners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE CASCADE;
ALTER TABLE "neon_auth"."account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "neon_auth"."user"("id") ON DELETE CASCADE;
ALTER TABLE "neon_auth"."invitation" ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "neon_auth"."user"("id") ON DELETE CASCADE;
ALTER TABLE "neon_auth"."invitation" ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "neon_auth"."organization"("id") ON DELETE CASCADE;
ALTER TABLE "neon_auth"."member" ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "neon_auth"."organization"("id") ON DELETE CASCADE;
ALTER TABLE "neon_auth"."member" ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "neon_auth"."user"("id") ON DELETE CASCADE;
ALTER TABLE "neon_auth"."session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "neon_auth"."user"("id") ON DELETE CASCADE;