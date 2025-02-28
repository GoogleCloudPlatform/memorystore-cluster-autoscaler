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
 * Autoscaler Scaler function
 *
 * * Receives metrics from the Autoscaler Poller pertaining to a single cluster
 * * Determines if the cluster can be autoscaled
 * * Selects a scaling method, and gets a number of suggested units
 * * Autoscales the Memorystore cluster by the number of suggested units
 */
// eslint-disable-next-line no-unused-vars -- for type checking only.
const express = require('express');
const {convertMillisecToHumanReadable} = require('./utils.js');
const {logger} = require('../../autoscaler-common/logger');
const Counters = require('./counters.js');
const {publishProtoMsgDownstream} = require('./utils.js');
const {
  CloudRedisClusterClient,
  protos: RedisClusterProtos,
} = require('@google-cloud/redis-cluster');
const {
  MemorystoreClient,
  protos: MemorystoreProtos,
} = require('@google-cloud/memorystore');
const sanitize = require('sanitize-filename');
const State = require('./state.js');
const fs = require('fs');
const {version: packageVersion} = require('../../../package.json');
const {AutoscalerEngine} = require('../../autoscaler-common/types');

/**
 * @typedef {import('../../autoscaler-common/types').AutoscalerMemorystoreCluster
 * } AutoscalerMemorystoreCluster
 * @typedef {import('../../autoscaler-common/types.js').RuleSet} RuleSet
 * @typedef {import('./state.js').StateData} StateData
 * @typedef {import('@google-cloud/memorystore').protos.google.longrunning.GetOperationRequest} GetOperationRequest{}
 * @typedef {import('@google-cloud/memorystore').protos.google.longrunning.Operation} Operation{}
 */

const userAgentMetadata = {
  libName: 'cloud-solutions',
  libVersion: `memorystore-cluster-autoscaler-scaler-usage-v${packageVersion}`,
};

const memorystoreRedisClient = new CloudRedisClusterClient(userAgentMetadata);
const memorystoreValkeyClient = new MemorystoreClient(userAgentMetadata);

/**
 * Get ruleSet by profile name.
 *
 * @param {AutoscalerMemorystoreCluster} cluster
 * @return {RuleSet}
 */
function getScalingRuleSet(cluster) {
  const SCALING_PROFILES_FOLDER = './scaling-profiles/profiles/';
  const DEFAULT_PROFILE_NAME = 'CPU_AND_MEMORY';
  const CUSTOM_PROFILE_NAME = 'CUSTOM';

  /*
   * Sanitize the profile name before using
   * to prevent risk of directory traversal.
   */
  const profileName = sanitize(cluster.scalingProfile);
  let /** @type {RuleSet} **/ scalingRuleSet;
  if (profileName === CUSTOM_PROFILE_NAME && cluster.scalingRules) {
    scalingRuleSet = cluster.scalingRules.reduce((acc, current) => {
      logger.info({
        message: `	Custom scaling rule: ${current.name}`,
        projectId: cluster.projectId,
        regionId: cluster.regionId,
        clusterId: cluster.clusterId,
      });
      // @ts-ignore
      acc[current.name] = current;
      return acc;
    }, {});
  } else {
    try {
      scalingRuleSet = require(
        SCALING_PROFILES_FOLDER + profileName.toLowerCase(),
      ).ruleSet;
    } catch (err) {
      logger.warn({
        message: `Unknown scaling profile '${profileName}'`,
        projectId: cluster.projectId,
        regionId: cluster.regionId,
        clusterId: cluster.clusterId,
      });
      scalingRuleSet = require(
        SCALING_PROFILES_FOLDER + DEFAULT_PROFILE_NAME.toLowerCase(),
      ).ruleSet;
      cluster.scalingProfile = DEFAULT_PROFILE_NAME;
    }
  }
  logger.info({
    message: `Using scaling profile: ${cluster.scalingProfile}`,
    projectId: cluster.projectId,
    regionId: cluster.regionId,
    clusterId: cluster.clusterId,
  });
  return scalingRuleSet;
}

/**
 * Get scaling method function by name.
 *
 * @param {AutoscalerMemorystoreCluster} cluster
 * @return {{
 *  calculateSize: function(AutoscalerMemorystoreCluster,RuleSet):Promise<number>,
 * }}
 */
