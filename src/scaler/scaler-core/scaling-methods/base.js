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
 * Base module that encapsulates functionality common to scaling methods:
 * * Load rules into rules engine
 * * Run rules engine
 * * Apply method-specific logic
 * * Log sizing suggestions per metric
 */

const {logger} = require('../../../autoscaler-common/logger');
const {Engine} = require('json-rules-engine');
const {AutoscalerDirection} = require('../../../autoscaler-common/types');
const {
  CLUSTER_SIZE_MIN,
} = require('../../../autoscaler-common/config-parameters');

/**
 * @typedef {import('../../../autoscaler-common/types')
 *   .AutoscalerMemorystoreCluster} AutoscalerMemorystoreCluster
 * @typedef {import('../../../autoscaler-common/types')
 *   .MemorystoreClusterMetricValue} MemorystoreClusterMetricValue
 * @typedef {import('../../../autoscaler-common/types').RuleEngineAnalysis}
 *   RuleEngineAnalysis
 * @typedef {import('../../../autoscaler-common/types').Condition}
 *   Condition
 * @typedef {import('../../../autoscaler-common/types').RuleSet} RuleSet
 * @typedef {import('json-rules-engine').RuleResult} RuleResult
 * @typedef {import('json-rules-engine').NestedCondition} NestedCondition
 *
 */

/**
 * Get a string describing the scaling suggestion.
 *
 * @param {AutoscalerMemorystoreCluster} cluster
 * @param {number} suggestedSize
 * @param {AutoscalerDirection} scalingDirection
 * @return {string}
 */
function getScaleSuggestionMessage(cluster, suggestedSize, scalingDirection) {
  if (scalingDirection == AutoscalerDirection.NONE) {
    return `no change suggested`;
  }
  if (suggestedSize == cluster.currentSize) {
    return `the suggested size is equal to the current size: ${cluster.currentSize} ${cluster.units}`;
  }
  if (suggestedSize > cluster.maxSize) {
    return `cannot scale to ${suggestedSize} because it is higher than MAX ${cluster.maxSize} ${cluster.units}`;
  }
  if (suggestedSize < cluster.minSize) {
    return `Cannot scale to ${suggestedSize} because it is lower than MIN ${cluster.minSize} ${cluster.units}`;
  }
  return `suggesting to scale from ${cluster.currentSize} to ${suggestedSize} ${cluster.units}.`;
}

/**
 * Gets a map of matched metric rules with value and threshold.
 *
 * @param {RuleResult} ruleResult from the engine.
 * @return {!Array<!Condition>} List of condition that were triggered the rule.
 */
function getRuleConditionMetrics(ruleResult) {
  let /** @type {NestedCondition[]} */ ruleConditions;
  if (ruleResult?.conditions && 'all' in ruleResult?.conditions) {
    ruleConditions = ruleResult.conditions.all;
  } else if (ruleResult?.conditions && 'any' in ruleResult?.conditions) {
    ruleConditions = ruleResult?.conditions?.any;
  } else {
    ruleConditions = [];
  }

  const /** @type {!Condition[]} */ ruleConditionsList = [];
  for (const ruleCondition of ruleConditions) {
    /*
     * Narrow down typing and skip NestedConditions.
     * Only Condition (currently ConditionProperties) are to be considered.
     * TODO: add support for nested conditions.
     */
    if (!('result' in ruleCondition)) continue;
    if (!('fact' in ruleCondition)) continue;
    if (!('factResult' in ruleCondition)) continue;
    if (!('value' in ruleCondition)) continue;

    // Only consider rules if they triggered the scale (i.e. result=true).
    if (!ruleCondition.result) continue;

    /*
     * Redefining this type as workaround because json-rules-engine typing does
     * not match the actual signature nor exports the Condition class directly.
     * See: https://github.com/CacheControl/json-rules-engine/issues/253
     */
    // @ts-ignore
    const /** @type {Condition} */ condition = ruleCondition;
    ruleConditionsList.push(condition);
  }

  return ruleConditionsList;
}

/**
 * Gets the relevant analysis from the rules engine.
 *
 * Analysis include: count of firing direction and relevant metrics for scaling,
 * for those methods which requires it.
 *
 * @param {AutoscalerMemorystoreCluster} cluster for which to perform analysis.
 * @param {?RuleSet} ruleSet to use to determine scaling decisions.
 * @return {!Promise<?RuleEngineAnalysis>} Scaling analysis from the engine.
 */
