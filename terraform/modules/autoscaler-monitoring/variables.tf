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
  type = string
}

variable "memorystore_engine" {
  type        = string
  description = "The underlying engine to use"
  validation {
    condition     = contains(["REDIS", "VALKEY"], var.memorystore_engine)
    error_message = "Valid values for var: memorystore_engine are (REDIS, VALKEY)."
  }
}

variable "cpu_average_threshold_out" {
  type    = number
  default = 0.7
}

variable "cpu_max_threshold_out" {
  type    = number
  default = 0.8
}

variable "cpu_average_threshold_in" {
  type    = number
  default = 0.5
}

variable "cpu_max_threshold_in" {
  type    = number
  default = 0.6
}

variable "memory_average_threshold_out" {
  type    = number
  default = 0.7
}

variable "memory_max_threshold_out" {
  type    = number
  default = 0.8
}

variable "memory_average_threshold_in" {
  type    = number
  default = 0.5
}

variable "memory_max_threshold_in" {
  type    = number
  default = 0.6
}