function getScalingMethod(cluster) {
  const SCALING_METHODS_FOLDER = './scaling-methods/';
  const DEFAULT_METHOD_NAME = 'STEPWISE';

  // sanitize the method name before using
  // to prevent risk of directory traversal.
  const methodName = sanitize(cluster.scalingMethod);
  let scalingMethod;
  try {
    scalingMethod = require(SCALING_METHODS_FOLDER + methodName.toLowerCase());
  } catch (err) {
    logger.warn({
      message: `Unknown scaling method '${methodName}'`,
      projectId: cluster.projectId,
      regionId: cluster.regionId,
      clusterId: cluster.clusterId,
    });
    scalingMethod = require(
      SCALING_METHODS_FOLDER + DEFAULT_METHOD_NAME.toLowerCase(),
    );
    cluster.scalingMethod = DEFAULT_METHOD_NAME;
  }
  logger.info({
    message: `Using scaling method: ${cluster.scalingMethod}`,
    projectId: cluster.projectId,
    regionId: cluster.regionId,
    clusterId: cluster.clusterId,
  });
  return scalingMethod;
}

/**
 * Publish scaling PubSub event.
 *
 * @param {string} eventName
 * @param {AutoscalerMemorystoreCluster} cluster
 * @param {number} suggestedSize
 * @return {Promise<Void>}
 */
async function publishDownstreamEvent(eventName, cluster, suggestedSize) {
  const message = {
    projectId: cluster.projectId,
    regionId: cluster.regionId,
    clusterId: cluster.clusterId,
    currentSize: cluster.currentSize,
    suggestedSize: suggestedSize,
    units: cluster.units,
    metrics: cluster.metrics,
  };

  return publishProtoMsgDownstream(
    eventName,
    message,
    cluster.downstreamPubSubTopic,
  );
}

/**
 * Test to see if we are in post-scale cooldown.
 *
 * @param {AutoscalerMemorystoreCluster} cluster
 * @param {number} suggestedSize
 * @param {StateData} autoscalerState
 * @param {number} now timestamp in millis since epoch
 * @return {boolean}
 */
function withinCooldownPeriod(cluster, suggestedSize, autoscalerState, now) {
  const MS_IN_1_MIN = 60000;
  const scaleOutSuggested = suggestedSize - cluster.currentSize > 0;
  let cooldownPeriodOver;

  logger.debug({
    message: `-----  ${cluster.projectId}/${cluster.clusterId}: Verifying if scaling is allowed -----`,
    projectId: cluster.projectId,
    regionId: cluster.regionId,
    clusterId: cluster.clusterId,
  });

  const lastScalingMillisec = autoscalerState.lastScalingCompleteTimestamp
    ? autoscalerState.lastScalingCompleteTimestamp
    : autoscalerState.lastScalingTimestamp;

  const operation = scaleOutSuggested
    ? {
        description: 'scale out',
        lastScalingMillisec: lastScalingMillisec,
        coolingMillisec: cluster.scaleOutCoolingMinutes * MS_IN_1_MIN,
      }
    : {
        description: 'scale in',
        lastScalingMillisec: lastScalingMillisec,
        coolingMillisec: cluster.scaleInCoolingMinutes * MS_IN_1_MIN,
      };

  if (operation.lastScalingMillisec == 0) {
    cooldownPeriodOver = true;
    logger.debug({
      message: `\tNo previous scaling operation found for this cluster`,
      projectId: cluster.projectId,
      regionId: cluster.regionId,
      clusterId: cluster.clusterId,
    });
  } else {
    const elapsedMillisec = now - operation.lastScalingMillisec;
    cooldownPeriodOver = elapsedMillisec >= operation.coolingMillisec;
    logger.debug({
      message: `\tLast scaling operation was ${convertMillisecToHumanReadable(
        now - operation.lastScalingMillisec,
      )} ago.`,
      projectId: cluster.projectId,
      regionId: cluster.regionId,
      clusterId: cluster.clusterId,
    });
    logger.debug({
      message: `\tCooldown period for ${operation.description} is ${convertMillisecToHumanReadable(
        operation.coolingMillisec,
      )}.`,
      projectId: cluster.projectId,
      regionId: cluster.regionId,
      clusterId: cluster.clusterId,
    });
  }

  if (cooldownPeriodOver) {
    logger.info({
      message: `\t=> Autoscale allowed`,
      projectId: cluster.projectId,
      regionId: cluster.regionId,
      clusterId: cluster.clusterId,
    });
    return false;
  } else {
    logger.info({
      message: `\t=> Autoscale NOT allowed yet`,
      projectId: cluster.projectId,
      regionId: cluster.regionId,
      clusterId: cluster.clusterId,
    });
    return true;
  }
}

