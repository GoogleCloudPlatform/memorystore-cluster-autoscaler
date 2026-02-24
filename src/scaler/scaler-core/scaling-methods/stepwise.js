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
 * Stepwise scaling method
 *
 * Default method used by the scaler.
 * Suggests adding or removing shards using a fixed step size.
 */
const {AutoscalerDirection} = require('../../../autoscaler-common/types');
const baseModule = require('./base');

/**
 * @typedef {import('../../../autoscaler-common/types')
 *   .AutoscalerMemorystoreCluster} AutoscalerMemorystoreCluster
 * @typedef {import('../../../autoscaler-common/types.js').RuleSet} RuleSet
 * @typedef {import('../../../autoscaler-common/types').RuleEngineAnalysis}
 *   RuleEngineAnalysis
 */

/**
 * Calculates the suggested cluster size for a given metric.
 *
 * @param {AutoscalerMemorystoreCluster} cluster for which to suggest a new
 *   size.
 * @param {AutoscalerDirection} direction Direction in which to scale.
 * @param {?RuleEngineAnalysis} engineAnalysis Results from the engine analysis.
 *   Not in use.
 * @return {number} Final suggested size for the cluster.
 */
// eslint-disable-next-line no-unused-vars
function getSuggestedSize(cluster, direction, engineAnalysis) {
  if (direction === AutoscalerDirection.OUT) {
    return cluster.currentSize + cluster.stepSize;
  } else if (direction === AutoscalerDirection.IN) {
    return cluster.currentSize - cluster.stepSize;
  } else {
    return cluster.currentSize;
  }
}

/**
 * Scaling calculation for Stepwise method
 *
 * @param {AutoscalerMemorystoreCluster} cluster
 * @param {RuleSet} ruleSet to use to determine scaling decisions.
 * @return {Promise<number>}
 */
async function calculateSize(cluster, ruleSet) {
  return baseModule.calculateScalingDecision(
    cluster,
    ruleSet,
    getSuggestedSize,
  );
}

module.exports = {calculateSize};
