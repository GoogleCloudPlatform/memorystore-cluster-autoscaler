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
 * Autoscaler Poller function
 *
 * * Polls one or more Memorystore Cluster instances for metrics.
 * * Sends metrics to Scaler to determine if an instance needs to be autoscaled
 */

// eslint-disable-next-line no-unused-vars -- for type checking only.
const express = require('express');
const monitoring = require('@google-cloud/monitoring');
const {logger} = require('../../autoscaler-common/logger');
const {PubSub} = require('@google-cloud/pubsub');
const {CloudRedisClusterClient} = require('@google-cloud/redis-cluster');
const Counters = require('./counters.js');
const {AutoscalerUnits} = require('../../autoscaler-common/types');
const {CLUSTER_SIZE_MIN} = require('../../autoscaler-common/config-parameters');
const assertDefined = require('../../autoscaler-common/assert-defined');
const {version: packageVersion} = require('../../../package.json');
const {ConfigValidator} = require('./config-validator');

/**
 * @typedef {import('../../autoscaler-common/types')
 *   .AutoscalerMemorystoreCluster} AutoscalerMemorystoreCluster
 * @typedef {import('../../autoscaler-common/types').MemorystoreClusterConfig
 *   } MemorystoreClusterConfig
 * @typedef {import('../../autoscaler-common/types').MemorystoreClusterMetadata
 *   } MemorystoreClusterMetadata
 * @typedef {import('../../autoscaler-common/types')
 *   .MemorystoreClusterMetricValue} MemorystoreClusterMetricValue
 * @typedef {import('../../autoscaler-common/types').MemorystoreClusterMetric
 *   } MemorystoreClusterMetric
 */

const metricsClient = new monitoring.MetricServiceClient();
const pubSub = new PubSub();
const memorystoreClusterClient = new CloudRedisClusterClient({
  libName: 'cloud-solutions',
  libVersion: `memorystore-cluster-autoscaler-poller-usage-v${packageVersion}`,
});
const configValidator = new ConfigValidator();

const baseDefaults = {
  scaleOutCoolingMinutes: 10,
  scaleInCoolingMinutes: 20,
  minFreeMemoryPercent: 30,
  scalingProfile: 'CPU_AND_MEMORY',
  scalingMethod: 'STEPWISE',
};

const shardDefaults = {
  units: AutoscalerUnits.SHARDS,
  minSize: 1,
  maxSize: 10,
  stepSize: 1,
};

/**
 * Get metadata for Memorystore cluster
 *
 * @param {string} projectId
 * @param {string} regionId
 * @param {string} clusterId
 * @param {AutoscalerUnits} units SHARDS
 * @return {Promise<MemorystoreClusterMetadata>}
 */
async function getMemorystoreClusterMetadata(
  projectId,
  regionId,
  clusterId,
  units,
) {
  logger.info({
    message: `----- ${projectId}/${regionId}/${clusterId}: Metadata -----`,
    projectId: projectId,
    regionId: regionId,
    clusterId: clusterId,
  });

  const request = {
    name: `projects/${projectId}/locations/${regionId}/clusters/${clusterId}`,
  };

  const [metadata] = await memorystoreClusterClient.getCluster(request);

  logger.debug({
    message: `shardCount:   ${metadata['shardCount']}`,
    projectId: projectId,
    regionID: regionId,
    clusterId: clusterId,
  });
  logger.debug({
    message: `sizeGb:       ${metadata['sizeGb']}`,
    projectId: projectId,
    regionID: regionId,
    clusterId: clusterId,
  });

  const clusterMetadata = {
    currentSize:
      units === AutoscalerUnits.SHARDS
        ? assertDefined(metadata['shardCount'])
        : assertDefined(metadata['sizeGb']),
    shardCount: assertDefined(metadata['shardCount']),
    sizeGb: assertDefined(metadata['sizeGb']),
  };

  return clusterMetadata;
}

/**
 * Post a message to PubSub with the Memorystore cluster and metrics.
 *
 * @param {AutoscalerMemorystoreCluster} cluster
 * @param {MemorystoreClusterMetricValue[]} metrics
 * @return {Promise<Void>}
 */
async function postPubSubMessage(cluster, metrics) {
  const topic = pubSub.topic(assertDefined(cluster.scalerPubSubTopic));

  cluster.metrics = metrics;
  const messageBuffer = Buffer.from(JSON.stringify(cluster), 'utf8');

  return topic
    .publishMessage({data: messageBuffer})
    .then(() =>
      logger.info({
        message: `----- Published message to topic: ${cluster.scalerPubSubTopic}`,
        projectId: cluster.projectId,
        regionId: cluster.regionId,
        clusterId: cluster.clusterId,
        payload: cluster,
      }),
    )
    .catch((err) => {
      logger.error({
        message: `An error occurred when publishing the message to \
          ${cluster.scalerPubSubTopic}: ${err}`,
        projectId: cluster.projectId,
        regionId: cluster.regionId,
        clusterId: cluster.clusterId,
        err: err,
      });
    });
}

