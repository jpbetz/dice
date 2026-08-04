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
# One-time:  gcloud auth login
#            make setup BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX
# Deploy:    make deploy          (build from source, ~2-4 min)
# Domain:    make domain DOMAIN=thedicetable.com   (after buying it)
#
# Every value below can be overridden on the command line, e.g.
#   make deploy PROJECT=my-other-project

PROJECT         ?= dice-table-jpbetz
REGION          ?= us-central1
SERVICE         ?= dice
DOMAIN          ?= thedicetable.com
BILLING_ACCOUNT ?=

GCLOUD := gcloud --project $(PROJECT)

.PHONY: help setup deploy url logs domain domain-status cleanup-policy

help:
	@echo "Dice Table deployment (Google Cloud Run) — runbook in docs/DEPLOY.md"
	@echo ""
	@echo "  make setup BILLING_ACCOUNT=XXXXXX-...    one-time: project + billing + APIs + budget alert"
	@echo "  make deploy                              build from source and deploy"
	@echo "  make cleanup-policy                      once, after first deploy: cap stored image versions"
	@echo "  make url                                 print the service URL"
	@echo "  make logs                                read recent server logs"
	@echo "  make domain DOMAIN=example.com           map a custom domain (prints the DNS records to add)"
	@echo "  make domain-status DOMAIN=example.com    mapping + TLS certificate status"
	@echo ""
	@echo "  PROJECT=$(PROJECT)  REGION=$(REGION)  SERVICE=$(SERVICE)"

# One-time: create the project, link billing, enable APIs, set a $5 budget
# tripwire. Safe to re-run (a duplicate budget alert is the worst outcome).
setup:
	@test -n "$(BILLING_ACCOUNT)" || { \
	  echo "BILLING_ACCOUNT is required. Your accounts:"; echo ""; \
	  gcloud billing accounts list; echo ""; \
	  echo "Then: make setup BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX"; exit 1; }
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
deploy:
	$(GCLOUD) run deploy $(SERVICE) --source . --region $(REGION) \
	  --allow-unauthenticated \
	  --cpu 1 --memory 512Mi --concurrency 80 --timeout 3600 \
	  --min-instances 0 --max-instances 1 --cpu-boost \
	  --quiet
	@echo ""
	@echo "Live at:"
	@$(MAKE) -s url

url:
	@$(GCLOUD) run services describe $(SERVICE) --region $(REGION) \
	  --format='value(status.url)'

logs:
	$(GCLOUD) run services logs read $(SERVICE) --region $(REGION) --limit=100

# Map a custom domain. One-time per domain: prove ownership first
# (gcloud domains verify $(DOMAIN) — opens Search Console, add the TXT
# record it shows at your registrar), then this prints the A/AAAA records
# to add. Leave them DNS-only (no proxying) so Google can issue the cert.
domain:
	$(GCLOUD) beta run domain-mappings create --service $(SERVICE) \
	  --domain $(DOMAIN) --region $(REGION) \
	  || echo "mapping create failed or already exists — showing records anyway"
	@echo ""
	@echo "Add these records at your DNS provider (DNS-only / grey cloud):"
	@$(GCLOUD) beta run domain-mappings describe --domain $(DOMAIN) \
	  --region $(REGION) --format='yaml(status.resourceRecords)'

domain-status:
	$(GCLOUD) beta run domain-mappings describe --domain $(DOMAIN) \
	  --region $(REGION) --format='yaml(status.conditions)'

# Once, after the first deploy (the repo is created by that deploy): keep
# only the 2 most recent images so storage stays inside the 0.5 GiB free tier.
cleanup-policy:
	$(GCLOUD) artifacts repositories set-cleanup-policies cloud-run-source-deploy \
	  --location=$(REGION) --policy=deploy/artifact-cleanup.json --no-dry-run
