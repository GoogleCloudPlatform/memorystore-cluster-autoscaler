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
const sinon = require('sinon');
// @ts-ignore
const referee = require('@sinonjs/referee');
// @ts-ignore
const assert = referee.assert;
const {createClusterParameters} = require('../test-utils.js');

const app = rewire('../../scaling-methods/direct.js');

/**
 * @typedef {import('../../../../autoscaler-common/types')
 *   .AutoscalerMemorystoreCluster} AutoscalerMemorystoreCluster
 */

afterEach(() => {
  // Restore the default sandbox here
  sinon.restore();
});

const calculateSize = app.__get__('calculateSize');
describe('#direct.calculateSize', () => {
  /** @type {sinon.SinonSpy} */
  let calculateScalingDecisionSpy;
  beforeEach(() => {
    const baseModule = app.__get__('baseModule');
    calculateScalingDecisionSpy = sinon.spy(
      baseModule,
      'calculateScalingDecision',
    );
  });

  it('should return max size', async () => {
    const cluster = createClusterParameters({
      currentSize: 5,
      maxSize: 10,
      minSize: 1,
      scalingMethod: 'DIRECT',
    });
    const size = await calculateSize(cluster);
    assert.equals(size, 10);
    assert.equals(calculateScalingDecisionSpy.callCount, 1);
  });

  it('should return min 1 when less than 1 is suggested', async () => {
    const cluster = createClusterParameters({
      currentSize: 1,
      maxSize: 0,
      minSize: 0,
      scalingMethod: 'DIRECT',
    });
    const size = await calculateSize(cluster);
    assert.equals(size, 1);
    assert.equals(calculateScalingDecisionSpy.callCount, 1);
  });
});
