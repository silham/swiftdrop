# SwiftDrop developer commands. Everything runs inside Docker — you only need Docker + make.
# Owner: M10. `make help` lists targets.
SHELL := /bin/bash
COMPOSE := docker compose
EXEC := $(COMPOSE) exec -T
RUN := $(COMPOSE) run --rm --no-deps
s ?= api

.DEFAULT_GOAL := help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ── lifecycle ────────────────────────────────────────────────────────────────
setup: ## First run: create .env from .env.example and build images
	@test -f .env || cp .env.example .env
	$(COMPOSE) build

up: setup ## Start the whole stack (http://localhost:8080)
	$(COMPOSE) up -d
	@echo "→ App http://localhost:8080 · API docs http://localhost:8080/api/docs · RabbitMQ http://localhost:15672 · Mail http://localhost:8025 · MinIO http://localhost:9001"

down: ## Stop the stack (keeps data)
	$(COMPOSE) down

restart: ## Restart one service: make restart s=api
	$(COMPOSE) restart $(s)

ps: ## Service status
	$(COMPOSE) ps

logs: ## Follow logs: make logs s=api
	$(COMPOSE) logs -f $(s)

sh: ## Shell into a service: make sh s=api
	$(COMPOSE) exec $(s) bash

install: ## Re-install deps + rebuild shared packages (after pulling lockfile/schema/contracts changes)
	$(COMPOSE) run --rm deps
	$(COMPOSE) restart api worker web

nuke: ## DANGER: stop and delete ALL volumes (database, node_modules). Asks first.
	@read -p "Delete all SwiftDrop volumes incl. the database? [y/N] " a && [ "$$a" = y ]
	$(COMPOSE) --profile e2e down -v

# ── database ────────────────────────────────────────────────────────────────
migrate: ## Create + apply a migration after editing prisma/schema: make migrate name=add_xyz
	@test -n "$(name)" || (echo "usage: make migrate name=short_snake_name" && exit 1)
	$(EXEC) api pnpm --filter @swiftdrop/db exec prisma migrate dev --name $(name)
	$(EXEC) api pnpm --filter @swiftdrop/db build
	$(COMPOSE) restart api worker

migrate-deploy: ## Apply pending migrations (after pulling)
	$(EXEC) api pnpm --filter @swiftdrop/db migrate:deploy
	$(EXEC) api pnpm --filter @swiftdrop/db build

db-check: ## Drift check: schema files == migrations
	$(EXEC) api pnpm --filter @swiftdrop/db migrate:diff

seed: ## Re-run idempotent seeds
	$(EXEC) api pnpm --filter @swiftdrop/db seed

db-reset: ## DANGER: wipe the DEV database, re-migrate and seed. Asks first.
	@read -p "Wipe the dev database? [y/N] " a && [ "$$a" = y ]
	$(EXEC) api pnpm --filter @swiftdrop/db exec prisma migrate reset --force
	$(EXEC) api pnpm --filter @swiftdrop/db seed

studio: ## Prisma Studio on http://localhost:5555
	$(COMPOSE) exec api sh -c "cd packages/db && pnpm exec prisma studio --port 5555 --browser none"

psql: ## psql shell on the dev database
	$(COMPOSE) exec postgres psql -U swiftdrop swiftdrop

# ── quality ─────────────────────────────────────────────────────────────────
gen: ## Regenerate OpenAPI spec + web API types
	$(EXEC) api pnpm gen:api

lint: ## ESLint the whole repo
	$(EXEC) api pnpm lint

format: ## Prettier --write the whole repo
	$(EXEC) api pnpm format

typecheck: ## tsc --noEmit everywhere
	$(EXEC) api pnpm typecheck

test: ## Unit tests (all packages)
	$(EXEC) api pnpm test

test-int: ## API integration tests against swiftdrop_test
	$(EXEC) -e TEST_DATABASE_URL=postgresql://swiftdrop:swiftdrop@postgres:5432/swiftdrop_test api pnpm --filter @swiftdrop/api test:int

coverage: ## Merged unit + integration coverage with a minimum threshold (apps/api/coverage/merged)
	$(EXEC) -e TEST_DATABASE_URL=postgresql://swiftdrop:swiftdrop@postgres:5432/swiftdrop_test api pnpm --filter @swiftdrop/api test:cov:all

e2e: ## Playwright journeys against the running stack (report: apps/e2e/playwright-report)
	$(COMPOSE) --profile e2e run --rm e2e

check: lint typecheck test test-int db-check ## Everything CI runs (run before opening a PR)

# ── production-like ─────────────────────────────────────────────────────────
prod-up: ## Build + run production images (compose.prod.yaml)
	$(COMPOSE) -f compose.prod.yaml up -d --build

prod-down:
	$(COMPOSE) -f compose.prod.yaml down

.PHONY: help setup up down restart ps logs sh install nuke migrate migrate-deploy db-check seed db-reset studio psql gen lint format typecheck test test-int coverage e2e check prod-up prod-down
