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

variable "project_id" {
  type        = string
  description = "Project ID where the cluster will run"
}

variable "memorystore_cluster_name" {
  type        = string
  description = "A unique name for the cluster"
}

variable "region" {
  type        = string
  description = "The name of the region to run the cluster"
}

variable "network" {
  type        = string
  description = "The VPC network to host the cluster in"
}

variable "subnetwork" {
  type        = string
  description = "The subnetwork to host the cluster in"
}

variable "memorystore_engine" {
  type        = string
  description = "The underlying engine to use"
  validation {
    condition     = contains(["REDIS", "VALKEY"], var.memorystore_engine)
    error_message = "Valid values for var: memorystore_engine are (REDIS, VALKEY)."
  }
}

variable "valkey_version" {
  type        = string
  description = "The version of the valkey engine to use"
  default     = "VALKEY_7_2"
}

variable "poller_sa_email" {
  type        = string
  description = "The email of the poller service account"
}

variable "scaler_sa_email" {
  type        = string
  description = "The email of the scaler service account"
}

variable "terraform_memorystore_cluster" {
  type        = bool
  description = "If set to true, Terraform will create a test Memorystore cluster"
}

variable "dns_zone" {
  description = "The DNS zone to use"
}

variable "memorystore_shard_count" {
  type = number
}

variable "memorystore_replica_count" {
  type = number
}
