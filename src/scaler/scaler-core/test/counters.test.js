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
const Counters = require('../counters.js');
const CountersBase = require('../../../autoscaler-common/counters-base.js');

describe('#scaler-counters', () => {
  let baseIncCounter = sinon.stub(CountersBase, 'incCounter');
  let baseRecordValue = sinon.stub(CountersBase, 'recordValue');

  /**
   * @type {import('../../../autoscaler-common/types')
   *   .AutoscalerMemorystoreCluster}
   */
  const cluster = {
    projectId: 'myProject',
    clusterId: 'myCluster',
    currentSize: 5,
    maxSize: 10,
    minSize: 3,
    metrics: [],
    regionId: 'us-central1',
    scalingProfile: 'CPU_AND_MEMORY',
    scalingMethod: 'STEPWISE',
    scaleInCoolingMinutes: 10,
    scaleOutCoolingMinutes: 5,
    minFreeMemoryPercent: 30,
    stepSize: 2,
    units: 'SHARDS',
    engine: 'REDIS',
  };

  beforeEach(() => {
    baseIncCounter = sinon.stub(CountersBase, 'incCounter');
    baseRecordValue = sinon.stub(CountersBase, 'recordValue');
  });

  afterEach(() => {
    sinon.reset();
    sinon.restore();
  });

  it('incScalingSuccessCounter uses cluster config to determine counter attributes', async () => {
    await Counters.incScalingSuccessCounter(cluster, 10);
    sinon.assert.calledWithExactly(baseIncCounter, 'scaler/scaling-success', {
      memorystore_cluster_project_id: 'myProject',
      memorystore_cluster_instance_id: 'myCluster',
      scaling_method: 'STEPWISE',
      scaling_direction: 'SCALE_UP',
    });
  });

  it('incScalingSuccessCounter overrides cluster config with parameters', async () => {
    await Counters.incScalingSuccessCounter(cluster, 10, 20, 'DIRECT');
    sinon.assert.calledWithExactly(baseIncCounter, 'scaler/scaling-success', {
      memorystore_cluster_project_id: 'myProject',
      memorystore_cluster_instance_id: 'myCluster',
      scaling_method: 'DIRECT',
      scaling_direction: 'SCALE_DOWN',
    });
  });
  it('incScalingFailedCounter uses cluster config to determine counter attributes', async () => {
    await Counters.incScalingFailedCounter(cluster, 10);
    sinon.assert.calledWithExactly(baseIncCounter, 'scaler/scaling-failed', {
      memorystore_cluster_project_id: 'myProject',
      memorystore_cluster_instance_id: 'myCluster',
      scaling_method: 'STEPWISE',
      scaling_direction: 'SCALE_UP',
    });
  });

  it('incScalingFailedCounter overrides cluster config with parameters', async () => {
    await Counters.incScalingFailedCounter(cluster, 10, 20, 'DIRECT');
    sinon.assert.calledWithExactly(baseIncCounter, 'scaler/scaling-failed', {
      memorystore_cluster_project_id: 'myProject',
      memorystore_cluster_instance_id: 'myCluster',
      scaling_method: 'DIRECT',
      scaling_direction: 'SCALE_DOWN',
    });
  });
  it('recordScalingDuration uses cluster config to determine counter attributes', async () => {
    await Counters.recordScalingDuration(60_000, cluster, 10);
    sinon.assert.calledWithExactly(
      baseRecordValue,
      'scaler/scaling-duration',
      60_000,
      {
        memorystore_cluster_project_id: 'myProject',
        memorystore_cluster_instance_id: 'myCluster',
        scaling_method: 'STEPWISE',
        scaling_direction: 'SCALE_UP',
      },
    );
  });

  it('recordScalingDuration overrides cluster config with parameters', async () => {
    await Counters.recordScalingDuration(60_000, cluster, 10, 20, 'DIRECT');
    sinon.assert.calledWithExactly(
      baseRecordValue,
      'scaler/scaling-duration',
      60_000,
      {
        memorystore_cluster_project_id: 'myProject',
        memorystore_cluster_instance_id: 'myCluster',
        scaling_method: 'DIRECT',
        scaling_direction: 'SCALE_DOWN',
      },
    );
  });
});
