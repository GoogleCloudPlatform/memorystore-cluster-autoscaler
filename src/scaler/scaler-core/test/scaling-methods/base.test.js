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
 * ESLINT: Ignore max line length errors on lines starting with 'it('
 * (test descriptions)
 */
/* eslint max-len: ["error", { "ignorePattern": "^\\s*it\\(" }] */
const rewire = require('rewire');

const app = rewire('../../scaling-methods/base.js');
const {createClusterParameters, metricsOverlay} = require('../test-utils.js');
const {AutoscalerDirection} = require('../../../../autoscaler-common/types');
const {
  ruleSet: defaultRuleSet,
} = require('../../scaling-profiles/profiles/cpu_and_memory.js');

/**
 * @typedef { import('../../../../autoscaler-common/types')
 *   .AutoscalerMemorystoreCluster } AutoscalerMemorystoreCluster
 */

const getScaleSuggestionMessage = app.__get__('getScaleSuggestionMessage');
describe('#getScaleSuggestionMessage', () => {
  it('should suggest no change when metric value within range', () => {
    getScaleSuggestionMessage({}, 999, 'NONE').should.containEql('no change');
  });

  it('should not suggest scaling when shards suggestion is equal to current', () => {
    const msg = getScaleSuggestionMessage(
      {
        units: 'SHARDS',
        currentSize: 3,
        minSize: 2,
        maxSize: 8,
      },
      3,
      '',
    );
    msg.should.containEql('size is equal to the current size');
    msg.should.containEql('SHARDS');
  });

  it('should suggest scaling when shards suggestion is not equal to current', () => {
    const msg = getScaleSuggestionMessage(
      {
        units: 'SHARDS',
        currentSize: 3,
        minSize: 2,
        maxSize: 8,
      },
      5,
      '',
    );
    msg.should.containEql('suggesting to scale');
    msg.should.containEql('SHARDS');
  });

  it('should indicate scaling is not possible if shards suggestion is above max', () => {
    const msg = getScaleSuggestionMessage(
      {
        units: 'SHARDS',
        currentSize: 3,
        minSize: 2,
        maxSize: 8,
      },
      9,
      '',
    );
    msg.should.containEql('higher than MAX');
    msg.should.containEql('SHARDS');
  });

  it('should indicate scaling is not possible if shards suggestion is below min', () => {
    const msg = getScaleSuggestionMessage(
      {
        units: 'SHARDS',
        currentSize: 3,
        minSize: 2,
        maxSize: 8,
      },
      1,
      '',
    );
    msg.should.containEql('lower than MIN');
    msg.should.containEql('SHARDS');
  });
});