/**
 * Creates the base filter that should be prepended to all metric filters
 * @param {string} projectId
 * @param {string} regionId
 * @param {string} clusterId
 * @return {string} filter
 */
function createBaseFilter(projectId, regionId, clusterId) {
  return (
    'resource.type="redis.googleapis.com/Cluster" AND ' +
    'project="' +
    projectId +
    '" AND ' +
    'resource.labels.location="' +
    regionId +
    '" AND ' +
    'resource.labels.cluster_id="' +
    clusterId +
    '" AND '
  );
}

/**
 * Build the list of metrics to request
 *
 * @param {string} projectId
 * @param {string} regionId
 * @param {string} clusterId
 * @return {MemorystoreClusterMetric[]} metrics to request
 */
function buildMetrics(projectId, regionId, clusterId) {
  const metrics = [
    {
      name: 'cpu_maximum_utilization',
      filter:
        createBaseFilter(projectId, regionId, clusterId) +
        'metric.type="redis.googleapis.com/cluster/cpu/maximum_utilization" ' +
        'AND metric.labels.role="primary"', // Only present for CPU metrics
      reducer: 'REDUCE_MEAN',
      aligner: 'ALIGN_MAX',
      period: 60,
    },
    {
      name: 'cpu_average_utilization',
      filter:
        createBaseFilter(projectId, regionId, clusterId) +
        'metric.type="redis.googleapis.com/cluster/cpu/average_utilization" ' +
        'AND metric.labels.role="primary"', // Only present for CPU metrics
      reducer: 'REDUCE_MEAN',
      aligner: 'ALIGN_MAX',
      period: 60,
    },
    {
      name: 'memory_maximum_utilization',
      filter:
        createBaseFilter(projectId, regionId, clusterId) +
        'metric.type="redis.googleapis.com/cluster/memory/maximum_utilization"',
      reducer: 'REDUCE_MEAN',
      aligner: 'ALIGN_MAX',
      period: 60,
    },
    {
      name: 'memory_average_utilization',
      filter:
        createBaseFilter(projectId, regionId, clusterId) +
        'metric.type="redis.googleapis.com/cluster/memory/average_utilization"',
      reducer: 'REDUCE_MEAN',
      aligner: 'ALIGN_MAX',
      period: 60,
    },
    {
      name: 'maximum_evicted_keys',
      filter:
        createBaseFilter(projectId, regionId, clusterId) +
        'metric.type="redis.googleapis.com/cluster/stats/maximum_evicted_keys"',
      reducer: 'REDUCE_MEAN',
      aligner: 'ALIGN_MAX',
      period: 60,
    },
    {
      name: 'average_evicted_keys',
      filter:
        createBaseFilter(projectId, regionId, clusterId) +
        'metric.type="redis.googleapis.com/cluster/stats/average_evicted_keys"',
      reducer: 'REDUCE_MEAN',
      aligner: 'ALIGN_MAX',
      period: 60,
    },
  ];
  return metrics;
}

/**
 * Get max value of metric over a window
 *
 * @param {string} projectId
 * @param {string} regionId
 * @param {string} clusterId
 * @param {MemorystoreClusterMetric} metric
 * @return {Promise<[number,string]>}
 */
function getMaxMetricValue(projectId, regionId, clusterId, metric) {
  const metricWindow = 5;
  logger.debug({
    message: `Get max ${metric.name} from ${projectId}/${regionId}/${clusterId} over ${metricWindow} minutes.`,
    projectId: projectId,
    regionId: regionId,
    clusterId: clusterId,
  });

  /** @type {monitoring.protos.google.monitoring.v3.IListTimeSeriesRequest} */
  const request = {
    name: 'projects/' + projectId,
    filter: metric.filter,
    interval: {
      startTime: {
        seconds: Date.now() / 1000 - metric.period * metricWindow,
      },
      endTime: {
        seconds: Date.now() / 1000,
      },
    },
    aggregation: {
      alignmentPeriod: {
        seconds: metric.period,
      },
      // @ts-ignore
      crossSeriesReducer: metric.reducer,
      // @ts-ignore
      perSeriesAligner: metric.aligner,
      groupByFields: ['resource.location'],
    },
    view: 'FULL',
  };

  return metricsClient.listTimeSeries(request).then((metricResponses) => {
    const resources = metricResponses[0];
    let maxValue = 0.0;
    let maxLocation = 'global';

    for (const resource of resources) {
      for (const point of resource.points || []) {
        const value = assertDefined(point.value?.doubleValue) * 100;
        if (value > maxValue) {
          maxValue = value;
          if (resource.resource?.labels?.location) {
            maxLocation = resource.resource.labels.location;
          }
        }
      }
    }

    return [maxValue, maxLocation];
  });
}

