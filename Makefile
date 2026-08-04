# Copyright 2026 The Dice Table Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Deploy the Dice Table to Google Cloud Run. Full runbook: docs/DEPLOY.md
#
# Your settings live in deploy/config.mk (gitignored — billing/project ids
# stay local). Don't have it yet? `make init` creates it interactively.
# Lost? `make status` checks real state and prints the exact next command.
#
# The whole flow, in order:
#   gcloud auth login          once, in a browser
#   make init                  answer four questions -> deploy/config.mk
#   make setup                 project + billing + APIs + $5 budget alert
#   make deploy                build from source, deploy, print the URL
#   make cleanup-policy        once, after the first deploy
#   ...buy the domain, set DOMAIN in deploy/config.mk if you skipped it...
#   make verify-domain         prove ownership (TXT record at registrar)
#   make domain                map it; prints the A/AAAA records to add
#   make status                repeat until it says you're live

SHELL := /bin/bash

CONFIG := deploy/config.mk
-include $(CONFIG)

# Fallbacks only — real values belong in $(CONFIG). Command line wins over both.
PROJECT         ?= dice-table-$(USER)
REGION          ?= us-central1
SERVICE         ?= dice
DOMAIN          ?=
BILLING_ACCOUNT ?=

GCLOUD := gcloud --project $(PROJECT)

.PHONY: help init status setup deploy url logs verify-domain domain \
        domain-status cleanup-policy require-config require-domain

help:
	@echo "Dice Table deployment (Google Cloud Run) — runbook in docs/DEPLOY.md"
	@echo ""
	@echo "In order:"
	@echo "  gcloud auth login          once, in a browser"
	@echo "  make init                  create deploy/config.mk (interactive)"
	@echo "  make setup                 one-time: project + billing + APIs + budget alert"
	@echo "  make deploy                build from source and deploy"
	@echo "  make cleanup-policy        once, after first deploy: cap stored image versions"
	@echo "  make verify-domain         once you own the domain: prove ownership"
	@echo "  make domain                map the domain (prints the DNS records to add)"
	@echo ""
	@echo "Any time:"
	@echo "  make status                what is done, what is next — start here when lost"
	@echo "  make url                   print the service URL"
	@echo "  make logs                  read recent server logs"
	@echo "  make domain-status         mapping + TLS certificate detail"
	@echo ""
	@echo "  PROJECT=$(PROJECT)  REGION=$(REGION)  SERVICE=$(SERVICE)  DOMAIN=$(DOMAIN)"

# Interactive one-time bootstrap: writes $(CONFIG) after a few questions.
init:
	@test ! -f $(CONFIG) || { echo "$(CONFIG) already exists — edit it directly (or delete it and re-run make init)."; exit 1; }
	@command -v gcloud >/dev/null 2>&1 || { echo "gcloud CLI not found. Install: https://cloud.google.com/sdk/docs/install"; exit 1; }
	@acct=$$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1); \
	  test -n "$$acct" || { echo "Not logged in yet. Run: gcloud auth login   — then re-run make init"; exit 1; }
	@echo "Your billing accounts:"; echo ""
	@gcloud billing accounts list || { echo ""; echo "No billing account? Create one first: https://console.cloud.google.com/billing"; exit 1; }
	@echo ""; \
	read -r -p "Billing account ID (ACCOUNT_ID column above): " ba; \
	test -n "$$ba" || { echo "A billing account ID is required."; exit 1; }; \
	read -r -p "New GCP project id [dice-table-$$USER]: " proj; proj=$${proj:-dice-table-$$USER}; \
	read -r -p "Region [us-central1]: " region; region=$${region:-us-central1}; \
	read -r -p "Custom domain [thedicetable.com] (type 'none' if you don't own one yet): " dom; dom=$${dom:-thedicetable.com}; \
	test "$$dom" != "none" || dom=""; \
	{ echo "# Local deployment settings — gitignored; created by 'make init'."; \
	  echo "# Safe to edit by hand. Template: deploy/config.example.mk"; \
	  echo "PROJECT         = $$proj"; \
	  echo "REGION          = $$region"; \
	  echo "SERVICE         = dice"; \
	  echo "DOMAIN          = $$dom"; \
	  echo "BILLING_ACCOUNT = $$ba"; } > $(CONFIG); \
	echo ""; echo "Wrote $(CONFIG):"; echo ""; cat $(CONFIG); echo ""; \
	echo "Next: make setup"

