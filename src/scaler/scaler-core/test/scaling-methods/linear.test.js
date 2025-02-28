/* Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License
 */

const assert = require('assert');
const linear = require('../../scaling-methods/linear.js');

/**
 * @typedef {import('../../../../autoscaler-common/types')
 *     .AutoscalerMemorystoreCluster} AutoscalerMemorystoreCluster
 * @typedef {import('../../scaling-profiles/profiles/cpu_and_memory')
 *     .RuleSet} RuleSet
 */

/**
 * Creates a cluster representation.
 * @param {*} overrideParameters
 * @return {AutoscalerMemorystoreCluster} Cluster representation.
 */
const createClusterParameters = (overrideParameters) => {
  return {
    'projectId': 'project1',
    'regionId': 'region1',
    'clusterId': 'cluster1',
    'units': 'SHARDS',
    'minSize': 3,
    'maxSize': 100,
    'stepSize': 1,
    'scalingProfile': 'CPU_AND_MEMORY',
    'scalingMethod': 'LINEAR',
    'minFreeMemoryPercent': 0,
    'scaleOutCoolingMinutes': 5,
    'scaleInCoolingMinutes': 30,
    'metrics': [
      {
        'name': 'cpu_maximum_utilization',
        'value': 0,
      },
      {
        'name': 'cpu_average_utilization',
        'value': 0,
      },
      {
        'name': 'memory_maximum_utilization',
        'value': 0,
      },
      {
        'name': 'memory_average_utilization',
        'value': 0,
      },
      {
        'name': 'maximum_evicted_keys',
        'value': 0,
      },
      {
        'name': 'average_evicted_keys',
        'value': 0,
      },
    ],
    'currentSize': 5,
    ...overrideParameters,
  };
};

