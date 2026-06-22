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
 * REPLICA_CPU scaling method
 *
 * CPU-driven replica_count scaling (role=replica metrics). Used when units=REPLICAS.
 */

const {logger} = require('../../../autoscaler-common/logger');
const {AutoscalerUnits} = require('../../../autoscaler-common/types');

/**
 * @typedef {import('../../../autoscaler-common/types')
 *   .AutoscalerMemorystoreCluster} AutoscalerMemorystoreCluster
 * @typedef {import('../../../autoscaler-common/types').RuleSet} RuleSet
 */

/**
 * @param {AutoscalerMemorystoreCluster} cluster
 * @return {number|null}
 */
function getReplicaCpuMax(cluster) {
  const metric = cluster.metrics?.find(
    (m) => m.name === 'cpu_maximum_utilization',
  );
  if (metric?.value == null || Number.isNaN(metric.value)) {
    return null;
  }
  return metric.value;
}

/**
 * Poller reports CPU as percent (0–100); config uses fraction (0–1) per schema.
 *
 * @param {number|undefined} threshold
 * @return {number}
 */
function normalizeCpuThreshold(threshold) {
  const value = threshold ?? 0.8;
  return value * 100;
}

/**
 * @param {number} cpuMax
 * @param {number} currentReplicas
 * @param {AutoscalerMemorystoreCluster} cluster
 * @return {number}
 */
function decideReplicaCount(cpuMax, currentReplicas, cluster) {
  const threshold = normalizeCpuThreshold(cluster.scaleOutCPUThreshold);

  if (
    cpuMax > threshold &&
    currentReplicas < cluster.maxSize
  ) {
    return currentReplicas + 1;
  }

  if (
    currentReplicas > cluster.minSize &&
    currentReplicas > 1
  ) {
    const projected = (cpuMax * currentReplicas) / (currentReplicas - 1);
    if (projected < threshold) {
      return currentReplicas - 1;
    }
  }

  return currentReplicas;
}

/**
 * @param {AutoscalerMemorystoreCluster} cluster
 * @param {RuleSet} _ruleSet
 * @return {Promise<number>}
 */
// eslint-disable-next-line no-unused-vars
async function calculateSize(cluster, _ruleSet) {
  if (cluster.units !== AutoscalerUnits.REPLICAS) {
    throw new Error(
      `REPLICA_CPU scaling method requires units=REPLICAS, got ${cluster.units}`,
    );
  }

  const cpuMax = getReplicaCpuMax(cluster);
  if (cpuMax == null) {
    logger.warn({
      message:
        'Replica CPU metric missing; no scaling change (replicas may be 0)',
      projectId: cluster.projectId,
      regionId: cluster.regionId,
      clusterId: cluster.clusterId,
    });
    return cluster.currentSize;
  }

  const target = decideReplicaCount(cpuMax, cluster.currentSize, cluster);
  logger.info({
    message: `REPLICA_CPU: cpu_max=${cpuMax} current=${cluster.currentSize} target=${target}`,
    projectId: cluster.projectId,
    regionId: cluster.regionId,
    clusterId: cluster.clusterId,
  });
  return target;
}

module.exports = {
  calculateSize,
  decideReplicaCount,
  getReplicaCpuMax,
  normalizeCpuThreshold,
};
