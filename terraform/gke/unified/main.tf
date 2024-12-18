/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "6.12.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "2.33.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_service_account" "autoscaler_sa" {
  account_id   = "scaler-sa"
  display_name = "Memorystore Cluster Autoscaler - Scaler SA"
}

module "autoscaler-base" {
  source = "../../modules/autoscaler-base"

  project_id      = var.project_id
  poller_sa_email = google_service_account.autoscaler_sa.email
  scaler_sa_email = google_service_account.autoscaler_sa.email
}

module "autoscaler-gke" {
  source = "../../modules/autoscaler-gke"

  region            = var.region
  project_id        = var.project_id
  name              = "memorystore-cluster-autoscaler"
  network           = module.autoscaler-network.network_name
  subnetwork        = module.autoscaler-network.subnetwork_name
  ip_range_master   = "10.1.0.0/28"
  ip_range_pods     = ""
  ip_range_services = ""
  poller_sa_email   = google_service_account.autoscaler_sa.email
  scaler_sa_email   = google_service_account.autoscaler_sa.email
}

module "autoscaler-firestore" {
  count  = !var.terraform_spanner_state ? 1 : 0
  source = "../../modules/autoscaler-firestore"

  project_id               = var.project_id
  region                   = var.region
  firestore_state_database = var.firestore_state_database

  poller_sa_email = google_service_account.autoscaler_sa.email
  scaler_sa_email = google_service_account.autoscaler_sa.email
}

module "autoscaler-spanner" {
  source = "../../modules/autoscaler-spanner"

  region                  = var.region
  project_id              = var.project_id
  terraform_spanner_state = var.terraform_spanner_state
  spanner_state_name      = var.spanner_state_name
  spanner_state_database  = var.spanner_state_database

  poller_sa_email = google_service_account.autoscaler_sa.email
  scaler_sa_email = google_service_account.autoscaler_sa.email
}

module "autoscaler-network" {
  source = "../../modules/autoscaler-network"

  region     = var.region
  project_id = var.project_id
  ip_range   = var.ip_range
}

module "autoscaler-memorystore-cluster" {
  source = "../../modules/autoscaler-memorystore-cluster"

  region                   = var.region
  project_id               = var.project_id
  memorystore_cluster_name = var.memorystore_cluster_name

  network    = module.autoscaler-network.network
  subnetwork = module.autoscaler-network.subnetwork
  dns_zone   = module.autoscaler-network.dns_zone

  terraform_memorystore_cluster = var.terraform_memorystore_cluster

  poller_sa_email = google_service_account.autoscaler_sa.email
  scaler_sa_email = google_service_account.autoscaler_sa.email

  memorystore_shard_count   = var.memorystore_shard_count
  memorystore_replica_count = var.memorystore_replica_count

  depends_on = [module.autoscaler-network]
}

module "autoscaler-test-vm" {
  count  = var.terraform_test_vm && var.terraform_memorystore_cluster ? 1 : 0
  source = "../../modules/autoscaler-test-vm"

  region     = var.region
  project_id = var.project_id
  name       = var.terraform_test_vm_name
  network    = module.autoscaler-network.network
  subnetwork = module.autoscaler-network.subnetwork
}

module "autoscaler-monitoring" {
  count  = var.terraform_dashboard ? 1 : 0
  source = "../../modules/autoscaler-monitoring"

  region                   = var.region
  project_id               = var.project_id
  memorystore_cluster_name = var.memorystore_cluster_name
}