async function getEngineAnalysis(cluster, ruleSet) {
  if (!ruleSet) return null;

  logger.debug({
    message:
      `---- ${cluster.projectId}/${cluster.regionId}/${cluster.clusterId}: ` +
      `${cluster.scalingMethod} rules engine ----`,
    projectId: cluster.projectId,
    regionId: cluster.regionId,
    clusterId: cluster.clusterId,
  });

  const rulesEngine = new Engine();

  Object.values(ruleSet).forEach((rule) => {
    rulesEngine.addRule(rule);
  });

  const /** @type {!RuleEngineAnalysis} */ engineAnalysis = {
      firingRuleCount: {
        [AutoscalerDirection.IN]: 0,
        [AutoscalerDirection.OUT]: 0,
      },
      matchedConditions: {
        [AutoscalerDirection.IN]: [],
        [AutoscalerDirection.OUT]: [],
      },
      scalingMetrics: {
        [AutoscalerDirection.IN]: new Set(),
        [AutoscalerDirection.OUT]: new Set(),
      },
    };

  rulesEngine.on('success', function (event, _, ruleResult) {
    logger.debug({
      message: `\tRule firing: ${event.params?.message} => ${event.type}`,
      projectId: cluster.projectId,
      regionId: cluster.regionId,
      clusterId: cluster.clusterId,
      event: event,
    });

    const ruleConditions = getRuleConditionMetrics(ruleResult);
    const /** @type {!Set<string>} */ scalingMetrics =
        event.params?.scalingMetrics || new Set();
    if (
      event.type === AutoscalerDirection.OUT ||
      event.type === AutoscalerDirection.IN
    ) {
      engineAnalysis.firingRuleCount[event.type]++;
      engineAnalysis.matchedConditions[event.type].push(
        ...Object.values(ruleConditions),
      );
      for (const scalingMetric of scalingMetrics) {
        engineAnalysis.scalingMetrics[event.type].add(scalingMetric);
      }
    } else {
      logger.debug({
        message: `\tIgnoring unexpectedly firing rule of type ${event.type}`,
        projectId: cluster.projectId,
        regionId: cluster.regionId,
        clusterId: cluster.clusterId,
        event: event,
      });
    }
  });

  const facts = {};
  Object.values(cluster.metrics).forEach((metric) => {
    // @ts-ignore
    facts[metric.name] = metric.value; // TODO strict types
  });

  await rulesEngine.run(facts);

  return engineAnalysis;
}

/**
 * Get the scaling direction for the given cluster based
 * on its metrics and the rules engine
 *
 * @param {!RuleEngineAnalysis} engineAnalysis Analysis from the engine rules.
 * @return {AutoscalerDirection} Direction in which to scale.
 */
function getScalingDirection(engineAnalysis) {
  if (!engineAnalysis) return AutoscalerDirection.NONE;

  if (engineAnalysis.firingRuleCount[AutoscalerDirection.OUT] > 0) {
    return AutoscalerDirection.OUT;
  }

  if (engineAnalysis.firingRuleCount[AutoscalerDirection.IN] > 0) {
    return AutoscalerDirection.IN;
  }

  return AutoscalerDirection.NONE;
}

/**
 * Retrieve the current maximum memory utilization for the cluster.
 *
 * @param {AutoscalerMemorystoreCluster} cluster
 * @return {number}
 */
function getMaxMemoryUtilization(cluster) {
  const MAX_UTILIZATION_METRIC = 'memory_maximum_utilization';

  for (const metric of /** @type {MemorystoreClusterMetricValue[]} */ (
    cluster.metrics
  )) {
    if (metric.name === MAX_UTILIZATION_METRIC) {
      return metric.value;
    }
  }
  throw new Error(`Cluster metrics had no ${MAX_UTILIZATION_METRIC} field.`);
}

/**
 * Ensure scaling operation is safe to perform.
 *
 * Check that the suggested size at least the current memory usage plus
 * a safety margin, then clamp the size to the next shard that is greater
 * than that value. This prevents scaling to a cluster size that is too
 * small to comfortably accommodate the current keyspace, per the
 * documented best practice.
 *
 * @param {AutoscalerMemorystoreCluster} cluster
 * @param {number} suggestedSize
 * @param {AutoscalerDirection} scalingDirection
 * @return {number}
 */
function ensureMinFreeMemory(cluster, suggestedSize, scalingDirection) {
  const currentUtilization = getMaxMemoryUtilization(cluster);
  const usedShards = cluster.currentSize * (currentUtilization / 100);
  const safeSize = Math.ceil(
    usedShards / (1 - cluster.minFreeMemoryPercent / 100),
  );
  const suggestedUsagePct = Math.round((usedShards / suggestedSize) * 100);
  const safeSizeUsagePct = Math.round((usedShards / safeSize) * 100);

  let size = suggestedSize;

  logger.debug({
    message: `\tCurrent memory utilization: ${currentUtilization.toFixed(2)}%; safe utilization is at ${safeSize} ${cluster.units}: ${safeSizeUsagePct}% (utilization at suggested ${suggestedSize} ${cluster.units}: ${suggestedUsagePct}%)`,
    projectId: cluster.projectId,
    regionId: cluster.regionId,
    clusterId: cluster.clusterId,
  });

  if (suggestedSize < safeSize) {
    size = safeSize;
    logger.debug({
      message:
        `\tModifying scale ${scalingDirection} to ${size} ${cluster.units} (from ${suggestedSize} ${cluster.units}) ` +
        `to ensure safe scaling (used ${usedShards.toFixed(2)} ${cluster.units}, minFreeMemoryPercent ${cluster.minFreeMemoryPercent}%)`,
      projectId: cluster.projectId,
      regionId: cluster.regionId,
      clusterId: cluster.clusterId,
    });
  }
  return size;
}

