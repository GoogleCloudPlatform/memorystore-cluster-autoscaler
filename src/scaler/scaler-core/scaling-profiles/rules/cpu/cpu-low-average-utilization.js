/* Copyright 2024 Google LLC
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
 * limitations under the License
 */
const {basename} = require('path');

/**
 * @fileoverview Rule which triggers when the average CPU utilization low
 * based on < 50% average CPU with no evicted keys.
 *
 * @type {import('json-rules-engine').RuleProperties}
 */
module.exports = {
  name: basename(__filename, '.js'),
  conditions: {
    all: [
      {
        fact: 'cpu_average_utilization',
        operator: 'lessThan',
        value: 50,
      },
      {
        fact: 'maximum_evicted_keys',
        operator: 'equal',
        value: 0,
      },
      {
        fact: 'average_evicted_keys',
        operator: 'equal',
        value: 0,
      },
    ],
  },
  event: {
    type: 'IN',
    params: {
      message: 'low average CPU utilization',
      scalingMetrics: ['cpu_average_utilization'],
    },
  },
};
