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

variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "memorystore_cluster_name" {
  type    = string
  default = "autoscaler-target-memorystore-cluster"
}

variable "memorystore_shard_count" {
  type    = number
  default = 1
}

variable "memorystore_replica_count" {
  type    = number
  default = 1
}

variable "terraform_memorystore_cluster" {
  description = "If set to true, Terraform will create a test Memorystore cluster."
  type        = bool
  default     = true
}

variable "terraform_spanner_state" {
  description = "If set to true, Terraform will create a Spanner instance for autoscaler state."
  type        = bool
  default     = false
}

variable "spanner_state_name" {
  type    = string
  default = "memorystore-autoscaler-state"
}

variable "spanner_state_database" {
  type    = string
  default = "memorystore-autoscaler-state"
}

variable "firestore_state_database" {
  type    = string
  default = "memorystore-autoscaler-state"
}

variable "terraform_test_vm" {
  description = "If set to true, Terraform will create a test VM with Memorystore utils installed."
  type        = bool
  default     = false
}

variable "terraform_test_vm_name" {
  description = "Name for the optional test VM"
  type        = string
  default     = "terraform-test-vm"
}

variable "terraform_dashboard" {
  description = "If set to true, Terraform will create a Cloud Monitoring dashboard including important Memorystore Cluster metrics."
  type        = bool
  default     = true
}

variable "ip_range" {
  description = "IP range for the network"
  type        = string
  default     = "10.0.0.0/24"
}

variable "memorystore_engine" {
  description = "The underlying engine to use"
  type        = string
  default     = "REDIS"
}