/**
 * Get Suggested size from config using scalingMethod
 * @param {AutoscalerMemorystoreCluster} cluster
 * @return {Promise<number>}
 */
async function getSuggestedSize(cluster) {
  const scalingRuleSet = getScalingRuleSet(cluster);
  const scalingMethod = getScalingMethod(cluster);

  if (scalingMethod.calculateSize) {
    const size = await scalingMethod.calculateSize(cluster, scalingRuleSet);
    return size;
  } else {
    throw new Error(
      `no calculateSize() in scaling method ${cluster.scalingMethod}`,
    );
  }
}

/**
 * Scale the specified cluster to the specified size
 *
 * The api returns an Operation object containing the LRO ID which is returned by this
 * function.
 *
 * @param {AutoscalerMemorystoreCluster} cluster
 * @param {number} suggestedSize
 * @return {Promise<?string>} operationID.
 */
async function scaleMemorystoreCluster(cluster, suggestedSize) {
  logger.info({
    message: `----- ${cluster.projectId}/${cluster.regionId}/${cluster.clusterId}: Scaling Memorystore cluster to ${suggestedSize} ${cluster.units} -----`,
    projectId: cluster.projectId,
    regionId: cluster.regionId,
    clusterId: cluster.clusterId,
    payload: cluster,
  });

  const updateMask = {
    paths: ['shard_count'],
  };

  const requestRedis = {
    cluster: {
      name: `projects/${cluster.projectId}/locations/${cluster.regionId}/clusters/${cluster.clusterId}`,
      shardCount: suggestedSize,
    },
    updateMask: updateMask,
  };

  const requestValkey = {
    instance: {
      name: `projects/${cluster.projectId}/locations/${cluster.regionId}/instances/${cluster.clusterId}`,
      shardCount: suggestedSize,
    },
    updateMask: updateMask,
  };

  const [operation] =
    cluster.engine === AutoscalerEngine.REDIS
      ? await memorystoreRedisClient.updateCluster(requestRedis)
      : await memorystoreValkeyClient.updateInstance(requestValkey);

  logger.debug({
    message: `Started the scaling operation: ${operation.name}`,
    projectId: cluster.projectId,
    regionId: cluster.regionId,
    clusterId: cluster.clusterId,
  });
  return operation?.name || null;
}

/**
 * Process the request to check a cluster for scaling
 *
 * @param {AutoscalerMemorystoreCluster} cluster
 * @param {State} autoscalerState
 */
