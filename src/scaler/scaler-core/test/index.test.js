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

const rewire = require('rewire');
const sinon = require('sinon');
// @ts-ignore
const referee = require('@sinonjs/referee');
// @ts-ignore
const assert = referee.assert;
const {
  createClusterParameters,
  createStubState,
  createStateData,
} = require('./test-utils.js');
const {afterEach} = require('mocha');
const protobufjs = require('protobufjs');
const {AutoscalerEngine} = require('../../../autoscaler-common/types');
const {CloudRedisClusterClient} = require('@google-cloud/redis-cluster');
const {
  MemorystoreClient,
  protos: MemorystoreProtos,
} = require('@google-cloud/memorystore');

/**
 * @typedef {import('../../../autoscaler-common/types')
 *   .AutoscalerMemorystoreCluster} AutoscalerMemorystoreCluster
 * @typedef {import('../state.js').StateData} StateData
 * @typedef {import('../state.js')} State
 */

afterEach(() => {
  // Restore the default sandbox here
  sinon.reset();
  sinon.restore();
});

describe('#getScalingRuleSet', () => {
  const app = rewire('../index.js');
  const getScalingRuleSet = app.__get__('getScalingRuleSet');

  it('should return the ruleset for the profile name', async function () {
    const cluster = createClusterParameters();
    cluster.scalingProfile = 'CPU';
    const expectedScalingRuleSetCpu =
      require('../scaling-profiles/profiles/cpu.js').ruleSet;
    const scalingRuleSetCpu = getScalingRuleSet(cluster);
    assert.equals(scalingRuleSetCpu, expectedScalingRuleSetCpu);
    assert.equals(cluster.scalingProfile, 'CPU');
  });

  it('should default to the CPU_AND_MEMORY profile and ruleset', async function () {
    const cluster = createClusterParameters();
    cluster.scalingProfile = 'UNKNOWN_SCALING_PROFILE';
    const expectedScalingRuleSetCpuAndMemory =
      require('../scaling-profiles/profiles/cpu_and_memory.js').ruleSet;
    const scalingRuleSetCpuAndMemory = getScalingRuleSet(cluster);
    assert.equals(
      scalingRuleSetCpuAndMemory,
      expectedScalingRuleSetCpuAndMemory,
    );
    assert.equals(cluster.scalingProfile, 'CPU_AND_MEMORY');
  });

  it('should use a custom ruleset when provided', async function () {
    const cluster = createClusterParameters();
    cluster.scalingProfile = 'CUSTOM';
    const expectedScalingRuleSetCustom =
      require('./samples/custom-scaling-rules.json').scalingRules;
    cluster.scalingRules = expectedScalingRuleSetCustom;
    const scalingRuleSetCustom = getScalingRuleSet(cluster);
    expectedScalingRuleSetCustom.forEach((rule) => {
      assert.equals(rule, scalingRuleSetCustom[rule.name]);
    });
    assert.equals(cluster.scalingProfile, 'CUSTOM');
  });
});

describe('#getScalingMethod', () => {
  const app = rewire('../index.js');
  const getScalingMethod = app.__get__('getScalingMethod');

  it('should return the configured scaling method function', async function () {
    const cluster = createClusterParameters();
    cluster.scalingMethod = 'LINEAR';
    const scalingFunction = getScalingMethod(cluster);
    assert.isFunction(scalingFunction.calculateSize);
    assert.equals(cluster.scalingMethod, 'LINEAR');
  });

  it('should default to STEPWISE scaling', async function () {
    const cluster = createClusterParameters();
    cluster.scalingMethod = 'UNKNOWN_SCALING_METHOD';
    const scalingFunction = getScalingMethod(cluster);
    assert.isFunction(scalingFunction.calculateSize);
    assert.equals(cluster.scalingMethod, 'STEPWISE');
  });
});

