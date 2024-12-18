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
// eslint-disable-next-line no-unused-vars
const should = require('should');
const sinon = require('sinon');

const app = rewire('../index.js');

const buildMetrics = app.__get__('buildMetrics');
const parseAndEnrichPayload = app.__get__('parseAndEnrichPayload');
const validateCustomMetric = app.__get__('validateCustomMetric');

describe('#buildMetrics', () => {
  it('should return 6 metrics', () => {
    buildMetrics(
      'fakeProjectId',
      'fakeRegionId',
      'fakeClusterId',
    ).should.have.length(6);
  });

  it('should insert the projectId', () => {
    buildMetrics(
      'fakeProjectId',
      'fakeRegionId',
      'fakeClusterId',
    )[0].filter.should.have.match(/fakeProjectId/);
  });

  it('should insert the regionId', () => {
    buildMetrics(
      'fakeRegionId',
      'fakeRegionId',
      'fakeClusterId',
    )[0].filter.should.have.match(/fakeRegionId/);
  });

  it('should insert the clusterId', () => {
    buildMetrics(
      'fakeProjectId',
      'fakeRegionId',
      'fakeClusterId',
    )[0].filter.should.have.match(/fakeClusterId/);
  });
});

describe('#validateCustomMetric', () => {
  it('should return false if name is missing', () => {
    validateCustomMetric({
      filter: 'my filter',
    }).should.be.false();
  });

  it('should return false if filter is missing', () => {
    validateCustomMetric({
      name: 'custom_filter',
    }).should.be.false();
  });

  it('should return false if name is blank', () => {
    validateCustomMetric({
      name: '',
      filter: 'my filter',
    }).should.be.false();
  });

  it('should return false if filter is blank', () => {
    validateCustomMetric({
      name: 'custom_filter',
      filter: '',
    }).should.be.false();
  });

  it('should return true if all required fields are present and valid', () => {
    validateCustomMetric({
      name: 'custom_filter',
      filter: 'my filter',
    }).should.be.true();
  });
});

