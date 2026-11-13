-- CreateTable
CREATE TABLE "mcp_clients" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "tokenEndpointAuthMethod" TEXT NOT NULL DEFAULT 'none',
    "secretHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_authorization_codes" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_authorization_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_grants" (
    "id" TEXT NOT NULL,
    "accessHash" TEXT NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_clients_clientId_key" ON "mcp_clients"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_authorization_codes_codeHash_key" ON "mcp_authorization_codes"("codeHash");

-- CreateIndex
CREATE INDEX "mcp_authorization_codes_userId_idx" ON "mcp_authorization_codes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_grants_accessHash_key" ON "mcp_grants"("accessHash");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_grants_refreshHash_key" ON "mcp_grants"("refreshHash");

-- CreateIndex
CREATE INDEX "mcp_grants_userId_idx" ON "mcp_grants"("userId");

-- AddForeignKey
ALTER TABLE "mcp_authorization_codes" ADD CONSTRAINT "mcp_authorization_codes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "mcp_clients"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_authorization_codes" ADD CONSTRAINT "mcp_authorization_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_grants" ADD CONSTRAINT "mcp_grants_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "mcp_clients"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_grants" ADD CONSTRAINT "mcp_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