describe('#scaleMemorystoreCluster', () => {
  const app = rewire('../index.js');
  const scaleMemorystoreCluster = app.__get__('scaleMemorystoreCluster');
  /** @type {sinon.SinonStubbedInstance<CloudRedisClusterClient>} */
  let memorystoreRedisClientStub;
  /** @type {sinon.SinonStubbedInstance<MemorystoreClient>} */
  let memorystoreValkeyClientStub;

  const cluster = {
    projectId: 'test-project',
    regionId: 'test-region',
    clusterId: 'test-cluster',
    currentSize: 5,
    units: 'SHARDS',
    engine: AutoscalerEngine.REDIS, // Default to REDIS
  };

  const suggestedSize = 10;
  const expectedOperation = {name: 'test-operation'};

  beforeEach(() => {
    memorystoreRedisClientStub = sinon.createStubInstance(
      CloudRedisClusterClient,
    );
    memorystoreValkeyClientStub = sinon.createStubInstance(MemorystoreClient);
    app.__set__('memorystoreValkeyClient', memorystoreValkeyClientStub);
    app.__set__('memorystoreRedisClient', memorystoreRedisClientStub);
  });

  afterEach(() => {
    sinon.reset();
    sinon.restore();
  });

  it('should call updateCluster for Redis engine', async () => {
    cluster.engine = AutoscalerEngine.REDIS;
    memorystoreRedisClientStub.updateCluster.resolves([expectedOperation]);
    const operationId = await scaleMemorystoreCluster(cluster, suggestedSize);

    sinon.assert.calledWith(memorystoreRedisClientStub.updateCluster, {
      cluster: {
        name: `projects/${cluster.projectId}/locations/${cluster.regionId}/clusters/${cluster.clusterId}`,
        shardCount: suggestedSize,
      },
      updateMask: {paths: ['shard_count']},
    });
    sinon.assert.notCalled(memorystoreValkeyClientStub.updateInstance);
    assert.equals(operationId, expectedOperation.name);
  });

  it('should call updateInstance for Valkey engine', async () => {
    cluster.engine = AutoscalerEngine.VALKEY;
    memorystoreValkeyClientStub.updateInstance.resolves([expectedOperation]);
    const operationId = await scaleMemorystoreCluster(cluster, suggestedSize);

    sinon.assert.calledWith(memorystoreValkeyClientStub.updateInstance, {
      instance: {
        name: `projects/${cluster.projectId}/locations/${cluster.regionId}/instances/${cluster.clusterId}`,
        shardCount: suggestedSize,
      },
      updateMask: {paths: ['shard_count']},
    });
    sinon.assert.notCalled(memorystoreRedisClientStub.updateCluster);
    assert.equals(operationId, expectedOperation.name);
  });

  it('should return null if operation name is undefined/null', async () => {
    cluster.engine = AutoscalerEngine.REDIS;
    const expectedOperation = {}; // Name is undefined
    memorystoreRedisClientStub.updateCluster.resolves([expectedOperation]);
    const operationId = await scaleMemorystoreCluster(cluster, suggestedSize);

    assert.isNull(operationId);
  });
});

