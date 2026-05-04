-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "BotConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value_json" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_mapping" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "discord_role_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_mapping" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "discord_channel_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "bypass_user_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_run" (
    "id" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "invoker_user_id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "step_count" INTEGER NOT NULL DEFAULT 0,
    "tokens_in" INTEGER NOT NULL DEFAULT 0,
    "tokens_out" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(20,10),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "workflow_run_id" TEXT,
    "last_webhook_at" TIMESTAMP(3),

    CONSTRAINT "agent_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_run_step" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "step_index" INTEGER NOT NULL,
    "tool_calls" JSONB,
    "text" TEXT,
    "usage" JSONB,

    CONSTRAINT "agent_run_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "confirmation" (
    "id" TEXT NOT NULL,
    "workflow_run_id" TEXT,
    "hook_token" TEXT,
    "summary" TEXT NOT NULL,
    "requested_by" TEXT,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "confirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "before_json" TEXT,
    "after_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_doc" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_doc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BotConfig_key_key" ON "BotConfig"("key");

-- CreateIndex
CREATE INDEX "role_mapping_kind_idx" ON "role_mapping"("kind");

-- CreateIndex
CREATE INDEX "channel_mapping_kind_idx" ON "channel_mapping"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_kind_key" ON "rate_limit"("kind");

-- CreateIndex
CREATE INDEX "agent_run_started_at_idx" ON "agent_run"("started_at");

-- CreateIndex
CREATE INDEX "agent_run_status_idx" ON "agent_run"("status");

-- CreateIndex
CREATE INDEX "agent_run_step_run_id_step_index_idx" ON "agent_run_step"("run_id", "step_index");

-- CreateIndex
CREATE UNIQUE INDEX "confirmation_hook_token_key" ON "confirmation"("hook_token");

-- CreateIndex
CREATE INDEX "confirmation_status_idx" ON "confirmation"("status");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_doc_path_key" ON "knowledge_doc"("path");

-- AddForeignKey
ALTER TABLE "agent_run_step" ADD CONSTRAINT "agent_run_step_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