async function processScalingRequest(cluster, autoscalerState) {
  logger.info({
    message: `----- ${cluster.projectId}/${cluster.regionId}/${cluster.clusterId}: Scaling request received`,
    projectId: cluster.projectId,
    regionId: cluster.regionId,
    clusterId: cluster.clusterId,
    payload: cluster,
  });

  // Check for ongoing LRO
  const savedState = await readStateCheckOngoingLRO(cluster, autoscalerState);
  const suggestedSize = await getSuggestedSize(cluster);

  if (!savedState.scalingOperationId) {
    // no ongoing LRO, lets see if scaling is required.
    if (
      suggestedSize === cluster.currentSize &&
      cluster.currentSize === cluster.maxSize
    ) {
      logger.info({
        message: `----- ${cluster.projectId}/${cluster.regionId}/${cluster.clusterId}: has ${cluster.currentSize} ${cluster.units}, no scaling possible - at maxSize`,
        projectId: cluster.projectId,
        regionId: cluster.regionId,
        clusterId: cluster.clusterId,
        payload: cluster,
      });
      await Counters.incScalingDeniedCounter(
        cluster,
        suggestedSize,
        'MAX_SIZE',
      );
      return;
    } else if (suggestedSize == cluster.currentSize) {
      logger.info({
        message: `----- ${cluster.projectId}/${cluster.regionId}/${cluster.clusterId}: has ${cluster.currentSize} ${cluster.units}, no scaling needed at the moment`,
        projectId: cluster.projectId,
        regionId: cluster.regionId,
        clusterId: cluster.clusterId,
        payload: cluster,
      });
      await Counters.incScalingDeniedCounter(
        cluster,
        suggestedSize,
        'CURRENT_SIZE',
      );
      return;
    }

    if (
      !withinCooldownPeriod(
        cluster,
        suggestedSize,
        savedState,
        autoscalerState.now,
      )
    ) {
      let eventType;
      try {
        const operationId = await scaleMemorystoreCluster(
          cluster,
          suggestedSize,
        );
        await autoscalerState.updateState({
          ...savedState,
          scalingOperationId: operationId,
          scalingRequestedSize: suggestedSize,
          lastScalingTimestamp: autoscalerState.now,
          lastScalingCompleteTimestamp: null,
          scalingPreviousSize: cluster.currentSize,
          scalingMethod: cluster.scalingMethod,
        });
        eventType = 'SCALING';
      } catch (err) {
        logger.error({
          message: `----- ${cluster.projectId}/${cluster.regionId}/${cluster.clusterId}: Unsuccessful scaling attempt: ${err}`,
          projectId: cluster.projectId,
          regionId: cluster.regionId,
          clusterId: cluster.clusterId,
          payload: cluster,
          err: err,
        });
        eventType = 'SCALING_FAILURE';
        await Counters.incScalingFailedCounter(cluster, suggestedSize);
      }
      await publishDownstreamEvent(eventType, cluster, suggestedSize);
    } else {
      logger.info({
        message: `----- ${cluster.projectId}/${cluster.regionId}/${cluster.clusterId}: has ${cluster.currentSize} ${cluster.units}, no scaling possible - within cooldown period`,
        projectId: cluster.projectId,
        regionId: cluster.regionId,
        clusterId: cluster.clusterId,
        payload: cluster,
      });
      await Counters.incScalingDeniedCounter(
        cluster,
        suggestedSize,
        'WITHIN_COOLDOWN',
      );
    }
  } else {
    logger.info({
      message:
        `----- ${cluster.projectId}/${cluster.regionId}/${cluster.clusterId}: has ${cluster.currentSize} ${cluster.units}, no scaling possible ` +
        `- last scaling operation (${savedState.scalingMethod} to ${savedState.scalingRequestedSize}) is still in progress. Started: ${convertMillisecToHumanReadable(
          autoscalerState.now - savedState.lastScalingTimestamp,
        )} ago.`,
      projectId: cluster.projectId,
      regionId: cluster.regionId,
      clusterId: cluster.clusterId,
      payload: cluster,
    });
    await Counters.incScalingDeniedCounter(
      cluster,
      suggestedSize,
      'IN_PROGRESS',
    );
  }
}

/**
 * Handle scale request from a PubSub event.
 *
 * @param {{data:string}} pubSubEvent -- a CloudEvent object.
 * @param {*} context
 */
async function scaleMemorystoreClusterPubSub(pubSubEvent, context) {
  try {
    const payload = Buffer.from(pubSubEvent.data, 'base64').toString();
    const cluster = JSON.parse(payload);
    try {
      const state = State.buildFor(cluster);
      await processScalingRequest(cluster, state);
      await state.close();
      await Counters.incRequestsSuccessCounter();
    } catch (err) {
      logger.error({
        message: `Failed to process scaling request: ${err}`,
        projectId: cluster.projectId,
        regionId: cluster.regionId,
        clusterId: cluster.clusterId,
        payload: cluster,
        err: err,
      });
      await Counters.incRequestsFailedCounter();
    }
  } catch (err) {
    logger.error({
      message: `Failed to parse pubSub scaling request: ${err}`,
      payload: pubSubEvent.data,
      err: err,
    });
    await Counters.incRequestsFailedCounter();
  } finally {
    await Counters.tryFlush();
  }
}

/**
 * Test to handle scale request from a HTTP call with fixed payload
 * For testing with: https://cloud.google.com/functions/docs/functions-framework
 * @param {express.Request} req
 * @param {express.Response} res
 */
async function scaleMemorystoreClusterHTTP(req, res) {
  try {
    const payload = fs.readFileSync(
      'src/scaler/scaler-core/test/samples/parameters.json',
      'utf-8',
    );
    const cluster = JSON.parse(payload);
    const state = State.buildFor(cluster);
    await processScalingRequest(cluster, state);
    await state.close();
    res.status(200).end();
    await Counters.incRequestsSuccessCounter();
  } catch (err) {
    logger.error({
      message: `Failed to parse http scaling request ${err}`,
      err: err,
    });
    res.status(500).contentType('text/plain').end('An exception occurred');
    await Counters.incRequestsFailedCounter();
  }
}

/**
 * Handle scale request from local function call
 *
 * Called by unified Poller/Scaler on GKE deployments
 *
 * @param {AutoscalerMemorystoreCluster} cluster
 */