describe('#parseAndEnrichPayload', () => {
  it('should return the default for stepSize', async () => {
    const payload = JSON.stringify([
      {
        projectId: 'project1',
        regionId: 'region1',
        clusterId: 'cluster1',
        units: 'SHARDS',
        scalerPubSubTopic: 'projects/myproject/topics/scaler-topic',
      },
    ]);

    const stub = sinon.stub().resolves({currentSize: 5, shardCount: 5});
    const unset = app.__set__('getMemorystoreClusterMetadata', stub);

    const mergedConfig = await parseAndEnrichPayload(payload);
    mergedConfig[0].stepSize.should.equal(1);

    unset();
  });

  it('should override the default for minSize', async () => {
    const payload = JSON.stringify([
      {
        projectId: 'project1',
        regionId: 'region1',
        clusterId: 'spanner1',
        units: 'SHARDS',
        scalerPubSubTopic: 'projects/myproject/topics/scaler-topic',
        minSize: 6,
      },
    ]);

    const stub = sinon.stub().resolves({currentSize: 5, shardCount: 5});
    const unset = app.__set__('getMemorystoreClusterMetadata', stub);

    const mergedConfig = await parseAndEnrichPayload(payload);
    mergedConfig[0].units.should.equal('SHARDS');
    mergedConfig[0].minSize.should.equal(6);

    unset();
  });

  it('should return the default for minFreeMemoryPercent', async () => {
    const payload = JSON.stringify([
      {
        projectId: 'project1',
        regionId: 'region1',
        clusterId: 'cluster1',
        units: 'SHARDS',
        scalerPubSubTopic: 'projects/myproject/topics/scaler-topic',
      },
    ]);

    const stub = sinon.stub().resolves({currentSize: 5, shardCount: 5});
    const unset = app.__set__('getMemorystoreClusterMetadata', stub);

    const mergedConfig = await parseAndEnrichPayload(payload);
    mergedConfig[0].minFreeMemoryPercent.should.equal(30);

    unset();
  });

  it('should override the default for minFreeMemoryPercent', async () => {
    const payload = JSON.stringify([
      {
        projectId: 'project1',
        regionId: 'region1',
        clusterId: 'spanner1',
        minFreeMemoryPercent: 20,
      },
    ]);

    const stub = sinon.stub().resolves({currentSize: 5, shardCount: 5});
    const unset = app.__set__('getMemorystoreClusterMetadata', stub);

    const mergedConfig = await parseAndEnrichPayload(payload);
    mergedConfig[0].minFreeMemoryPercent.should.equal(20);

    unset();
  });

  it('should merge in defaults for SHARDS', async () => {
    const payload = JSON.stringify([
      {
        projectId: 'project1',
        regionId: 'region1',
        clusterId: 'spanner1',
        scalerPubSubTopic: 'projects/myproject/topics/scaler-topic',
        units: 'SHARDS',
        minSize: 5,
      },
    ]);

    const stub = sinon.stub().resolves({currentSize: 5, shardCount: 5});
    const unset = app.__set__('getMemorystoreClusterMetadata', stub);

    const mergedConfig = await parseAndEnrichPayload(payload);
    mergedConfig[0].minSize.should.equal(5);
    mergedConfig[0].maxSize.should.equal(10);
    mergedConfig[0].stepSize.should.equal(1);

    unset();
  });

  it('should throw if units are set to anything other than SHARDS', async () => {
    const payload = JSON.stringify([
      {
        projectId: 'project1',
        regionId: 'region1',
        clusterId: 'spanner1',
        scalerPubSubTopic: 'projects/myproject/topics/scaler-topic',
        units: 'INVALID_UNITS',
        minSize: 5,
      },
    ]);

    const stub = sinon.stub().resolves({currentSize: 5, shardCount: 5});
    const unset = app.__set__('getMemorystoreClusterMetadata', stub);

    await parseAndEnrichPayload(payload).should.be.rejectedWith(Error, {
      message:
        'Invalid Autoscaler Configuration parameters:\n' +
        'MemorystoreConfig/0/units must be equal to one of the allowed values',
    });

    unset();
  });

  it('should throw if minSize is below allowed minimum', async () => {
    const payload = JSON.stringify([
      {
        projectId: 'project1',
        regionId: 'region1',
        clusterId: 'spanner1',
        scalerPubSubTopic: 'projects/myproject/topics/scaler-topic',
        units: 'SHARDS',
        minSize: 0,
      },
    ]);

    await parseAndEnrichPayload(payload).should.be.rejectedWith(Error, {
      message:
        'Invalid Autoscaler Configuration parameters:\n' +
        'MemorystoreConfig/0/minSize must be >= 1',
    });
  });

  it('should throw if minSize is larger than maxSize', async () => {
    const payload = JSON.stringify([
      {
        projectId: 'project1',
        regionId: 'region1',
        clusterId: 'spanner1',
        scalerPubSubTopic: 'projects/myproject/topics/scaler-topic',
        units: 'SHARDS',
        minSize: 10,
        maxSize: 5,
      },
    ]);

    await parseAndEnrichPayload(payload).should.be.rejectedWith(Error, {
      message: 'INVALID CONFIG: minSize (10) is larger than maxSize (5).',
    });
  });

  it('should throw if a duplicate metric is defined', async () => {
    const payload = JSON.stringify([
      {
        projectId: 'project1',
        regionId: 'region1',
        clusterId: 'spanner1',
        scalerPubSubTopic: 'projects/myproject/topics/scaler-topic',
        units: 'SHARDS',
        metrics: [
          {
            name: 'cpu_maximum_utilization',
            filter: 'redis.googleapis.com/cluster/cpu/maximum_utilization',
          },
        ],
      },
    ]);

    await parseAndEnrichPayload(payload).should.be.rejectedWith(Error, {
      message:
        'INVALID CONFIG: custom metric cpu_maximum_utilization' +
        ' shadows default metric name',
    });
  });
});
