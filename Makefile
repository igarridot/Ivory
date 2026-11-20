SHELL := /bin/sh
.DEFAULT_GOAL := help
DOCKER ?= docker
COMPOSE := $(DOCKER) compose
COMPOSE_HTTPS := $(COMPOSE) -f compose.yaml -f compose.https.yaml
export IVORY_UID ?= $(shell id -u)
export IVORY_GID ?= $(shell id -g)

.PHONY: help test up down build logs https-up https-down https-ca
help:
	@echo "make test       Ejecuta las pruebas y comprueba la sintaxis"
	@echo "make build      Construye la imagen de la aplicación"
	@echo "make up         Inicia Ivory en http://127.0.0.1:5173"
	@echo "make down       Detiene los contenedores; conserva los archivos"
	@echo "make logs       Muestra los logs"
	@echo "make https-up   Inicia Ivory con HTTPS en https://apollo.moderdonia:8445 (Caddy)"
	@echo "make https-down Detiene Ivory y Caddy; conserva la CA y los archivos"
	@echo "make https-ca   Exporta el certificado raíz a .certs/ivory-root-ca.crt para el iPad"

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

https-up:
	mkdir -p data/uploads
	$(COMPOSE_HTTPS) up -d --build

https-down:
	$(COMPOSE_HTTPS) down

https-ca:
	mkdir -p .certs
	$(COMPOSE_HTTPS) cp proxy:/data/caddy/pki/authorities/local/root.crt .certs/ivory-root-ca.crt
	@openssl x509 -in .certs/ivory-root-ca.crt -noout -subject -enddate -fingerprint -sha256