describe('#getScalingDirection', () => {
  const getEngineAnalysis = app.__get__('getEngineAnalysis');
  const getScalingDirection = app.__get__('getScalingDirection');

  it('should suggest scale OUT given high average CPU utilization', async () => {
    const metrics = [
      {
        name: 'cpu_average_utilization',
        value: 100,
      },
    ];
    const cluster = createClusterParameters();
    cluster.metrics = metricsOverlay(cluster, metrics);

    const engineAnalysis = await getEngineAnalysis(cluster, defaultRuleSet);
    const direction = await getScalingDirection(engineAnalysis);

    direction.should.equal('OUT');
  });

  it('should suggest scale OUT given high maximum and average CPU utilization', async () => {
    const metrics = [
      {
        name: 'cpu_maximum_utilization',
        value: 100,
      },
      {
        name: 'cpu_average_utilization',
        value: 100,
      },
    ];
    const cluster = createClusterParameters();
    cluster.metrics = metricsOverlay(cluster, metrics);

    const engineAnalysis = await getEngineAnalysis(cluster, defaultRuleSet);
    const direction = await getScalingDirection(engineAnalysis);

    direction.should.equal('OUT');
  });

  it('should suggest scale IN given low average CPU utilization', async () => {
    const metrics = [
      {
        name: 'cpu_average_utilization',
        value: 10,
      },
    ];
    const cluster = createClusterParameters();
    cluster.metrics = metricsOverlay(cluster, metrics);

    const engineAnalysis = await getEngineAnalysis(cluster, defaultRuleSet);
    const direction = await getScalingDirection(engineAnalysis);

    direction.should.equal('IN');
  });

  it('should suggest scale IN given low maximum and average CPU utilization', async () => {
    const metrics = [
      {
        name: 'cpu_maximum_utilization',
        value: 10,
      },
      {
        name: 'cpu_average_utilization',
        value: 10,
      },
    ];
    const cluster = createClusterParameters();
    cluster.metrics = metricsOverlay(cluster, metrics);

    const engineAnalysis = await getEngineAnalysis(cluster, defaultRuleSet);
    const direction = await getScalingDirection(engineAnalysis);

    direction.should.equal('IN');
  });

  it('should suggest scale OUT given high average memory utilization', async () => {
    const metrics = [
      {
        name: 'memory_average_utilization',
        value: 100,
      },
    ];
    const cluster = createClusterParameters();
    cluster.metrics = metricsOverlay(cluster, metrics);

    const engineAnalysis = await getEngineAnalysis(cluster, defaultRuleSet);
    const direction = await getScalingDirection(engineAnalysis);

    direction.should.equal('OUT');
  });

  it('should suggest scale OUT given high maximum and average memory utilization', async () => {
    const metrics = [
      {
        name: 'memory_maximum_utilization',
        value: 100,
      },
      {
        name: 'memory_average_utilization',
        value: 100,
      },
    ];
    const cluster = createClusterParameters();
    cluster.metrics = metricsOverlay(cluster, metrics);

    const engineAnalysis = await getEngineAnalysis(cluster, defaultRuleSet);
    const direction = await getScalingDirection(engineAnalysis);

    direction.should.equal('OUT');
  });

  it('should suggest scale IN given low average memory utilization', async () => {
    const metrics = [
      {
        name: 'memory_average_utilization',
        value: 10,
      },
    ];
    const cluster = createClusterParameters();
    cluster.metrics = metricsOverlay(cluster, metrics);

    const engineAnalysis = await getEngineAnalysis(cluster, defaultRuleSet);
    const direction = await getScalingDirection(engineAnalysis);

    direction.should.equal('IN');
  });

  it('should suggest scale IN given low maximum and average memory utilization', async () => {
    const metrics = [
      {
        name: 'memory_maximum_utilization',
        value: 10,
      },
      {
        name: 'memory_average_utilization',
        value: 10,
      },
    ];
    const cluster = createClusterParameters();
    cluster.metrics = metricsOverlay(cluster, metrics);

    const engineAnalysis = await getEngineAnalysis(cluster, defaultRuleSet);
    const direction = await getScalingDirection(engineAnalysis);

    direction.should.equal('IN');
  });

  it('should not suggest scale IN due to low CPU if keys are being evicted', async () => {
    const metrics = [
      {
        name: 'cpu_maximum_utilization',
        value: 10,
      },
      {
        name: 'cpu_average_utilization',
        value: 10,
      },
      {
        name: 'average_evicted_keys',
        value: 100,
      },
      {
        name: 'maximum_evicted_keys',
        value: 100,
      },
    ];
    const cluster = createClusterParameters();
    cluster.metrics = metricsOverlay(cluster, metrics);

    const engineAnalysis = await getEngineAnalysis(cluster, defaultRuleSet);
    const direction = await getScalingDirection(engineAnalysis);

    direction.should.not.equal('IN');
  });

  it('should not suggest scale IN due to low memory utilization if keys are being evicted', async () => {
    const metrics = [
      {
        name: 'memory_maximum_utilization',
        value: 10,
      },
      {
        name: 'memory_average_utilization',
        value: 10,
      },
      {
        name: 'average_evicted_keys',
        value: 100,
      },
      {
        name: 'maximum_evicted_keys',
        value: 100,
      },
    ];
    const cluster = createClusterParameters();
    cluster.metrics = metricsOverlay(cluster, metrics);

    const engineAnalysis = await getEngineAnalysis(cluster, defaultRuleSet);
    const direction = await getScalingDirection(engineAnalysis);

    direction.should.not.equal('IN');
  });

  it('should suggest scale OUT if a metric indicates scale OUT while others indicate scale IN', async () => {
    const metrics = [
      {
        name: 'cpu_maximum_utilization',
        value: 10,
      },
      {
        name: 'cpu_average_utilization',
        value: 100,
      },
      {
        name: 'memory_maximum_utilization',
        value: 10,
      },
      {
        name: 'memory_average_utilization',
        value: 10,
      },
    ];
    const cluster = createClusterParameters();
    cluster.metrics = metricsOverlay(cluster, metrics);

    const engineAnalysis = await getEngineAnalysis(cluster, defaultRuleSet);
    const direction = await getScalingDirection(engineAnalysis);

    direction.should.equal('OUT');
  });
});

