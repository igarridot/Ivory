SHELL := /bin/sh
.DEFAULT_GOAL := help
DOCKER ?= docker
COMPOSE := $(DOCKER) compose
export IVORY_UID ?= $(shell id -u)
export IVORY_GID ?= $(shell id -g)

.PHONY: help test up down build logs
help:
	@echo "make test   Ejecuta las pruebas y comprueba la sintaxis"
	@echo "make build  Construye la imagen de la aplicación"
	@echo "make up     Inicia Ivory en http://127.0.0.1:5173"
	@echo "make down   Detiene los contenedores; conserva los archivos"
	@echo "make logs   Muestra los logs"

test:
	npm run check
	npm test

build:
	$(COMPOSE) build

up:
	mkdir -p data/uploads
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f
