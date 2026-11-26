CREATE TABLE "AccountRateLimit" (
    "scope" VARCHAR(50) NOT NULL,
    "subjectId" VARCHAR(100) NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AccountRateLimit_pkey" PRIMARY KEY ("scope", "subjectId"),
    CONSTRAINT "AccountRateLimit_requestCount_check" CHECK ("requestCount" >= 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "AccountRateLimit" TO janan_app;