const getMaxMemoryUtilization = app.__get__('getMaxMemoryUtilization');
describe('#getMaxMemoryUtilization', () => {
  it('should return the maximum memory utilization', () => {
    const metrics = [
      {
        name: 'dummy_metric_1',
        value: 10,
      },
      {
        name: 'memory_maximum_utilization',
        value: 20,
      },
      {
        name: 'dummy_metric_2',
        value: 30,
      },
    ];
    const cluster = createClusterParameters();
    cluster.metrics = metricsOverlay(cluster, metrics);
    const maxUtilization = getMaxMemoryUtilization(cluster);
    maxUtilization.should.equal(20);
  });
});

const ensureMinFreeMemory = app.__get__('ensureMinFreeMemory');
describe('#ensureMinFreeMemory', () => {
  it('should prevent scale-in to a size below the safe scaling size', () => {
    const metrics = [
      {
        name: 'memory_maximum_utilization',
        value: 60,
      },
    ];
    const cluster = createClusterParameters({
      currentSize: 10,
      minFreeMemoryPercent: 20,
    });
    cluster.metrics = metricsOverlay(cluster, metrics);
    const safeSize = ensureMinFreeMemory(cluster, 4, AutoscalerDirection.IN);
    safeSize.should.equal(8);
  });

  it('should do nothing for a safe suggested scale-in size', () => {
    const metrics = [
      {
        name: 'memory_maximum_utilization',
        value: 20,
      },
    ];
    const cluster = createClusterParameters({
      currentSize: 10,
      minFreeMemoryPercent: 20,
    });
    cluster.metrics = metricsOverlay(cluster, metrics);
    const safeSize = ensureMinFreeMemory(cluster, 9, AutoscalerDirection.IN);
    safeSize.should.equal(9);
  });

  it('should invert a scale-in to a scale-out if required', () => {
    const metrics = [
      {
        name: 'memory_maximum_utilization',
        value: 85,
      },
    ];
    const cluster = createClusterParameters({
      currentSize: 10,
      minFreeMemoryPercent: 30,
    });
    cluster.metrics = metricsOverlay(cluster, metrics);
    const safeSize = ensureMinFreeMemory(cluster, 4, AutoscalerDirection.IN);
    safeSize.should.equal(13);
  });
});

const ensureValidClusterSize = app.__get__('ensureValidClusterSize');
describe('#ensureValidClusterSize', () => {
  it('should clamp cluster size at configured maximum', () => {
    const cluster = createClusterParameters({minSize: 10, maxSize: 20});
    const clampedSize = ensureValidClusterSize(
      cluster,
      21,
      AutoscalerDirection.OUT,
    );
    clampedSize.should.equal(20);
  });

  it('should clamp cluster size at configured minimum', () => {
    const cluster = createClusterParameters({minSize: 10, maxSize: 20});
    const clampedSize = ensureValidClusterSize(
      cluster,
      9,
      AutoscalerDirection.IN,
    );
    clampedSize.should.equal(10);
  });

  it('should not clamp when cluster size is within configured range', () => {
    const cluster = createClusterParameters({minSize: 10, maxSize: 20});
    const clampedSize = ensureValidClusterSize(
      cluster,
      15,
      AutoscalerDirection.OUT,
    );
    clampedSize.should.equal(15);
  });

  it('should prevent scale in below minimum supported cluster size', () => {
    const cluster = createClusterParameters({minSize: 1, maxSize: 10});
    const clampedSize = ensureValidClusterSize(
      cluster,
      0,
      AutoscalerDirection.IN,
    );
    clampedSize.should.equal(1);
  });
});