/**
 * Retrive the metrics for a cluster instance
 *
 * @param {AutoscalerMemorystoreCluster} cluster
 * @return {Promise<MemorystoreClusterMetricValue[]>} metric values
 */
async function getMetrics(cluster) {
  logger.info({
    message: `----- ${cluster.projectId}/${cluster.regionId}/${cluster.clusterId}: Getting Metrics -----`,
    projectId: cluster.projectId,
    regionId: cluster.regionId,
    clusterId: cluster.clusterId,
  });

  /** @type {MemorystoreClusterMetricValue[]} */
  const metrics = [];
  for (const m of cluster.metrics) {
    const metric = /** @type {MemorystoreClusterMetric} */ (m);
    const [maxMetricValue, maxLocation] = await getMaxMetricValue(
      cluster.projectId,
      cluster.regionId,
      cluster.clusterId,
      metric,
    );

    logger.debug({
      message: `  ${metric.name} = ${maxMetricValue}, period = ${metric.period}, location = ${maxLocation}`,
      projectId: cluster.projectId,
      regionId: cluster.regionId,
      clusterId: cluster.clusterId,
    });

    /** @type {MemorystoreClusterMetricValue} */
    const metricsObject = {
      name: metric.name,
      value: maxMetricValue,
    };
    metrics.push(metricsObject);
  }
  return metrics;
}

/**
 * Enrich the paylod by adding information from the config.
 *
 * @param {string} payload
 * @return {Promise<AutoscalerMemorystoreCluster[]>} enriched payload
 */
async function parseAndEnrichPayload(payload) {
  /** @type {AutoscalerMemorystoreCluster[]} */
  const clusters = await configValidator.parseAndAssertValidConfig(payload);
  const clustersFound = [];

  for (let idx = 0; idx < clusters.length; idx++) {
    // Merge in the defaults
    clusters[idx] = {...baseDefaults, ...clusters[idx]};

    if (clusters[idx].minSize < CLUSTER_SIZE_MIN) {
      throw new Error(
        `INVALID CONFIG: minSize (${clusters[idx].minSize}) is below the ` +
          `minimum cluster size of ${CLUSTER_SIZE_MIN}.`,
      );
    }

    if (clusters[idx].minSize > clusters[idx].maxSize) {
      throw new Error(
        `INVALID CONFIG: minSize (${clusters[idx].minSize}) is larger than ` +
          `maxSize (${clusters[idx].maxSize}).`,
      );
    }

    if (clusters[idx].units === undefined) {
      clusters[idx].units = AutoscalerUnits.SHARDS;
      logger.debug({
        message: `  Defaulted units to ${clusters[idx].units}`,
        projectId: clusters[idx].projectId,
        regionId: clusters[idx].regionId,
        clusterId: clusters[idx].clusterId,
      });
    }

    if (clusters[idx].units.toUpperCase() == AutoscalerUnits.SHARDS) {
      clusters[idx].units = clusters[idx].units.toUpperCase();
      clusters[idx] = {...shardDefaults, ...clusters[idx]};
    } else {
      throw new Error(
        `INVALID CONFIG: ${clusters[idx].units} is invalid. Valid: ${AutoscalerUnits.SHARDS}`,
      );
    }

    // Assemble the metrics
    clusters[idx].metrics = buildMetrics(
      clusters[idx].projectId,
      clusters[idx].regionId,
      clusters[idx].clusterId,
    );

    try {
      clusters[idx] = {
        ...clusters[idx],
        ...(await getMemorystoreClusterMetadata(
          clusters[idx].projectId,
          clusters[idx].regionId,
          clusters[idx].clusterId,
          clusters[idx].units.toUpperCase(),
        )),
      };
      clustersFound.push(clusters[idx]);
    } catch (err) {
      logger.error({
        message: `Unable to retrieve metadata for ${clusters[idx].projectId}/${clusters[idx].regionId}/${clusters[idx].clusterId}: ${err}`,
        projectId: clusters[idx].projectId,
        regionId: clusters[idx].regionId,
        clusterId: clusters[idx].clusterId,
        err: err,
      });
    }
  }

  return clustersFound;
}

/**
 * Forwards the metrics
 * @param {function(
 *    AutoscalerMemorystoreCluster,
 *    MemorystoreClusterMetricValue[]): Promise<Void>} forwarderFunction
 * @param {AutoscalerMemorystoreCluster[]} clusters config objects
 * @return {Promise<Void>}
 */
