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

/*
 * Direct scaling method
 *
 * Sets the instance to the maxSize directly (avoiding forbidden sizes)
 */
const baseModule = require('./base');

/**
 * @typedef {import('../../../autoscaler-common/types')
 *   .AutoscalerMemorystoreCluster} AutoscalerMemorystoreCluster
 * @typedef {import('../../../autoscaler-common/types').AutoscalerDirection}
 *   AutoscalerDirection
 * @typedef {import('../../../autoscaler-common/types').RuleSet}
 *   RuleSet
 * @typedef {import('../../../autoscaler-common/types').RuleEngineAnalysis}
 *   RuleEngineAnalysis
 */

/**
 * Calculates the suggested cluster size for a given metric.
 *
 * Always scales to the max size.
 *
 * @param {AutoscalerMemorystoreCluster} cluster for which to suggest a new
 *   size.
 * @param {AutoscalerDirection} direction Direction in which to scale. Not in
 *   use.
 * @param {?RuleEngineAnalysis} engineAnalysis Results from the engine analysis.
 *   Not in use.
 * @return {number} Final suggested size for the cluster.
 */
// eslint-disable-next-line no-unused-vars
function getSuggestedSize(cluster, direction, engineAnalysis) {
  return cluster.maxSize;
}

/**
 * Scaling calculation for Direct method. Always scales to max size no matter
 * what the conditions of the cluster.
 *
 * @param {AutoscalerMemorystoreCluster} cluster
 * @param {RuleSet} ruleSet to use to determine scaling decisions.
 * @return {Promise<number>}
 */
// eslint-disable-next-line no-unused-vars
async function calculateSize(cluster, ruleSet) {
  return baseModule.calculateScalingDecision(
    cluster,
    // The only rule is there are no rules.
    null,
    getSuggestedSize,
  );
}

module.exports = {calculateSize};
