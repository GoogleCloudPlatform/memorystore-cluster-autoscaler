// Copyright 2024 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Common types for the autoscaler.
 *
 * Any changes to the AutoscalerMemorystoreCluster types also need to be
 * reflected in autoscaler-config.schema.json, and in
 * autoscaler-common/types.js.
 */

/**
 * @enum {string}
 */
const AutoscalerUnits = {
  SHARDS: 'SHARDS',
};

/**
 * @enum {string}
 */
const AutoscalerDirection = {
  IN: 'IN',
  OUT: 'OUT',
  NONE: 'NONE',
};

/**
 * @enum {string}
 */
const AutoscalerEngine = {
  REDIS: 'REDIS',
  VALKEY: 'VALKEY',
};

/**
 * @typedef {{
 *    currentSize: number,
 *  }} MemorystoreClusterMetadata
 */

/**
 * @typedef {{
 *   name: string,
 *   filter: string,
 *   reducer: string,
 *   aligner: string,
 *   period: number,
 * }} MemorystoreClusterMetric
 */

/**
 * @typedef {{
 *    name: string,
 *    value: number,
 *    threshold?: number,
 * }} MemorystoreClusterMetricValue
 */

/**
 * @typedef {{
 *      name: string,
 *      instanceId?: string,
 *      databaseId?: string
 * }} StateDatabaseConfig
 */

/**
 * @typedef {import('json-rules-engine').RuleProperties} Rule
 */

/**
 * @typedef {{
 *    projectId: string,
 *    regionId: string,
 *    clusterId: string,
 *    engine: AutoscalerEngine,
 *    units: AutoscalerUnits,
 *    minSize: number,
 *    maxSize: number,
 *    scalingProfile: string,
 *    scalingMethod: string,
 *    stepSize: number,
 *    scaleInLimit?: number,
 *    scaleOutLimit?: number,
 *    minFreeMemoryPercent: number,
 *    scaleOutCoolingMinutes: number,
 *    scaleInCoolingMinutes: number,
 *    stateProjectId?: string,
 *    stateDatabase?: StateDatabaseConfig,
 *    scalerPubSubTopic?: string,
 *    downstreamPubSubTopic?: string,
 *    metrics: (MemorystoreClusterMetric | MemorystoreClusterMetricValue)[],
 *    scalingRules?: Rule[]
 * }} MemorystoreClusterConfig;
 */

/**
 * @typedef {MemorystoreClusterConfig & MemorystoreClusterMetadata
 * } AutoscalerMemorystoreCluster;
 */

/**
 * @typedef {MemorystoreClusterMetricValue[]} ScalingMetricList
 */

/**
 * @typedef {{[x:string]: import('json-rules-engine').RuleProperties}} RuleSet
 */

/**
 * @typedef {import('json-rules-engine').ConditionProperties}
 *   ConditionProperties
 */

/**
 * Extends ConditionProperty with the facts and fact results.
 * Workaround because json-rules-engine typing does not match the actual
 * signature nor exports the Condition class directly.
 * @link https://github.com/CacheControl/json-rules-engine/issues/253
 * @typedef {{
 *   factResult?: number,
 *   result?: boolean,
 * }} AdditionalConditionProperties
 */

/**
 * @typedef {ConditionProperties & AdditionalConditionProperties} Condition
 */

/**
 * @typedef {{
 *   firingRuleCount: !Object<AutoscalerDirection, number>,
 *   matchedConditions: !Object<AutoscalerDirection, !Condition>,
 *   scalingMetrics: !Object<AutoscalerDirection, !Set<string>>
 * }} RuleEngineAnalysis
 */

module.exports = {
  AutoscalerUnits,
  AutoscalerDirection,
  AutoscalerEngine,
};
