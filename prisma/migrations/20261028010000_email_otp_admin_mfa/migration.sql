-- Store only HMACed email codes and encrypted administrator TOTP secrets.
CREATE TABLE "EmailLoginChallenge" (
    "email" VARCHAR(320) NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailLoginChallenge_pkey" PRIMARY KEY ("email"),
    CONSTRAINT "EmailLoginChallenge_attempts_nonnegative" CHECK ("attempts" >= 0)
);

CREATE INDEX "EmailLoginChallenge_expiresAt_idx" ON "EmailLoginChallenge"("expiresAt");

CREATE TABLE "AdminTotpFactor" (
    "userId" TEXT NOT NULL,
    "encryptedSecret" VARCHAR(512) NOT NULL,
    "enabledAt" TIMESTAMP(3),
    "enrollmentExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminTotpFactor_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "AdminTotpFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AdminTotpFactor_enabledAt_idx" ON "AdminTotpFactor"("enabledAt");
CREATE INDEX "AdminTotpFactor_enrollmentExpiresAt_idx" ON "AdminTotpFactor"("enrollmentExpiresAt");

CREATE TABLE "AdminRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminRecoveryCode_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AdminRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminTotpFactor"("userId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AdminRecoveryCode_codeHash_key" ON "AdminRecoveryCode"("codeHash");
CREATE INDEX "AdminRecoveryCode_userId_usedAt_idx" ON "AdminRecoveryCode"("userId", "usedAt");