describe('#linear', () => {
  describe('calculateSize', () => {
    [
      ['above scaling metric by 200%', 50, 100, 10, 20],
      ['above scaling metric by 150%', 50, 75, 10, 15],
      // Scale OUT type won't scale in.
      ['below scaling metric by 70%', 50, 35, 10, 10],
      ['below scaling metric by 50%', 50, 25, 10, 10],
    ].forEach(
      ([
        testName,
        thresholdMetric,
        actualMetric,
        currentSize,
        expectedSize,
      ]) => {
        it(`scales OUT proportionally when ${testName}`, async () => {
          const cluster = createClusterParameters({
            currentSize: currentSize,
            metrics: [
              {
                'name': 'cpu_maximum_utilization',
                'value': actualMetric,
              },
              {
                // Not relevant for the test, but required by base.
                'name': 'memory_maximum_utilization',
                'value': 50,
              },
            ],
          });
          const /** @type {!RuleSet} */ ruleSet = {
              cpuHighMaximumUtilization: {
                name: 'cpuHighMaximumUtilization',
                conditions: {
                  all: [
                    {
                      fact: 'cpu_maximum_utilization',
                      operator: 'greaterThan',
                      value: thresholdMetric,
                    },
                  ],
                },
                event: {
                  type: 'OUT',
                  params: {
                    message: 'sample scaling out',
                    scalingMetrics: ['cpu_maximum_utilization'],
                  },
                },
              },
            };

          const suggestedSize = await linear.calculateSize(cluster, ruleSet);

          assert.equal(suggestedSize, expectedSize);
        });
      },
    );

    [
      ['below scaling metric by 70%', 50, 35, 10, 7],
      ['below scaling metric by 50%', 50, 25, 10, 5],
      // Scale IN type won't scale out.
      ['above scaling metric by 200%', 50, 100, 10, 10],
      ['above scaling metric by 150%', 50, 75, 10, 10],
    ].forEach(
      ([
        testName,
        thresholdMetric,
        actualMetric,
        currentSize,
        expectedSize,
      ]) => {
        it(`scales IN proportionally when ${testName}`, async () => {
          const cluster = createClusterParameters({
            currentSize: currentSize,
            metrics: [
              {
                'name': 'cpu_maximum_utilization',
                'value': actualMetric,
              },
              {
                // Not relevant for the test, but required by base.
                'name': 'memory_maximum_utilization',
                'value': 50,
              },
            ],
          });
          const /** @type {!RuleSet} */ ruleSet = {
              cpuHighMaximumUtilization: {
                name: 'cpuHighMaximumUtilization',
                conditions: {
                  all: [
                    {
                      fact: 'cpu_maximum_utilization',
                      operator: 'lessThan',
                      value: thresholdMetric,
                    },
                  ],
                },
                event: {
                  type: 'IN',
                  params: {
                    message: 'sample scaling out',
                    scalingMetrics: ['cpu_maximum_utilization'],
                  },
                },
              },
            };

          const suggestedSize = await linear.calculateSize(cluster, ruleSet);

          assert.equal(suggestedSize, expectedSize);
        });
      },
    );

    it(`scales OUT, but only up to maxSize`, async () => {
      const cluster = createClusterParameters({
        currentSize: 10,
        maxSize: 15,
        metrics: [
          {
            'name': 'cpu_maximum_utilization',
            'value': 100,
          },
          {
            // Not relevant for the test, but required by base.
            'name': 'memory_maximum_utilization',
            'value': 50,
          },
        ],
      });
      const /** @type {!RuleSet} */ ruleSet = {
          cpuHighMaximumUtilization: {
            name: 'cpuHighMaximumUtilization',
            conditions: {
              all: [
                {
                  fact: 'cpu_maximum_utilization',
                  operator: 'greaterThan',
                  value: 50,
                },
              ],
            },
            event: {
              type: 'OUT',
              params: {
                message: 'sample scaling out',
                scalingMetrics: ['cpu_maximum_utilization'],
              },
            },
          },
        };

      const suggestedSize = await linear.calculateSize(cluster, ruleSet);

      // It should scale to 20, but it's capped at 15, so it scales to 15.
      assert.equal(suggestedSize, 15);
    });

    it(`scales IN, but only up to minSize`, async () => {
      const cluster = createClusterParameters({
        currentSize: 10,
        minSize: 7,
        metrics: [
          {
            'name': 'cpu_maximum_utilization',
            'value': 25,
          },
          {
            // Not relevant for the test, but required by base.
            'name': 'memory_maximum_utilization',
            'value': 50,
          },
        ],
      });
      const /** @type {!RuleSet} */ ruleSet = {
          cpuHighMaximumUtilization: {
            name: 'cpuHighMaximumUtilization',
            conditions: {
              all: [
                {
                  fact: 'cpu_maximum_utilization',
                  operator: 'lessThan',
                  value: 50,
                },
              ],
            },
            event: {
              type: 'IN',
              params: {
                message: 'sample scaling in',
                scalingMetrics: ['cpu_maximum_utilization'],
              },
            },
          },
        };

      const suggestedSize = await linear.calculateSize(cluster, ruleSet);

      // It should scale to 5, but it's capped at 7, so it scales to 7.
      assert.equal(suggestedSize, 7);
    });

    it(`scales IN directly to minSize when metric is 0`, async () => {
      const cluster = createClusterParameters({
        currentSize: 100,
        minSize: 5,
        metrics: [
          {
            'name': 'cpu_maximum_utilization',
            'value': 0,
          },
          {
            // Not relevant for the test, but required by base.
            'name': 'memory_maximum_utilization',
            'value': 0,
          },
        ],
      });
      const /** @type {!RuleSet} */ ruleSet = {
          cpuHighMaximumUtilization: {
            name: 'cpuHighMaximumUtilization',
            conditions: {
              all: [
                {
                  fact: 'cpu_maximum_utilization',
                  operator: 'lessThan',
                  value: 50,
                },
              ],
            },
            event: {
              type: 'IN',
              params: {
                message: 'sample scaling in',
                scalingMetrics: ['cpu_maximum_utilization'],
              },
            },
          },
        };

      const suggestedSize = await linear.calculateSize(cluster, ruleSet);

      assert.equal(suggestedSize, 5);
    });

    it('scales OUT, respecting scaleOutLimit', async () => {
      const cluster = createClusterParameters({
        currentSize: 10,
        scaleOutLimit: 2,
        metrics: [
          {
            'name': 'cpu_maximum_utilization',
            'value': 100,
          },
          {
            // Not relevant for the test, but required by base.
            'name': 'memory_maximum_utilization',
            'value': 50,
          },
        ],
      });
      const /** @type {!RuleSet} */ ruleSet = {
          cpuHighMaximumUtilization: {
            name: 'cpuHighMaximumUtilization',
            conditions: {
              all: [
                {
                  fact: 'cpu_maximum_utilization',
                  operator: 'greaterThan',
                  value: 50,
                },
              ],
            },
            event: {
              type: 'OUT',
              params: {
                message: 'sample scaling out',
                scalingMetrics: ['cpu_maximum_utilization'],
              },
            },
          },
        };

      const suggestedSize = await linear.calculateSize(cluster, ruleSet);

      // It should scale to 20, but it's capped at +2 by scaleOutLimit, so it
      // scales to 12.
      assert.equal(suggestedSize, 12);
    });

    it(`scales IN, respecting scaleInLimit`, async () => {
      const cluster = createClusterParameters({
        currentSize: 10,
        scaleInLimit: 1,
        metrics: [
          {
            'name': 'cpu_maximum_utilization',
            'value': 25,
          },
          {
            // Not relevant for the test, but required by base.
            'name': 'memory_maximum_utilization',
            'value': 50,
          },
        ],
      });
      const /** @type {!RuleSet} */ ruleSet = {
          cpuHighMaximumUtilization: {
            name: 'cpuHighMaximumUtilization',
            conditions: {
              all: [
                {
                  fact: 'cpu_maximum_utilization',
                  operator: 'lessThan',
                  value: 50,
                },
              ],
            },
            event: {
              type: 'IN',
              params: {
                message: 'sample scaling in',
                scalingMetrics: ['cpu_maximum_utilization'],
              },
            },
          },
        };

      const suggestedSize = await linear.calculateSize(cluster, ruleSet);

      // It should scale to 5, but it's capped at -1 by scaleInLimit, so it
      // scales to 9.
      assert.equal(suggestedSize, 9);
    });

    it('scaleOutLimit=0 allows scaling out to the suggested size', async () => {
      const cluster = createClusterParameters({
        currentSize: 10,
        scaleOutLimit: 0,
        metrics: [
          {
            'name': 'cpu_maximum_utilization',
            'value': 100,
          },
          {
            // Not relevant for the test, but required by base.
            'name': 'memory_maximum_utilization',
            'value': 50,
          },
        ],
      });
      const /** @type {!RuleSet} */ ruleSet = {
          cpuHighMaximumUtilization: {
            name: 'cpuHighMaximumUtilization',
            conditions: {
              all: [
                {
                  fact: 'cpu_maximum_utilization',
                  operator: 'greaterThan',
                  value: 50,
                },
              ],
            },
            event: {
              type: 'OUT',
              params: {
                message: 'sample scaling out',
                scalingMetrics: ['cpu_maximum_utilization'],
              },
            },
          },
        };

      const suggestedSize = await linear.calculateSize(cluster, ruleSet);

      // scaleOutLimit=0 does not prevent scaling out to suggestedSize.
      assert.equal(suggestedSize, 20);
    });

    it(`scaleInLimit=0 allows scaling in to the suggested size`, async () => {
      const cluster = createClusterParameters({
        currentSize: 10,
        scaleInLimit: 0,
        metrics: [
          {
            'name': 'cpu_maximum_utilization',
            'value': 25,
          },
          {
            // Not relevant for the test, but required by base.
            'name': 'memory_maximum_utilization',
            'value': 50,
          },
        ],
      });
      const /** @type {!RuleSet} */ ruleSet = {
          cpuHighMaximumUtilization: {
            name: 'cpuHighMaximumUtilization',
            conditions: {
              all: [
                {
                  fact: 'cpu_maximum_utilization',
                  operator: 'lessThan',
                  value: 50,
                },
              ],
            },
            event: {
              type: 'IN',
              params: {
                message: 'sample scaling in',
                scalingMetrics: ['cpu_maximum_utilization'],
              },
            },
          },
        };

      const suggestedSize = await linear.calculateSize(cluster, ruleSet);

      // scaleInLimit=0 does not prevent scaling in to suggestedSize.
      assert.equal(suggestedSize, 5);
    });

    it('scales OUT to the largest size when multiple scale OUT metrics', async () => {
      const cluster = createClusterParameters({
        currentSize: 10,
        metrics: [
          {
            'name': 'cpu_maximum_utilization',
            'value': 100,
          },
          {
            'name': 'memory_maximum_utilization',
            'value': 75,
          },
        ],
      });
      const /** @type {!RuleSet} */ ruleSet = {
          cpuHighMaximumUtilization: {
            name: 'cpuHighMaximumUtilization',
            conditions: {
              all: [
                {
                  fact: 'cpu_maximum_utilization',
                  operator: 'greaterThan',
                  value: 50,
                },
                {
                  fact: 'memory_maximum_utilization',
                  operator: 'greaterThan',
                  value: 50,
                },
              ],
            },
            event: {
              type: 'OUT',
              params: {
                message: 'sample scaling out with multiple metrics',
                scalingMetrics: [
                  'cpu_maximum_utilization',
                  'memory_maximum_utilization',
                ],
              },
            },
          },
        };

      const suggestedSize = await linear.calculateSize(cluster, ruleSet);

      // It should scale to 15 for memory_maximum_utilization, but it should
      // scale to 20 for cpu_maximum_utilization. The largest is used.
      assert.equal(suggestedSize, 20);
    });

    it('scales IN but to the largest size when multiple scale IN metrics', async () => {
      const cluster = createClusterParameters({
        currentSize: 10,
        metrics: [
          {
            'name': 'cpu_maximum_utilization',
            'value': 70,
          },
          {
            'name': 'memory_maximum_utilization',
            'value': 50,
          },
        ],
      });
      const /** @type {!RuleSet} */ ruleSet = {
          cpuHighMaximumUtilization: {
            name: 'cpuHighMaximumUtilization',
            conditions: {
              all: [
                {
                  fact: 'cpu_maximum_utilization',
                  operator: 'lessThan',
                  value: 100,
                },
                {
                  fact: 'memory_maximum_utilization',
                  operator: 'lessThan',
                  value: 100,
                },
              ],
            },
            event: {
              type: 'IN',
              params: {
                message: 'sample scaling in with multiple metrics',
                scalingMetrics: [
                  'cpu_maximum_utilization',
                  'memory_maximum_utilization',
                ],
              },
            },
          },
        };

      const suggestedSize = await linear.calculateSize(cluster, ruleSet);

      // It should scale to 5 for memory_maximum_utilization, but it should
      // scale to 7 for cpu_maximum_utilization. The largest is used.
      assert.equal(suggestedSize, 7);
    });

    it('scales OUT to the largest size when multiple scale OUT rules matched', async () => {
      const cluster = createClusterParameters({
        currentSize: 10,
        metrics: [
          {
            'name': 'cpu_maximum_utilization',
            'value': 100,
          },
          {
            'name': 'memory_maximum_utilization',
            'value': 75,
          },
        ],
      });
      const /** @type {!RuleSet} */ ruleSet = {
          cpuHighMaximumUtilization: {
            name: 'cpuHighMaximumUtilization',
            conditions: {
              all: [
                {
                  fact: 'cpu_maximum_utilization',
                  operator: 'greaterThan',
                  value: 50,
                },
              ],
            },
            event: {
              type: 'OUT',
              params: {
                message: 'scaling out, rule 1',
                scalingMetrics: ['cpu_maximum_utilization'],
              },
            },
          },
          memoryMaxUtilization: {
            name: 'memoryMaxUtilization',
            conditions: {
              all: [
                {
                  fact: 'memory_maximum_utilization',
                  operator: 'greaterThan',
                  value: 50,
                },
              ],
            },
            event: {
              type: 'OUT',
              params: {
                message: 'scale out, rule 2',
                scalingMetrics: ['memory_maximum_utilization'],
              },
            },
          },
        };

      const suggestedSize = await linear.calculateSize(cluster, ruleSet);

      // It should scale to 15 for memoryMaxUtilization rule, but it should
      // scale to 20 for cpuHighMaximumUtilization rule. The largest is used.
      assert.equal(suggestedSize, 20);
    });

    it('scales IN to the largest size when multiple scale IN rules are matched', async () => {
      const cluster = createClusterParameters({
        currentSize: 100,
        metrics: [
          {
            'name': 'cpu_maximum_utilization',
            'value': 25,
          },
          {
            'name': 'memory_maximum_utilization',
            'value': 50,
          },
        ],
      });
      const /** @type {!RuleSet} */ ruleSet = {
          cpuHighMaximumUtilization: {
            name: 'cpuHighMaximumUtilization',
            conditions: {
              all: [
                {
                  fact: 'cpu_maximum_utilization',
                  operator: 'lessThan',
                  value: 100,
                },
              ],
            },
            event: {
              type: 'IN',
              params: {
                message: 'scaling in, rule 1',
                scalingMetrics: ['cpu_maximum_utilization'],
              },
            },
          },
          memoryMaxUtilization: {
            name: 'memoryMaxUtilization',
            conditions: {
              all: [
                {
                  fact: 'memory_maximum_utilization',
                  operator: 'lessThan',
                  value: 100,
                },
              ],
            },
            event: {
              type: 'IN',
              params: {
                message: 'scale in, rule 2',
                scalingMetrics: ['memory_maximum_utilization'],
              },
            },
          },
        };

      const suggestedSize = await linear.calculateSize(cluster, ruleSet);

      // It should scale to 25 for cpuHighMaximumUtilization rule, but it
      // should scale to 50 for memoryMaxUtilization rule. The largest is
      // used.
      assert.equal(suggestedSize, 50);
    });

    it('scales OUT when both IN and OUT rules are matched', async () => {
      const cluster = createClusterParameters({
        currentSize: 10,
        metrics: [
          {
            'name': 'cpu_maximum_utilization',
            'value': 100,
          },
          {
            'name': 'memory_maximum_utilization',
            'value': 5,
          },
        ],
      });
      const /** @type {!RuleSet} */ ruleSet = {
          cpuHighMaximumUtilization: {
            name: 'cpuHighMaximumUtilization',
            conditions: {
              all: [
                {
                  fact: 'cpu_maximum_utilization',
                  operator: 'greaterThan',
                  value: 50,
                },
              ],
            },
            event: {
              type: 'OUT',
              params: {
                message: 'scaling out rule',
                scalingMetrics: ['cpu_maximum_utilization'],
              },
            },
          },
          memoryMaxUtilization: {
            name: 'memoryMaxUtilization',
            conditions: {
              all: [
                {
                  fact: 'memory_maximum_utilization',
                  operator: 'lessThan',
                  value: 50,
                },
              ],
            },
            event: {
              type: 'IN',
              params: {
                message: 'scale in rule',
                scalingMetrics: ['memory_maximum_utilization'],
              },
            },
          },
        };

      const suggestedSize = await linear.calculateSize(cluster, ruleSet);

      // It should scale IN for memoryMaxUtilization rule, but it should
      // scale OUT for cpuHighMaximumUtilization rule. Scale OUT is
      // prioritized.
      assert.equal(suggestedSize, 20);
    });

    it('uses largest cluster size when scaling OUT metric is used multiple times', async () => {
      const cluster = createClusterParameters({
        currentSize: 10,
        metrics: [
          {
            'name': 'cpu_maximum_utilization',
            'value': 100,
          },
          {
            'name': 'memory_maximum_utilization',
            'value': 5,
          },
        ],
      });
      const /** @type {!RuleSet} */ ruleSet = {
          cpuHighMaximumUtilization: {
            name: 'cpuHighMaximumUtilization',
            conditions: {
              all: [
                {
                  fact: 'cpu_maximum_utilization',
                  operator: 'greaterThan',
                  value: 20,
                },
                {
                  fact: 'cpu_maximum_utilization',
                  operator: 'greaterThan',
                  value: 50,
                },
              ],
            },
            event: {
              type: 'OUT',
              params: {
                message: 'scaling out rule',
                scalingMetrics: ['cpu_maximum_utilization'],
              },
            },
          },
          cpuMaximumUtilization: {
            name: 'cpuMaximumUtilization',
            conditions: {
              all: [
                {
                  fact: 'cpu_maximum_utilization',
                  operator: 'greaterThan',
                  value: 10,
                },
              ],
            },
            event: {
              type: 'OUT',
              params: {
                message: 'another scaling out rule',
                scalingMetrics: ['cpu_maximum_utilization'],
              },
            },
          },
        };

      const suggestedSize = await linear.calculateSize(cluster, ruleSet);

      // There are 3 threhsolds for cpu_maximum_utilization: 10, 20 and 50.
      // This would result in 100, 50 and 20 suggested sizes respectively.
      // Therefore it scales to 100, the largest.
      assert.equal(suggestedSize, 100);
    });

    it('uses largest cluster size when scaling IN metric is used multiple times', async () => {
      const cluster = createClusterParameters({
        currentSize: 100,
        metrics: [
          {
            'name': 'cpu_maximum_utilization',
            'value': 20,
          },
          {
            'name': 'memory_maximum_utilization',
            'value': 50,
          },
        ],
      });
      const /** @type {!RuleSet} */ ruleSet = {
          cpuHighMaximumUtilization: {
            name: 'cpuHighMaximumUtilization',
            conditions: {
              all: [
                {
                  fact: 'cpu_maximum_utilization',
                  operator: 'lessThan',
                  value: 80,
                },
                {
                  fact: 'cpu_maximum_utilization',
                  operator: 'lessThan',
                  value: 50,
                },
              ],
            },
            event: {
              type: 'IN',
              params: {
                message: 'scaling out rule',
                scalingMetrics: ['cpu_maximum_utilization'],
              },
            },
          },
          cpuMaximumUtilization: {
            name: 'cpuMaximumUtilization',
            conditions: {
              all: [
                {
                  fact: 'cpu_maximum_utilization',
                  operator: 'lessThan',
                  value: 40,
                },
              ],
            },
            event: {
              type: 'IN',
              params: {
                message: 'another scaling in rule',
                scalingMetrics: ['cpu_maximum_utilization'],
              },
            },
          },
        };

      const suggestedSize = await linear.calculateSize(cluster, ruleSet);

      // There are 3 threhsolds for cpu_maximum_utilization: 80, 50 and 40.
      // This would result in 25, 40 and 50 suggested sizes respectively.
      // Therefore, it scales to 50, the largest.
      assert.equal(suggestedSize, 50);
    });

    [
      {
        testName: 'scaling IN rule',
        direction: 'IN',
        operator: 'lessThan',
        threshold: 50,
        actualMetric: 100,
      },
      {
        testName: 'scaling OUT rule',
        direction: 'OUT',
        operator: 'greaterThan',
        threshold: 50,
        actualMetric: 25,
      },
    ].forEach(({testName, direction, operator, threshold, actualMetric}) => {
      it(`returns current size when no rules are triggered by ${testName}`, async () => {
        const cluster = createClusterParameters({
          currentSize: 10,
          metrics: [
            {
              'name': 'cpu_maximum_utilization',
              'value': actualMetric,
            },
            {
              // Not relevant for the test, but required by base.
              'name': 'memory_maximum_utilization',
              'value': 50,
            },
          ],
        });
        const /** @type {!RuleSet} */ ruleSet = {
            cpuHighMaximumUtilization: {
              name: 'cpuHighMaximumUtilization',
              conditions: {
                all: [
                  {
                    fact: 'cpu_maximum_utilization',
                    operator: operator,
                    value: threshold,
                  },
                ],
              },
              event: {
                type: direction,
                params: {
                  message: 'sample rule',
                  scalingMetrics: ['cpu_maximum_utilization'],
                },
              },
            },
          };

        const suggestedSize = await linear.calculateSize(cluster, ruleSet);

        assert.equal(suggestedSize, 10);
      });
    });

    [
      {
        testName: 'scaling IN rule',
        direction: 'IN',
        operator: 'lessThan',
        threshold: 100,
        actualMetric: 50,
      },
      {
        testName: 'scaling OUT rule',
        direction: 'OUT',
        operator: 'greaterThan',
        threshold: 50,
        actualMetric: 100,
      },
    ].forEach(({testName, direction, operator, threshold, actualMetric}) => {
      it(`returns current size when scaling metric doesn't exist on ${testName}`, async () => {
        const cluster = createClusterParameters({
          currentSize: 10,
          metrics: [
            {
              'name': 'cpu_maximum_utilization',
              'value': actualMetric,
            },
            {
              // Not relevant for the test, but required by base.
              'name': 'memory_maximum_utilization',
              'value': 50,
            },
          ],
        });
        const /** @type {!RuleSet} */ ruleSet = {
            cpuHighMaximumUtilization: {
              name: 'cpuHighMaximumUtilization',
              conditions: {
                all: [
                  {
                    fact: 'cpu_maximum_utilization',
                    operator: operator,
                    value: threshold,
                  },
                ],
              },
              event: {
                type: direction,
                params: {
                  message: 'sample rule',
                  scalingMetrics: ['non_existing_metric'],
                },
              },
            },
          };

        const suggestedSize = await linear.calculateSize(cluster, ruleSet);

        assert.equal(suggestedSize, 10);
      });
    });

    [
      {
        testName: 'scaling IN rule',
        direction: 'IN',
        operator: 'lessThan',
        threshold: 100,
        actualMetric: 50,
      },
      {
        testName: 'scaling OUT rule',
        direction: 'OUT',
        operator: 'greaterThan',
        threshold: 50,
        actualMetric: 100,
      },
    ].forEach(({testName, direction, operator, threshold, actualMetric}) => {
      it(
        'returns current size when scaling metric does not have value on ' +
          testName,
        async () => {
          const cluster = createClusterParameters({
            currentSize: 10,
            metrics: [
              {
                'name': 'cpu_maximum_utilization',
                'value': actualMetric,
              },
              {
                'name': 'metric_used_for_scaling',
                // Indicating a lack of value without triggering type alerts.
                'value': undefined,
              },
              {
                // Not relevant for the test, but required by base.
                'name': 'memory_maximum_utilization',
                'value': 50,
              },
            ],
          });
          const /** @type {!RuleSet} */ ruleSet = {
              cpuHighMaximumUtilization: {
                name: 'cpuHighMaximumUtilization',
                conditions: {
                  all: [
                    {
                      fact: 'cpu_maximum_utilization',
                      operator: operator,
                      value: threshold,
                    },
                  ],
                },
                event: {
                  type: direction,
                  params: {
                    message: 'sample rule',
                    scalingMetrics: ['metric_used_for_scaling'],
                  },
                },
              },
            };

          const suggestedSize = await linear.calculateSize(cluster, ruleSet);

          assert.equal(suggestedSize, 10);
        },
      );
    });

    [
      {
        testName: 'scaling IN rule',
        direction: 'IN',
        operator: 'lessThan',
        threshold: 100,
        actualMetric: 50,
      },
      {
        testName: 'scaling OUT rule',
        direction: 'OUT',
        operator: 'greaterThan',
        threshold: 50,
        actualMetric: 100,
      },
    ].forEach(({testName, direction, operator, threshold, actualMetric}) => {
      it(`ignores the rule when there is no scaling metrics on ${testName}`, async () => {
        const cluster = createClusterParameters({
          currentSize: 10,
          metrics: [
            {
              'name': 'cpu_maximum_utilization',
              'value': actualMetric,
            },
            {
              // Not relevant for the test, but required by base.
              'name': 'memory_maximum_utilization',
              'value': 50,
            },
          ],
        });
        const /** @type {!RuleSet} */ ruleSet = {
            cpuHighMaximumUtilization: {
              name: 'cpuHighMaximumUtilization',
              conditions: {
                all: [
                  {
                    fact: 'cpu_maximum_utilization',
                    operator: operator,
                    value: threshold,
                  },
                ],
              },
              event: {
                type: direction,
                params: {
                  message: 'sample rule',
                  scalingMetrics: [],
                },
              },
            },
          };

        const suggestedSize = await linear.calculateSize(cluster, ruleSet);

        assert.equal(suggestedSize, 10);
      });
    });

    it(`ignores the rule when threshold is 0`, async () => {
      const cluster = createClusterParameters({
        currentSize: 10,
        metrics: [
          {
            'name': 'cpu_maximum_utilization',
            'value': 100,
          },
          {
            // Not relevant for the test, but required by base.
            'name': 'memory_maximum_utilization',
            'value': 50,
          },
        ],
      });
      const /** @type {!RuleSet} */ ruleSet = {
          cpuHighMaximumUtilization: {
            name: 'cpuHighMaximumUtilization',
            conditions: {
              all: [
                {
                  fact: 'cpu_maximum_utilization',
                  operator: 'greaterThan',
                  value: 0,
                },
              ],
            },
            event: {
              type: 'OUT',
              params: {
                message: 'sample scaling out',
                scalingMetrics: ['cpu_maximum_utilization'],
              },
            },
          },
        };

      const suggestedSize = await linear.calculateSize(cluster, ruleSet);

      assert.equal(suggestedSize, 10);
    });
  });
});
