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
const sinon = require('sinon');
const State = require('../state.js');

const parameters = require('./samples/parameters.json');

/**
 * @typedef {import('../../../autoscaler-common/types')
 *   .AutoscalerMemorystoreCluster} AutoscalerMemorystoreCluster
 * @typedef {import('../../../autoscaler-common/types').MemorystoreClusterMetric
 *   } MemorystoreClusterMetric
 * @typedef {import('../../../autoscaler-common/types')
 *   .MemorystoreClusterMetricValue} MemorystoreClusterMetricValue
 * @typedef {State.StateData} StateData
 */

const DUMMY_TIMESTAMP = 1704110400000;

/**
 * Read Spanner params from file
 *
 * @param {Object} [overrideParams]
 * @return {AutoscalerMemorystoreCluster}
 */
function createClusterParameters(overrideParams) {
  return /** @type {AutoscalerMemorystoreCluster} */ ({
    ...parameters,
    ...overrideParams,
  });
}

/**
 * Merge metrics objects, prioritizing metricsOverlay
 *
 * @param {AutoscalerMemorystoreCluster} cluster
 * @param {(MemorystoreClusterMetric | MemorystoreClusterMetricValue)[]}
 *   metricsOverlay
 * @return {(MemorystoreClusterMetric | MemorystoreClusterMetricValue)[]}
 */
function metricsOverlay(cluster, metricsOverlay) {
  const retval = [...metricsOverlay];
  for (const clusterMetric of cluster.metrics) {
    if (!metricsOverlay.some((m) => m.name === clusterMetric.name)) {
      retval.push(clusterMetric);
    }
  }
  return retval;
}

/**
 * @return {sinon.SinonStubbedInstance<State>} state class stub
 */
function createStubState() {
  const stubState = sinon.createStubInstance(State);
  stubState.updateState.resolves();
  sinon.replaceGetter(stubState, 'now', () => DUMMY_TIMESTAMP);
  return stubState;
}

/**
 * @return {StateData} StateData object
 */
function createStateData() {
  return {
    lastScalingTimestamp: 0,
    createdOn: 0,
    updatedOn: 0,
    lastScalingCompleteTimestamp: 0,
    scalingOperationId: null,
    scalingRequestedSize: null,
    scalingPreviousSize: null,
    scalingMethod: null,
  };
}

/**
 * @return {string} downstream message
 */
function createDownstreamMsg() {
  return JSON.stringify(require('./samples/downstream-msg.json'), null, 2);
}

module.exports = {
  createClusterParameters,
  createStubState,
  createDownstreamMsg,
  createStateData,
  metricsOverlay,
};