# Where am I? Checks real state, top to bottom, and stops at the first gap
# with the exact next command. Run it whenever you're unsure.
# One shell for the whole walk, so the first gap's exit stops everything.
status:
	@if ! command -v gcloud >/dev/null 2>&1; then \
	  echo "  --  gcloud CLI not installed"; echo ""; \
	  echo "NEXT: install it — https://cloud.google.com/sdk/docs/install"; exit 0; fi; \
	echo "  ok  gcloud CLI installed"; \
	acct=$$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1); \
	if [ -z "$$acct" ]; then \
	  echo "  --  not logged in"; echo ""; echo "NEXT: gcloud auth login"; exit 0; fi; \
	echo "  ok  logged in as $$acct"; \
	if [ ! -f $(CONFIG) ]; then \
	  echo "  --  $(CONFIG) missing"; echo ""; echo "NEXT: make init"; exit 0; fi; \
	echo "  ok  $(CONFIG) present"; \
	if ! gcloud projects describe $(PROJECT) >/dev/null 2>&1; then \
	  echo "  --  project $(PROJECT) does not exist"; echo ""; echo "NEXT: make setup"; exit 0; fi; \
	echo "  ok  project $(PROJECT) exists"; \
	if [ "$$(gcloud billing projects describe $(PROJECT) --format='value(billingEnabled)' 2>/dev/null)" != "True" ]; then \
	  echo "  --  billing not linked"; echo ""; echo "NEXT: make setup"; exit 0; fi; \
	echo "  ok  billing linked"; \
	if ! gcloud services list --enabled --project $(PROJECT) --format='value(config.name)' 2>/dev/null | grep -q '^run.googleapis.com$$'; then \
	  echo "  --  APIs not enabled"; echo ""; echo "NEXT: make setup"; exit 0; fi; \
	echo "  ok  APIs enabled"; \
	url=$$(gcloud run services describe $(SERVICE) --project $(PROJECT) --region $(REGION) --format='value(status.url)' 2>/dev/null); \
	if [ -z "$$url" ]; then \
	  echo "  --  service not deployed"; echo ""; echo "NEXT: make deploy"; exit 0; fi; \
	echo "  ok  deployed: $$url"; \
	if [ -z "$$(gcloud artifacts repositories describe cloud-run-source-deploy --project $(PROJECT) --location $(REGION) --format='value(cleanupPolicies)' 2>/dev/null)" ]; then \
	  echo "  --  no image cleanup policy"; echo ""; echo "NEXT: make cleanup-policy"; exit 0; fi; \
	echo "  ok  image cleanup policy set"; \
	if [ -z "$(DOMAIN)" ]; then \
	  echo "  --  no DOMAIN in $(CONFIG)"; echo ""; \
	  echo "NEXT (optional): buy one — recommended thedicetable.com, ~\$$11/yr at porkbun.com —"; \
	  echo "                 then set DOMAIN in $(CONFIG) and run make status again."; \
	  echo "                 (The *.run.app URL above works fine without one.)"; exit 0; fi; \
	if ! gcloud domains list-user-verified 2>/dev/null | grep -q "$(DOMAIN)"; then \
	  echo "  --  $(DOMAIN) not verified with Google"; echo ""; \
	  echo "NEXT: make verify-domain   (adds a TXT record at your registrar)"; exit 0; fi; \
	echo "  ok  $(DOMAIN) ownership verified"; \
	if ! gcloud beta run domain-mappings describe --domain $(DOMAIN) --project $(PROJECT) --region $(REGION) >/dev/null 2>&1; then \
	  echo "  --  no domain mapping"; echo ""; \
	  echo "NEXT: make domain   (then add the printed A/AAAA records at your registrar)"; exit 0; fi; \
	echo "  ok  domain mapping exists"; \
	if curl -fsS -o /dev/null --max-time 10 https://$(DOMAIN)/ 2>/dev/null; then \
	  echo "  ok  https://$(DOMAIN) is live"; echo ""; \
	  echo "All done — share https://$(DOMAIN)/?room=yourparty"; \
	else \
	  echo "  --  https://$(DOMAIN) not serving yet (DNS propagation or cert provisioning, ~15 min)"; echo ""; \
	  echo "NEXT: wait a bit, re-run make status; make domain-status for cert detail;"; \
	  echo "      double-check the A/AAAA records at your registrar (DNS-only, no proxy)."; fi