describe('#processScalingRequest', () => {
  const app = rewire('../index.js');
  const processScalingRequest = app.__get__('processScalingRequest');

  const countersStub = {
    incScalingSuccessCounter: sinon.stub(),
    incScalingFailedCounter: sinon.stub(),
    incScalingDeniedCounter: sinon.stub(),
    recordScalingDuration: sinon.stub(),
  };
  const getSuggestedSizeStub = sinon.stub();
  const withinCooldownPeriod = sinon.stub();
  const stubScaleMemorystoreCluster = sinon.stub();
  const readStateCheckOngoingLRO = sinon.stub();

  beforeEach(() => {
    // Setup common stubs
    stubScaleMemorystoreCluster.resolves();
    app.__set__('scaleMemorystoreCluster', stubScaleMemorystoreCluster);
    app.__set__('Counters', countersStub);
    app.__set__('withinCooldownPeriod', withinCooldownPeriod.returns(false));
    app.__set__('getSuggestedSize', getSuggestedSizeStub);
    app.__set__('readStateCheckOngoingLRO', readStateCheckOngoingLRO);

    readStateCheckOngoingLRO.returns(createStateData());
  });

  afterEach(() => {
    // reset stubs
    Object.values(countersStub).forEach((stub) => stub.reset());
    stubScaleMemorystoreCluster.reset();
    getSuggestedSizeStub.reset();
    withinCooldownPeriod.reset();
  });

  it('should not autoscale if suggested size is equal to current size', async function () {
    const cluster = createClusterParameters();
    getSuggestedSizeStub.returns(cluster.currentSize);

    await processScalingRequest(cluster, createStubState());

    assert.equals(stubScaleMemorystoreCluster.callCount, 0);
    sinon.assert.calledOnceWithExactly(
      countersStub.incScalingDeniedCounter,
      sinon.match.any,
      cluster.currentSize,
      'CURRENT_SIZE',
    );
  });

  it('should not autoscale if suggested size is equal to max size', async function () {
    const cluster = createClusterParameters();
    cluster.currentSize = cluster.maxSize;
    getSuggestedSizeStub.returns(cluster.maxSize);

    await processScalingRequest(cluster, createStubState());

    assert.equals(stubScaleMemorystoreCluster.callCount, 0);
    sinon.assert.calledOnceWithExactly(
      countersStub.incScalingDeniedCounter,
      sinon.match.any,
      cluster.maxSize,
      'MAX_SIZE',
    );
  });

  it('should autoscale if suggested size is not equal to current size', async function () {
    const cluster = createClusterParameters();
    const suggestedSize = cluster.currentSize + 1;

    getSuggestedSizeStub.returns(suggestedSize);
    stubScaleMemorystoreCluster.returns('scalingOperationId');
    const stateStub = createStubState();

    await processScalingRequest(cluster, stateStub);
    assert.equals(stubScaleMemorystoreCluster.callCount, 1);
    assert.equals(
      stubScaleMemorystoreCluster.getCall(0).args[1],
      suggestedSize,
    );
    sinon.assert.calledWith(stateStub.updateState, {
      lastScalingTimestamp: stateStub.now,
      createdOn: 0,
      updatedOn: 0,
      lastScalingCompleteTimestamp: null,
      scalingOperationId: 'scalingOperationId',
      scalingRequestedSize: suggestedSize,
      scalingMethod: cluster.scalingMethod,
      scalingPreviousSize: cluster.currentSize,
    });

    assert.equals(stubScaleMemorystoreCluster.callCount, 1);
  });
  it('should not autoscale if in cooldown period', async function () {
    const cluster = createClusterParameters();
    const suggestedSize = cluster.currentSize + 1;
    getSuggestedSizeStub.returns(suggestedSize);
    withinCooldownPeriod.returns(true);

    await processScalingRequest(cluster, createStubState());

    assert.equals(stubScaleMemorystoreCluster.callCount, 0);
    sinon.assert.calledOnceWithExactly(
      countersStub.incScalingDeniedCounter,
      sinon.match.any,
      cluster.currentSize + 1,
      'WITHIN_COOLDOWN',
    );
  });

  it('should not autoscale if scalingOperationId is set', async () => {
    // set operation ongoing...
    const stubState = createStubState();
    readStateCheckOngoingLRO.returns({
      lastScalingTimestamp: stubState.now,
      createdOn: 0,
      updatedOn: 0,
      lastScalingCompleteTimestamp: 0,
      scalingOperationId: 'DummyOpID',
      scalingRequestedSize: 10,
    });

    const cluster = createClusterParameters();
    const suggestedSize = cluster.currentSize + 1;
    getSuggestedSizeStub.returns(suggestedSize);

    await processScalingRequest(cluster, stubState);

    assert.equals(stubScaleMemorystoreCluster.callCount, 0);
    sinon.assert.calledOnceWithExactly(
      countersStub.incScalingDeniedCounter,
      sinon.match.any,
      suggestedSize,
      'IN_PROGRESS',
    );
  });
});

