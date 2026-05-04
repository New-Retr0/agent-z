-- pgvector for Oversight semantic search (column not declared on Prisma model; raw SQL only)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "conversation_turn" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tool_calls" JSONB,
    "model_id" TEXT,
    "agent_run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_turn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profile" (
    "user_id" TEXT NOT NULL,
    "display_name" TEXT,
    "notes_json" JSONB NOT NULL DEFAULT '[]',
    "preferences_json" JSONB NOT NULL DEFAULT '{}',
    "last_seen_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_profile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "scheduled_message" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "guild_id" TEXT,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "components" JSONB,
    "author_user_id" TEXT NOT NULL,
    "target_user_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable (embedding column used via raw SQL in packages/db/src/messages.ts)
CREATE TABLE "message" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "guild_id" TEXT,
    "author_id" TEXT NOT NULL,
    "author_name" TEXT,
    "author_is_bot" BOOLEAN NOT NULL DEFAULT false,
    "content" TEXT NOT NULL DEFAULT '',
    "referenced_message_id" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "mention_user_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "embedding_model" TEXT,
    "embedded_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3) NOT NULL,
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding" vector(1536),

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_grant" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "reaction_message_id" TEXT,
    "reaction_emoji" TEXT,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,

    CONSTRAINT "verification_grant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_turn_channel_id_created_at_idx" ON "conversation_turn"("channel_id", "created_at");

-- CreateIndex
CREATE INDEX "conversation_turn_user_id_created_at_idx" ON "conversation_turn"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "scheduled_message_status_scheduled_for_idx" ON "scheduled_message"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "scheduled_message_channel_id_idx" ON "scheduled_message"("channel_id");

-- CreateIndex
CREATE INDEX "message_channel_id_sent_at_idx" ON "message"("channel_id", "sent_at");

-- CreateIndex
CREATE INDEX "message_guild_id_sent_at_idx" ON "message"("guild_id", "sent_at");

-- CreateIndex
CREATE INDEX "message_author_id_sent_at_idx" ON "message"("author_id", "sent_at");

-- CreateIndex
CREATE INDEX "message_embedded_at_idx" ON "message"("embedded_at");

-- CreateIndex
CREATE UNIQUE INDEX "verification_grant_user_id_guild_id_role_id_key" ON "verification_grant"("user_id", "guild_id", "role_id");

-- CreateIndex
CREATE INDEX "verification_grant_guild_id_idx" ON "verification_grant"("guild_id");