async function scaleMemorystoreClusterLocal(cluster) {
  try {
    const state = State.buildFor(cluster);

    await processScalingRequest(cluster, state);
    await state.close();
    await Counters.incRequestsSuccessCounter();
  } catch (err) {
    logger.error({
      message: `Failed to process scaling request: ${err}`,
      projectId: cluster.projectId,
      regionId: cluster.regionId,
      clusterId: cluster.clusterId,
      payload: cluster,
      err: err,
    });
  } finally {
    await Counters.tryFlush();
  }
}

/**
 * @param {string} operationId
 * @param {AutoscalerEngine} engine
 * @return {Promise<[Operation]>}
 */
async function getOperationState(operationId, engine) {
  const headers = {
    otherArgs: {headers: {['x-goog-request-params']: `Name=${operationId}`}},
  };

  if (engine === AutoscalerEngine.REDIS) {
    return await memorystoreRedisClient.getOperation(
      RedisClusterProtos.google.longrunning.GetOperationRequest.fromObject({
        name: operationId,
      }),
      headers,
    );
  } else if (engine === AutoscalerEngine.VALKEY) {
    return await memorystoreValkeyClient.getOperation(
      MemorystoreProtos.google.longrunning.GetOperationRequest.fromObject({
        name: operationId,
      }),
      headers,
    );
  } else {
    throw new Error(`Unknown engine retriving LRO state: ${engine}`);
  }
}

/**
 * Read state and check status of any LRO...
 *
 * @param {AutoscalerMemorystoreCluster} cluster
 * @param {State} autoscalerState
 * @return {Promise<StateData>}
 */