describe('#withinCooldownPeriod', () => {
  const app = rewire('../index.js');
  const withinCooldownPeriod = app.__get__('withinCooldownPeriod');

  /** @type {StateData} */
  let autoscalerState;
  /** @type {AutoscalerMemorystoreCluster} */
  let clusterParams;

  const lastScalingTime = Date.parse('2024-01-01T12:00:00Z');
  const MILLIS_PER_MINUTE = 60_000;

  beforeEach(() => {
    clusterParams = createClusterParameters();

    autoscalerState = {
      lastScalingCompleteTimestamp: lastScalingTime,
      scalingOperationId: null,
      scalingRequestedSize: null,
      lastScalingTimestamp: lastScalingTime,
      scalingMethod: null,
      scalingPreviousSize: null,
      createdOn: 0,
      updatedOn: 0,
    };
  });

  it('should be false when no scaling has ever happened', () => {
    autoscalerState.lastScalingCompleteTimestamp = 0;
    autoscalerState.lastScalingTimestamp = 0;

    assert.isFalse(
      withinCooldownPeriod(
        clusterParams,
        clusterParams.currentSize + 100,
        autoscalerState,
        lastScalingTime,
      ),
    );
  });

  it('should be false when scaling up later than cooldown', () => {
    // test at 1 min after end of cooldown...
    const testTime =
      lastScalingTime +
      (clusterParams.scaleOutCoolingMinutes + 1) * MILLIS_PER_MINUTE;

    assert.isFalse(
      withinCooldownPeriod(
        clusterParams,
        clusterParams.currentSize + 100,
        autoscalerState,
        testTime,
      ),
    );
  });

  it('should be false when scaling down later than cooldown', () => {
    // test at 1 min before end of cooldown...
    const testTime =
      lastScalingTime +
      (clusterParams.scaleInCoolingMinutes + 1) * MILLIS_PER_MINUTE;

    assert.isFalse(
      withinCooldownPeriod(
        clusterParams,
        clusterParams.currentSize - 100,
        autoscalerState,
        testTime,
      ),
    );
  });

  it('should be true when scaling up within scaleOutCoolingMinutes', () => {
    // test at 1 min before end of cooldown...
    const testTime =
      lastScalingTime +
      (clusterParams.scaleOutCoolingMinutes - 1) * MILLIS_PER_MINUTE;

    assert.isTrue(
      withinCooldownPeriod(
        clusterParams,
        clusterParams.currentSize + 100,
        autoscalerState,
        testTime,
      ),
    );
  });

  it('should be true when scaling down within scaleInCoolingMinutes', () => {
    // test at 1 min before end of cooldown...
    const testTime =
      lastScalingTime +
      (clusterParams.scaleInCoolingMinutes - 1) * MILLIS_PER_MINUTE;

    assert.isTrue(
      withinCooldownPeriod(
        clusterParams,
        clusterParams.currentSize - 100,
        autoscalerState,
        testTime,
      ),
    );
  });

  it('should use lastScalingCompleteTimestamp when specified', () => {
    autoscalerState.lastScalingTimestamp = 0;

    assert.isTrue(
      withinCooldownPeriod(
        clusterParams,
        clusterParams.currentSize - 100,
        autoscalerState,
        lastScalingTime,
      ),
    );
  });

  it('should use lastScalingTimestamp if complete not specified', () => {
    autoscalerState.lastScalingCompleteTimestamp = 0;

    assert.isTrue(
      withinCooldownPeriod(
        clusterParams,
        clusterParams.currentSize - 100,
        autoscalerState,
        lastScalingTime,
      ),
    );
  });
});

