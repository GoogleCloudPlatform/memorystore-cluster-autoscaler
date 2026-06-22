/* Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

const assert = require('assert');
const {
  decideReplicaCount,
  calculateSize,
} = require('../../scaling-methods/replica_cpu');
const {AutoscalerUnits} = require('../../../../autoscaler-common/types');

describe('replica-cpu scaling method', () => {
  const baseCluster = {
    units: AutoscalerUnits.REPLICAS,
    currentSize: 2,
    minSize: 0,
    maxSize: 5,
    scaleOutCPUThreshold: 0.8,
    metrics: [{name: 'cpu_maximum_utilization', value: 50}],
  };

  it('decideReplicaCount scales out when CPU above threshold', () => {
    assert.equal(decideReplicaCount(90, 2, baseCluster), 3);
  });

  it('decideReplicaCount scales in when projected CPU below threshold', () => {
    assert.equal(decideReplicaCount(30, 3, baseCluster), 2);
  });

  it('normalizeCpuThreshold converts fraction config to percent', () => {
    const {normalizeCpuThreshold} = require('../../scaling-methods/replica_cpu');
    assert.equal(normalizeCpuThreshold(0.9), 90);
    assert.equal(normalizeCpuThreshold(undefined), 80);
  });

  it('calculateSize returns current when metric missing', async () => {
    const cluster = {...baseCluster, metrics: [], currentSize: 2};
    const size = await calculateSize(cluster, {});
    assert.equal(size, 2);
  });

  it('calculateSize returns target from metrics', async () => {
    const cluster = {
      ...baseCluster,
      metrics: [{name: 'cpu_maximum_utilization', value: 95}],
      currentSize: 1,
    };
    const size = await calculateSize(cluster, {});
    assert.equal(size, 2);
  });
});
