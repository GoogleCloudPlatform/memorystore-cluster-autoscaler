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

output "forwarder_topic" {
  value       = google_pubsub_topic.forwarder_topic.id
  description = "PubSub topic used by the forwarder function"
}

output "forwarder_sa_email" {
  value       = google_service_account.forwarder_sa.email
  description = "Email of the forwarder service account"
}