describe('#getOperationState', () => {
  const app = rewire('../index.js');
  const getOperationState = app.__get__('getOperationState');
  /** @type {sinon.SinonStubbedInstance<CloudRedisClusterClient>} */
  let memorystoreRedisClientStub;
  /** @type {sinon.SinonStubbedInstance<MemorystoreClient>} */
  let memorystoreValkeyClientStub;
  const operationId = 'test-operation-id';
  const expectedHeaders = {
    otherArgs: {
      headers: {['x-goog-request-params']: `Name=${operationId}`},
    },
  };

  beforeEach(() => {
    memorystoreValkeyClientStub = sinon.createStubInstance(MemorystoreClient);
    memorystoreRedisClientStub = sinon.createStubInstance(
      CloudRedisClusterClient,
    );

    app.__set__('memorystoreValkeyClient', memorystoreValkeyClientStub);
    app.__set__('memorystoreRedisClient', memorystoreRedisClientStub);
  });

  afterEach(() => {
    sinon.reset();
    sinon.restore();
  });

  it('should call Redis client for Redis engine', async () => {
    await getOperationState(operationId, AutoscalerEngine.REDIS);

    sinon.assert.calledOnceWithExactly(
      memorystoreRedisClientStub.getOperation,
      sinon.match.any,
      expectedHeaders,
    );
    sinon.assert.notCalled(memorystoreValkeyClientStub.getOperation);
  });

  it('should call Valkey client for Valkey engine', async () => {
    await getOperationState(operationId, AutoscalerEngine.VALKEY);

    sinon.assert.calledOnceWithExactly(
      memorystoreValkeyClientStub.getOperation,
      sinon.match.any,
      expectedHeaders,
    );
    sinon.assert.notCalled(memorystoreRedisClientStub.getOperation);
  });

  it('should throw error for unknown engine', async () => {
    const engine = 'unknown-engine';

    try {
      await getOperationState(operationId, engine);
      assert.fail('Expected an unknown engine error to be thrown');
    } catch (err) {
      assert.equals(
        /** @type {Error}*/ (err).message,
        `Unknown engine retriving LRO state: ${engine}`,
      );
    }
    sinon.assert.notCalled(memorystoreRedisClientStub.getOperation);
    sinon.assert.notCalled(memorystoreValkeyClientStub.getOperation);
  });
});

