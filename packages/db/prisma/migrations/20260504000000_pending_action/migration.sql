-- CreateTable
CREATE TABLE "pending_action" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "invoker_user_id" TEXT NOT NULL,
    "guild_id" TEXT,
    "channel_id" TEXT,
    "capability" TEXT NOT NULL,
    "input_json" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "interaction_token" TEXT,
    "interaction_application_id" TEXT,

    CONSTRAINT "pending_action_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_action_token_key" ON "pending_action"("token");

-- CreateIndex
CREATE INDEX "pending_action_status_expires_at_idx" ON "pending_action"("status", "expires_at");

-- CreateIndex
CREATE INDEX "pending_action_invoker_user_id_idx" ON "pending_action"("invoker_user_id");
