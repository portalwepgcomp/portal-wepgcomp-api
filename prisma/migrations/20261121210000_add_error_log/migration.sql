/*
  Registro persistente de falhas (exceptions HTTP, logger.error, crons e erros
  de processo). Sem FK para user_account: o log precisa sobreviver à exclusão do
  usuário. Os campos usados como filtro são colunas escalares; o restante do
  contexto fica no JSONB.
*/

-- CreateTable
CREATE TABLE "error_log" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(20) NOT NULL,
    "level" VARCHAR(10) NOT NULL,
    "request_id" VARCHAR(64),
    "status_code" INTEGER,
    "method" VARCHAR(10),
    "path" TEXT,
    "route" TEXT,
    "is_authenticated" BOOLEAN NOT NULL DEFAULT false,
    "user_id" VARCHAR(64),
    "user_name" VARCHAR(255),
    "user_email" VARCHAR(255),
    "user_level" VARCHAR(30),
    "user_profile" VARCHAR(30),
    "exception_name" VARCHAR(255),
    "message" TEXT NOT NULL,
    "logger_context" VARCHAR(255),
    "prisma_code" VARCHAR(20),
    "file" TEXT,
    "line" INTEGER,
    "column" INTEGER,
    "function_name" VARCHAR(255),
    "context" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "error_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "error_log_created_at_idx" ON "error_log"("created_at");

-- CreateIndex
CREATE INDEX "error_log_status_code_created_at_idx" ON "error_log"("status_code", "created_at");

-- CreateIndex
CREATE INDEX "error_log_user_email_created_at_idx" ON "error_log"("user_email", "created_at");

-- CreateIndex
CREATE INDEX "error_log_user_id_idx" ON "error_log"("user_id");

-- CreateIndex
CREATE INDEX "error_log_request_id_idx" ON "error_log"("request_id");

-- CreateIndex
CREATE INDEX "error_log_source_created_at_idx" ON "error_log"("source", "created_at");

-- CreateIndex
CREATE INDEX "error_log_exception_name_idx" ON "error_log"("exception_name");

-- CreateIndex
CREATE INDEX "error_log_prisma_code_idx" ON "error_log"("prisma_code");