describe('#readStateCheckOngoingLRO', () => {
  const app = rewire('../index.js');
  const readStateCheckOngoingLRO = app.__get__('readStateCheckOngoingLRO');

  /** @type {StateData} */
  let autoscalerState;
  /** @type {StateData} */
  let originalAutoscalerState;
  /** @type {AutoscalerMemorystoreCluster} */
  let clusterParams;
  /** @type {sinon.SinonStubbedInstance<State>} */
  let stateStub;

  const getOperation = sinon.stub();
  const memorystoreClientStub = {getOperation};
  const countersStub = {
    incScalingSuccessCounter: sinon.stub(),
    incScalingFailedCounter: sinon.stub(),
    incScalingDeniedCounter: sinon.stub(),
    recordScalingDuration: sinon.stub(),
  };

  const lastScalingDate = new Date('2024-01-01T12:00:00Z');

  /**
   *
   * @param {boolean?} done
   * @param {MemorystoreProtos.google.rpc.IStatus?} error
   * @param {number?} createTimeMillis
   * @param {number?} endTimeMillis
   * @return {MemorystoreProtos.google.longrunning.Operation}
   */
  function buildGetOperationResponse(
    done,
    error,
    createTimeMillis,
    endTimeMillis,
  ) {
    const metadataBuffer = protobufjs.Writer.create();
    MemorystoreProtos.google.cloud.memorystore.v1.OperationMetadata.encode(
      {
        endTime:
          endTimeMillis == null
            ? null
            : {
                seconds: endTimeMillis / 1000,
                nanos: (endTimeMillis % 1000) * 1_000_000,
              },
        createTime:
          createTimeMillis == null
            ? null
            : {
                seconds: createTimeMillis / 1000,
                nanos: (createTimeMillis % 1000) * 1_000_000,
              },
      },
      metadataBuffer,
    );
    const metadataBufferBytes = metadataBuffer.finish();

    return new MemorystoreProtos.google.longrunning.Operation({
      done,
      error,
      metadata: {
        type_url:
          MemorystoreProtos.google.cloud.memorystore.v1.OperationMetadata.getTypeUrl(),
        value: metadataBufferBytes,
      },
    });
  }

  beforeEach(() => {
    clusterParams = createClusterParameters();
    stateStub = createStubState();
    app.__set__('Counters', countersStub);
    app.__set__('memorystoreRedisClient', memorystoreClientStub);
    app.__set__('memorystoreValkeyClient', memorystoreClientStub);

    // A State with an ongoing operation
    autoscalerState = {
      lastScalingCompleteTimestamp: 0,
      scalingOperationId: 'OperationId',
      lastScalingTimestamp: lastScalingDate.getTime(),
      scalingRequestedSize: 10,
      createdOn: 0,
      updatedOn: 0,
      scalingPreviousSize: 5,
      scalingMethod: 'STEPWISE',
    };
    originalAutoscalerState = {...autoscalerState};
  });

  afterEach(() => {
    getOperation.reset();
    Object.values(countersStub).forEach((stub) => stub.reset());
  });

  it('should no-op when no LRO ID in state', async () => {
    autoscalerState.scalingOperationId = null;
    autoscalerState.scalingRequestedSize = null;
    autoscalerState.scalingPreviousSize = null;
    autoscalerState.scalingMethod = null;

    stateStub.get.resolves(autoscalerState);
    const expectedState = {
      ...originalAutoscalerState,
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingPreviousSize: null,
      scalingMethod: null,
    };
    assert.equals(
      await readStateCheckOngoingLRO(clusterParams, stateStub),
      expectedState,
    );
    sinon.assert.notCalled(getOperation);
    sinon.assert.notCalled(stateStub.updateState);
    sinon.assert.notCalled(countersStub.incScalingSuccessCounter);
    sinon.assert.notCalled(countersStub.incScalingFailedCounter);
    sinon.assert.notCalled(countersStub.recordScalingDuration);
  });

  it('should clear the operation if operation.get fails', async () => {
    stateStub.get.resolves(autoscalerState);
    getOperation.rejects(new Error('operation.get() error'));

    const expectedState = {
      ...originalAutoscalerState,
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingPreviousSize: null,
      scalingMethod: null,
      lastScalingCompleteTimestamp:
        originalAutoscalerState.lastScalingTimestamp,
    };
    assert.equals(
      await readStateCheckOngoingLRO(clusterParams, stateStub),
      expectedState,
    );

    sinon.assert.calledOnce(getOperation);
    sinon.assert.calledWith(stateStub.updateState, expectedState);
    sinon.assert.calledOnce(countersStub.incScalingSuccessCounter);
    sinon.assert.notCalled(countersStub.incScalingFailedCounter);
    sinon.assert.calledOnce(countersStub.recordScalingDuration);
  });

  it('should clear the operation if operation.get returns null', async () => {
    stateStub.get.resolves(autoscalerState);
    getOperation.resolves([null]);

    const expectedState = {
      ...originalAutoscalerState,
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingPreviousSize: null,
      scalingMethod: null,
      lastScalingCompleteTimestamp:
        originalAutoscalerState.lastScalingTimestamp,
    };
    assert.equals(
      await readStateCheckOngoingLRO(clusterParams, stateStub),
      expectedState,
    );

    sinon.assert.calledOnce(getOperation);
    sinon.assert.calledWith(stateStub.updateState, expectedState);
    sinon.assert.calledOnce(countersStub.incScalingSuccessCounter);
    sinon.assert.notCalled(countersStub.incScalingFailedCounter);
    sinon.assert.calledOnce(countersStub.recordScalingDuration);
  });

  it('should clear lastScaling, requestedSize if op failed with error', async () => {
    stateStub.get.resolves(autoscalerState);
    const operation = buildGetOperationResponse(
      true,
      {code: 500, message: 'Scaling operation failed'},
      lastScalingDate.getTime(),
      lastScalingDate.getTime() + 60_000,
    );
    getOperation.resolves([operation]);

    const expectedState = {
      ...originalAutoscalerState,
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingPreviousSize: null,
      scalingMethod: null,
      lastScalingCompleteTimestamp: 0,
      lastScalingTimestamp: 0,
    };
    assert.equals(
      await readStateCheckOngoingLRO(clusterParams, stateStub),
      expectedState,
    );

    sinon.assert.calledOnce(getOperation);
    sinon.assert.calledWith(stateStub.updateState, expectedState);
    sinon.assert.notCalled(countersStub.incScalingSuccessCounter);
    sinon.assert.calledOnce(countersStub.incScalingFailedCounter);
    sinon.assert.notCalled(countersStub.recordScalingDuration);
  });

  it('should clear the operation if no metadata', async () => {
    stateStub.get.resolves(autoscalerState);
    const operation = buildGetOperationResponse(true, null, null, null);
    getOperation.resolves([operation]);

    const expectedState = {
      ...originalAutoscalerState,
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingPreviousSize: null,
      scalingMethod: null,
      lastScalingCompleteTimestamp: lastScalingDate.getTime(),
    };
    assert.equals(
      await readStateCheckOngoingLRO(clusterParams, stateStub),
      expectedState,
    );

    sinon.assert.calledOnce(getOperation);
    sinon.assert.calledWith(stateStub.updateState, expectedState);
    sinon.assert.calledOnce(countersStub.incScalingSuccessCounter);
    sinon.assert.notCalled(countersStub.incScalingFailedCounter);
    sinon.assert.calledOnce(countersStub.recordScalingDuration);
  });

  it('should leave state unchanged if operation not done yet', async () => {
    stateStub.get.resolves(autoscalerState);
    const operation = buildGetOperationResponse(
      false,
      null,
      lastScalingDate.getTime(),
      null,
    );
    getOperation.resolves([operation]);

    assert.equals(
      await readStateCheckOngoingLRO(clusterParams, stateStub),
      originalAutoscalerState,
    );

    sinon.assert.calledOnce(getOperation);
    sinon.assert.calledWith(stateStub.updateState, originalAutoscalerState);
    sinon.assert.notCalled(countersStub.incScalingSuccessCounter);
    sinon.assert.notCalled(countersStub.incScalingFailedCounter);
    sinon.assert.notCalled(countersStub.recordScalingDuration);
  });

  it('should update timestamp and clear ID when completed', async () => {
    // Ensure that savedState scaling params are different from cluster params.
    stateStub.get.resolves({
      ...autoscalerState,
      scalingRequestedSize: 20,
      scalingPreviousSize: 10,
      scalingMethod: 'DIRECT',
    });
    // 60 seconds after start
    const operation = buildGetOperationResponse(
      true,
      null,
      lastScalingDate.getTime(),
      lastScalingDate.getTime() + 60_000,
    );

    getOperation.resolves([operation]);

    const expectedState = {
      ...originalAutoscalerState,
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingPreviousSize: null,
      scalingMethod: null,
      lastScalingCompleteTimestamp: lastScalingDate.getTime() + 60_000,
    };
    assert.equals(
      await readStateCheckOngoingLRO(clusterParams, stateStub),
      expectedState,
    );

    sinon.assert.calledOnce(getOperation);
    sinon.assert.calledWith(stateStub.updateState, expectedState);
    sinon.assert.calledOnceWithExactly(
      countersStub.incScalingSuccessCounter,
      sinon.match.any, // cluster
      20, // requested
      10, // original
      'DIRECT', // method
    );
    sinon.assert.notCalled(countersStub.incScalingFailedCounter);
    sinon.assert.calledOnceWithExactly(
      countersStub.recordScalingDuration,
      60_000,
      sinon.match.any, // cluster
      20, // requestedSize
      10, // originalSize
      'DIRECT', // method
    );
  });
});