require-config:
	@test -f $(CONFIG) || { \
	  echo "Missing $(CONFIG) — your local deployment settings."; \
	  echo ""; \
	  echo "Create it either way:"; \
	  echo "  make init                                # interactive (recommended)"; \
	  echo "  cp deploy/config.example.mk $(CONFIG)    # then edit the values"; \
	  echo ""; \
	  echo "It is gitignored: billing account and project ids stay off GitHub."; \
	  exit 1; }

require-domain: require-config
	@test -n "$(DOMAIN)" || { \
	  echo "DOMAIN is empty in $(CONFIG)."; \
	  echo "Buy one first (recommended: thedicetable.com, ~\$$11/yr at porkbun.com),"; \
	  echo "then set DOMAIN in $(CONFIG) and re-run this."; \
	  exit 1; }

# One-time: create the project, link billing, enable APIs, set a $5 budget
# tripwire. Safe to re-run (a duplicate budget alert is the worst outcome).
setup: require-config
	@test -n "$(BILLING_ACCOUNT)" || { echo "BILLING_ACCOUNT is empty in $(CONFIG) — run make init or edit the file."; exit 1; }
	gcloud projects create $(PROJECT) || echo "project $(PROJECT) already exists — continuing"
	gcloud billing projects link $(PROJECT) --billing-account=$(BILLING_ACCOUNT)
	$(GCLOUD) services enable run.googleapis.com cloudbuild.googleapis.com \
	  artifactregistry.googleapis.com billingbudgets.googleapis.com
	gcloud billing budgets create --billing-account=$(BILLING_ACCOUNT) \
	  --display-name="dice-table tripwire" --budget-amount=5USD \
	  --filter-projects=projects/$(PROJECT) \
	  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 \
	  --threshold-rule=percent=1.0,basis=forecasted-spend \
	  || echo "budget alert not created (re-run, or set it in the console) — continuing"
	@echo ""
	@echo "Setup done. Next: make deploy"

# The flag set is deliberate — docs/DEPLOY.md explains each one. The short
# version: exactly 1 instance (all rooms live in one process's memory),
# 1 full vCPU (fractional CPU forces concurrency=1, which cannot hold a
# room's worth of SSE streams), and the 60-minute platform-maximum timeout
# (each SSE stream is cut hourly; the client reconnects silently).
deploy: require-config
	$(GCLOUD) run deploy $(SERVICE) --source . --region $(REGION) \
	  --allow-unauthenticated \
	  --cpu 1 --memory 512Mi --concurrency 80 --timeout 3600 \
	  --min-instances 0 --max-instances 1 --cpu-boost \
	  --quiet
	@echo ""
	@echo "Live at:"
	@$(MAKE) -s url

url: require-config
	@$(GCLOUD) run services describe $(SERVICE) --region $(REGION) \
	  --format='value(status.url)'

logs: require-config
	$(GCLOUD) run services logs read $(SERVICE) --region $(REGION) --limit=100

# Prove you own the domain (one-time per domain). Opens Search Console;
# add the TXT record it shows at your registrar, complete the check there,
# then run make domain.
verify-domain: require-domain
	gcloud domains verify $(DOMAIN)

# Map the domain to the service, then print the DNS records to add at the
# registrar. Leave them DNS-only (no proxying) so Google can issue the cert.
domain: require-domain
	$(GCLOUD) beta run domain-mappings create --service $(SERVICE) \
	  --domain $(DOMAIN) --region $(REGION) \
	  || echo "mapping create failed or already exists — showing records anyway"
	@echo ""
	@echo "Add these records at your DNS provider (DNS-only / grey cloud):"
	@$(GCLOUD) beta run domain-mappings describe --domain $(DOMAIN) \
	  --region $(REGION) --format='yaml(status.resourceRecords)'

domain-status: require-domain
	$(GCLOUD) beta run domain-mappings describe --domain $(DOMAIN) \
	  --region $(REGION) --format='yaml(status.conditions)'

# Once, after the first deploy (the repo is created by that deploy): keep
# only the 2 most recent images so storage stays inside the 0.5 GiB free tier.
cleanup-policy: require-config
	$(GCLOUD) artifacts repositories set-cleanup-policies cloud-run-source-deploy \
	  --location=$(REGION) --policy=deploy/artifact-cleanup.json --no-dry-run
