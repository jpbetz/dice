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

# Template for deploy/config.mk — your LOCAL deployment settings.
#
#   make init                                    # interactive (recommended)
#   cp deploy/config.example.mk deploy/config.mk # or copy this and edit
#
# deploy/config.mk is gitignored on purpose: the values are yours alone
# (billing account, project id) and never belong in the repo.

# Globally-unique GCP project id (6-30 chars: lowercase, digits, hyphens).
PROJECT         = dice-table-CHANGEME

# Cheapest pricing tier AND supports Cloud Run domain mappings. Leave as is.
REGION          = us-central1

# Cloud Run service name. Leave as is.
SERVICE         = dice

# Your custom domain, once you own one; leave empty until then.
# Recommended: thedicetable.com (available 2026-08-04, ~$11/yr at porkbun.com).
DOMAIN          =

# From: gcloud billing accounts list    (format XXXXXX-XXXXXX-XXXXXX)
BILLING_ACCOUNT =