async function readStateCheckOngoingLRO(cluster, autoscalerState) {
  const savedState = await autoscalerState.get();

  if (!savedState?.scalingOperationId) {
    // no LRO ongoing.
    return savedState;
  }

  try {
    const [operationState] = await getOperationState(
      savedState.scalingOperationId,
      cluster.engine,
    );

    if (!operationState) {
      throw new Error(
        `GetOperation(${savedState.scalingOperationId}) returned no results`,
      );
    }

    /** @type {RedisClusterProtos.google.cloud.redis.cluster.v1.OperationMetadata|MemorystoreProtos.google.cloud.memorystore.v1.OperationMetadata} */
    let metadata;
    try {
      if (
        operationState.metadata?.value == null ||
        (operationState.metadata?.type_url !==
          RedisClusterProtos.google.cloud.redis.cluster.v1.OperationMetadata.getTypeUrl() &&
          operationState.metadata?.type_url !==
            MemorystoreProtos.google.cloud.memorystore.v1.OperationMetadata.getTypeUrl())
      ) {
        throw new Error('no metadata in response');
      }
      if (cluster.engine === AutoscalerEngine.REDIS) {
        metadata =
          RedisClusterProtos.google.cloud.redis.cluster.v1.OperationMetadata.decode(
            /** @type {any} */ (operationState.metadata).value,
          );
      } else if (cluster.engine === AutoscalerEngine.VALKEY) {
        metadata =
          MemorystoreProtos.google.cloud.memorystore.v1.OperationMetadata.decode(
            /** @type {any} */ (operationState.metadata).value,
          );
      } else {
        throw new Error(
          `Unknown engine for operation metadata decode: ${cluster.engine}`,
        );
      }
    } catch (e) {
      throw new Error(
        `GetOperation(${savedState.scalingOperationId}) could not decode OperationMetadata: ${e}`,
      );
    }

    const createTimeMillis =
      metadata.createTime?.seconds == null || metadata.createTime.nanos == null
        ? 0
        : Number(metadata.createTime.seconds) * 1000 +
          Math.floor(metadata.createTime.nanos / 1_000_000);
    const createTimeStamp = new Date(createTimeMillis).toISOString();
    const endTimeMillis =
      metadata.endTime?.seconds == null || metadata.endTime.nanos == null
        ? 0
        : Number(metadata.endTime.seconds) * 1000 +
          Math.floor(metadata.endTime.nanos / 1_000_000);
    const endTimeStamp = new Date(endTimeMillis).toISOString();

    if (operationState.done) {
      if (!operationState.error) {
        // Completed successfully.
        logger.info({
          message: `----- ${cluster.projectId}/${cluster.regionId}/${cluster.clusterId}: Last scaling request for size ${savedState.scalingRequestedSize} SUCCEEDED. Started: ${createTimeStamp}, completed: ${endTimeStamp}`,
          projectId: cluster.projectId,
          regionId: cluster.regionId,
          clusterId: cluster.clusterId,
          payload: cluster,
        });

        // Set completion time in SavedState
        if (endTimeMillis) {
          savedState.lastScalingCompleteTimestamp = endTimeMillis;
        } else {
          // invalid end date, assume start date...
          logger.warn(
            `Failed to parse operation endTime : ${metadata.endTime}`,
          );
          savedState.lastScalingCompleteTimestamp =
            savedState.lastScalingTimestamp;
        }

        // Record success counters.
        await Counters.recordScalingDuration(
          savedState.lastScalingCompleteTimestamp -
            savedState.lastScalingTimestamp,
          cluster,
          savedState.scalingRequestedSize || 0,
          savedState.scalingPreviousSize,
          savedState.scalingMethod,
        );
        await Counters.incScalingSuccessCounter(
          cluster,
          savedState.scalingRequestedSize || 0,
          savedState.scalingPreviousSize,
          savedState.scalingMethod,
        );

        // Clear operation frm savedState
        savedState.scalingOperationId = null;
        savedState.scalingRequestedSize = null;
        savedState.scalingPreviousSize = null;
        savedState.scalingMethod = null;
      } else {
        // Last operation failed with an error
        logger.error({
          message: `----- ${cluster.projectId}/${cluster.regionId}/${cluster.clusterId}: Last scaling request for size ${savedState.scalingRequestedSize} FAILED: ${operationState.error?.message}. Started: ${createTimeStamp}, completed: ${endTimeStamp}`,
          projectId: cluster.projectId,
          regionId: cluster.regionId,
          clusterId: cluster.clusterId,
          error: operationState.error,
          payload: cluster,
        });

        await Counters.incScalingFailedCounter(
          cluster,
          savedState.scalingRequestedSize || 0,
          savedState.scalingPreviousSize,
          savedState.scalingMethod,
        );

        // Clear last scaling operation from savedState.
        savedState.scalingOperationId = null;
        savedState.scalingRequestedSize = null;
        savedState.lastScalingCompleteTimestamp = 0;
        savedState.lastScalingTimestamp = 0;
        savedState.scalingPreviousSize = null;
        savedState.scalingMethod = null;
      }
    } else {
      if (!!metadata.requestedCancellation) {
        logger.info({
          message: `----- ${cluster.projectId}/${cluster.regionId}/${cluster.clusterId}: Last scaling request for ${savedState.scalingRequestedSize} CANCEL REQUESTED. Started: ${createTimeStamp}`,
          projectId: cluster.projectId,
          regionId: cluster.regionId,
          clusterId: cluster.clusterId,
          payload: cluster,
        });
      } else {
        logger.info({
          message: `----- ${cluster.projectId}/${cluster.regionId}/${cluster.clusterId}: Last scaling request for ${savedState.scalingRequestedSize} IN PROGRESS. Started: ${createTimeStamp}`,
          projectId: cluster.projectId,
          regionId: cluster.regionId,
          clusterId: cluster.clusterId,
          payload: cluster,
        });
      }
    }
  } catch (err) {
    // Fallback - LRO.get() API failed or returned invalid status.
    // Assume complete.
    logger.error({
      message: `Failed to retrieve state of operation, assume completed. ID: ${savedState.scalingOperationId}: ${err}`,
      err: err,
    });
    savedState.lastScalingCompleteTimestamp = savedState.lastScalingTimestamp;
    savedState.scalingOperationId = null;
    // Record success counters.
    await Counters.recordScalingDuration(
      savedState.lastScalingCompleteTimestamp - savedState.lastScalingTimestamp,
      cluster,
      savedState.scalingRequestedSize || 0,
      savedState.scalingPreviousSize,
      savedState.scalingMethod,
    );
    await Counters.incScalingSuccessCounter(
      cluster,
      savedState.scalingRequestedSize || 0,
      savedState.scalingPreviousSize,
      savedState.scalingMethod,
    );
    savedState.scalingRequestedSize = null;
    savedState.scalingPreviousSize = null;
    savedState.scalingMethod = null;
  }
  // Update saved state in storage.
  await autoscalerState.updateState(savedState);
  return savedState;
}

module.exports = {
  scaleMemorystoreClusterHTTP,
  scaleMemorystoreClusterPubSub,
  scaleMemorystoreClusterLocal,
};