async function forwardMetrics(forwarderFunction, clusters) {
  for (const cluster of clusters) {
    try {
      const metrics = await getMetrics(cluster);
      await forwarderFunction(cluster, metrics); // Handles exceptions
      await Counters.incPollingSuccessCounter(cluster);
    } catch (err) {
      logger.error({
        message: `Unable to retrieve metrics for ${cluster.projectId}/${cluster.regionId}/${cluster.clusterId}: ${err}`,
        projectId: cluster.projectId,
        regionId: cluster.regionId,
        clusterId: cluster.clusterId,
        err: err,
      });
      await Counters.incPollingFailedCounter(cluster);
    }
  }
}

/**
 * Aggregate metrics for a list of clusters
 *
 * @param {AutoscalerMemorystoreCluster[]} clusters
 * @return {Promise<AutoscalerMemorystoreCluster[]>} aggregatedMetrics
 */
async function aggregateMetrics(clusters) {
  const aggregatedMetrics = [];
  for (const cluster of clusters) {
    try {
      cluster.metrics = await getMetrics(cluster);
      aggregatedMetrics.push(cluster);
      await Counters.incPollingSuccessCounter(cluster);
    } catch (err) {
      logger.error({
        message: `Unable to retrieve metrics for ${cluster.projectId}/${cluster.regionId}/${cluster.clusterId}: ${err}`,
        projectId: cluster.projectId,
        instanceId: cluster.clusterId,
        cluster: cluster,
        err: err,
      });
      await Counters.incPollingFailedCounter(cluster);
    }
  }
  return aggregatedMetrics;
}

/**
 * Handle a PubSub message and check if scaling is required
 *
 * @param {{data: string}} pubSubEvent
 * @param {*} context
 */
async function checkMemorystoreClusterScaleMetricsPubSub(pubSubEvent, context) {
  try {
    const payload = Buffer.from(pubSubEvent.data, 'base64').toString();
    try {
      const clusters = await parseAndEnrichPayload(payload);
      logger.debug({
        message: 'Autoscaler poller started (PubSub).',
        payload: clusters,
      });
      await forwardMetrics(postPubSubMessage, clusters);
      await Counters.incRequestsSuccessCounter();
    } catch (err) {
      logger.error({
        message: `An error occurred in the Autoscaler poller function (PubSub): ${err}`,
        err: err,
        payload: payload,
      });
      await Counters.incRequestsFailedCounter();
    }
  } catch (err) {
    logger.error({
      message: `An error occurred in the Autoscaler poller function (PubSub): ${err}`,
      err: err,
      payload: pubSubEvent.data,
    });
    await Counters.incRequestsFailedCounter();
  } finally {
    await Counters.tryFlush();
  }
}

/**
 * For testing with: https://cloud.google.com/functions/docs/functions-framework
 * @param {express.Request} req
 * @param {express.Response} res
 */
async function checkMemorystoreClusterScaleMetricsHTTP(req, res) {
  const payload = JSON.stringify([
    /** @type {AutoscalerMemorystoreCluster} */ ({
      projectId: 'memorystore-cluster-scaler',
      regionId: 'us-central1',
      clusterId: 'autoscale-test',
      scalerPubSubTopic:
        'projects/memorystore-cluster-scaler/topics/test-scaling',
      minSize: 3,
      maxSize: 10,
      stateProjectId: 'state-project-id',
      units: AutoscalerUnits.SHARDS,
    }),
  ]);
  try {
    const clusters = await parseAndEnrichPayload(payload);
    await forwardMetrics(postPubSubMessage, clusters);
    res.status(200).end();
    await Counters.incRequestsSuccessCounter();
  } catch (err) {
    logger.error({
      err: err,
      payload: payload,
      message: `An error occurred in the Autoscaler poller function (HTTP): ${err}`,
    });
    res.status(500).contentType('text/plain').end('An exception occurred');
    await Counters.incRequestsFailedCounter();
  }
}

/**
 * Entrypoint for local config (unified Poller/Scaler)
 *
 * @param {string} payload
 * @return {Promise<AutoscalerMemorystoreCluster[]>}
 */
async function checkMemorystoreClusterScaleMetricsLocal(payload) {
  try {
    const spanners = await parseAndEnrichPayload(payload);
    logger.debug({
      message: 'Autoscaler Poller started (JSON/local).',
      payload: spanners,
    });
    const metrics = await aggregateMetrics(spanners);
    await Counters.incRequestsSuccessCounter();
    return metrics;
  } catch (err) {
    logger.error({
      message: `An error occurred in the Autoscaler Poller function (JSON/Local): ${err}`,
      payload: payload,
      err: err,
    });
    await Counters.incRequestsFailedCounter();
    return [];
  } finally {
    await Counters.tryFlush();
  }
}

module.exports = {
  checkMemorystoreClusterScaleMetricsHTTP,
  checkMemorystoreClusterScaleMetricsPubSub,
  checkMemorystoreClusterScaleMetricsLocal,
};