/**
 * Clamp cluster size to between cluster.minSize and cluster.maxSize
 *
 * @param {AutoscalerMemorystoreCluster} cluster
 * @param {number} suggestedSize
 * @param {AutoscalerDirection} scalingDirection
 * @return {number}
 */
function ensureValidClusterSize(cluster, suggestedSize, scalingDirection) {
  let size = suggestedSize;
  if (suggestedSize > cluster.maxSize) {
    logger.debug({
      message: `\tClamping the suggested size of ${suggestedSize} ${cluster.units} to configured maximum ${cluster.maxSize}`,
      projectId: cluster.projectId,
      regionId: cluster.regionId,
      clusterId: cluster.clusterId,
    });
    size = cluster.maxSize;
  } else if (suggestedSize < cluster.minSize) {
    logger.debug({
      message: `\tClamping the suggested size of ${suggestedSize} ${cluster.units} to configured minimum ${cluster.minSize}`,
      projectId: cluster.projectId,
      regionId: cluster.regionId,
      clusterId: cluster.clusterId,
    });
    size = cluster.minSize;
  }

  /*
   * Check for a cluster size that is too small to prevent an invalid scaling operation.
   * A check for a cluster size that is too large is not included here because this is
   * dependent on the number of replicas in the cluster.
   */
  if (size < CLUSTER_SIZE_MIN) {
    size = CLUSTER_SIZE_MIN;
    logger.debug({
      message: `\tModifiying scale ${scalingDirection} to ${size} ${cluster.units} to ensure minimally valid ${CLUSTER_SIZE_MIN} ${cluster.units}`,
      projectId: cluster.projectId,
      regionId: cluster.regionId,
      clusterId: cluster.clusterId,
    });
  }

  return size;
}

/**
 * Get the suggested size for the given cluster based
 * on its metrics
 *
 * @param {AutoscalerMemorystoreCluster} cluster
 * @param {RuleSet | null} ruleSet
 * @param {function(
 *   AutoscalerMemorystoreCluster,AutoscalerDirection,?RuleEngineAnalysis
 * ): number} getSuggestedSize
 * @return {Promise<number>}
 */
async function calculateScalingDecision(cluster, ruleSet, getSuggestedSize) {
  logger.debug({
    message: `---- ${cluster.projectId}/${cluster.regionId}/${cluster.clusterId}: ${cluster.scalingMethod} size suggestions----`,
    projectId: cluster.projectId,
    regionId: cluster.regionId,
    clusterId: cluster.clusterId,
  });
  logger.debug({
    message: `\tMin=${cluster.minSize}, Current=${cluster.currentSize}, Max=${cluster.maxSize} ${cluster.units}`,
    projectId: cluster.projectId,
    regionId: cluster.regionId,
    clusterId: cluster.clusterId,
  });

  const engineAnalysis = await getEngineAnalysis(cluster, ruleSet);

  // If there is an analysis, use it to determine direction, otherwise
  // prioritize scaling out.
  const scalingDirection = engineAnalysis
    ? getScalingDirection(engineAnalysis)
    : AutoscalerDirection.OUT;

  logger.debug({
    message: `\tScaling direction: ${scalingDirection}`,
    projectId: cluster.projectId,
    regionId: cluster.regionId,
    clusterId: cluster.clusterId,
  });

  const suggestedSize = getSuggestedSize(
    cluster,
    scalingDirection,
    engineAnalysis,
  );
  const scaleSuggestionMessage = getScaleSuggestionMessage(
    cluster,
    suggestedSize,
    scalingDirection,
  );

  logger.debug({
    message: `\tInitial scaling suggestion: ${scaleSuggestionMessage}`,
    projectId: cluster.projectId,
    regionId: cluster.regionId,
    clusterId: cluster.clusterId,
  });

  const safeClusterSize = ensureMinFreeMemory(
    cluster,
    suggestedSize,
    scalingDirection,
  );

  const finalClusterSize = ensureValidClusterSize(
    cluster,
    safeClusterSize,
    scalingDirection,
  );

  logger.debug({
    message: `\t=> Final ${cluster.scalingMethod} suggestion: ${finalClusterSize} ${cluster.units}`,
    projectId: cluster.projectId,
    regionId: cluster.regionId,
    clusterId: cluster.clusterId,
  });
  return finalClusterSize;
}

module.exports = {
  calculateScalingDecision,
};
