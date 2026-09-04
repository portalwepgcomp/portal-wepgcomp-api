.PHONY: setup dev infra infra-down migrate seed build test

setup: infra
	npm install
	npm run prisma:migrate

infra:
	docker compose up -d

infra-down:
	docker compose down

migrate:
	npm run prisma:migrate

seed:
	npm run seed

dev:
	npm run start:dev

build:
	npm run build

test:
	npm test
