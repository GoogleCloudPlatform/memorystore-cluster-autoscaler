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
    module_name = "cloud-solutions/memorystore-cluster-autoscaler-deploy-cluster-v1.0"
  }
}

locals {
  is_redis = var.memorystore_engine == "REDIS"
}

resource "google_redis_cluster" "memorystore_cluster" {
  count       = var.terraform_memorystore_cluster && local.is_redis ? 1 : 0
  name        = var.memorystore_cluster_name
  shard_count = var.memorystore_shard_count

  region                  = var.region
  replica_count           = var.memorystore_replica_count
  transit_encryption_mode = "TRANSIT_ENCRYPTION_MODE_DISABLED"
  authorization_mode      = "AUTH_MODE_DISABLED"

  psc_configs {
    network = var.network
  }

  zone_distribution_config {
    mode = "MULTI_ZONE"
  }

  deletion_protection_enabled = false

  lifecycle {
    ignore_changes = [shard_count, replica_count]
  }
}

resource "google_memorystore_instance" "memorystore_cluster" {
  count       = var.terraform_memorystore_cluster && local.is_redis ? 0 : 1
  instance_id = var.memorystore_cluster_name
  shard_count = var.memorystore_shard_count

  location                = var.region
  replica_count           = var.memorystore_replica_count
  transit_encryption_mode = "TRANSIT_ENCRYPTION_DISABLED"
  authorization_mode      = "AUTH_DISABLED"

  engine_version = var.valkey_version

  desired_psc_auto_connections {
    network    = var.network
    project_id = var.project_id
  }

  zone_distribution_config {
    mode = "MULTI_ZONE"
  }

  deletion_protection_enabled = false

  lifecycle {
    ignore_changes = [shard_count, replica_count]
  }
}

resource "google_dns_record_set" "memorystore_cluster" {
  count = var.terraform_memorystore_cluster ? 1 : 0
  name  = "cluster.${var.dns_zone.dns_name}"
  type  = "A"
  ttl   = 300

  managed_zone = var.dns_zone.name

  rrdatas = local.is_redis ? [one(google_redis_cluster.memorystore_cluster).discovery_endpoints[0].address] : [one(google_memorystore_instance.memorystore_cluster).discovery_endpoints[0].address]
}
