/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

terraform {
  provider_meta "google" {
    module_name = "cloud-solutions/memorystore-cluster-autoscaler-deploy-network-v1.0"
  }
}

locals {
  psc_service_class = var.memorystore_engine == "REDIS" ? "gcp-memorystore-redis" : "gcp-memorystore"
}

resource "google_compute_network" "autoscaler_network" {
  name                    = "memorystore-cluster-autoscaler-network"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "autoscaler_subnetwork" {
  name                     = "memorystore-cluster-autoscaler-subnetwork"
  network                  = google_compute_network.autoscaler_network.id
  ip_cidr_range            = var.ip_range
  private_ip_google_access = true
}

resource "google_compute_router" "router" {
  name    = "app-router"
  region  = var.region
  network = google_compute_network.autoscaler_network.id
}

resource "google_compute_router_nat" "nat" {
  name                               = "memorystore-cluster-autoscaler-nat"
  router                             = google_compute_router.router.name
  region                             = google_compute_router.router.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

resource "google_network_connectivity_service_connection_policy" "policy" {
  name          = "memorystore-cluster-autoscaler-policy"
  location      = var.region
  service_class = local.psc_service_class
  description   = "Basic service connection policy"
  network       = google_compute_network.autoscaler_network.id
  project       = var.project_id

  psc_config {
    subnetworks = [google_compute_subnetwork.autoscaler_subnetwork.id]
  }
}

resource "google_dns_managed_zone" "private_zone" {
  name        = "memorystore-cluster-autoscaler-private-zone"
  dns_name    = "memorystore.private."
  description = "Private DNS zone for Memorystore Cluster Autoscaler"

  visibility = "private"
  labels = {
    "managed-by" = "terraform"
  }

  private_visibility_config {
    networks {
      network_url = google_compute_network.autoscaler_network.self_link
    }
  }
}
