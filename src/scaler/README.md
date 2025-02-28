<br />
<p align="center">
  <h2 align="center">OSS Memorystore Cluster Autoscaler</h2>
  <img alt="Autoscaler" src="../../resources/hero-image.jpg">

  <p align="center">
    <!-- In one sentence: what does the code in this directory do? -->
    Automatically increase or reduce the size of a Memorystore cluster
    <br />
    <a href="../../README.md">Home</a>
    ·
    <a href="../poller/README.md">Poller component</a>
    ·
    Scaler component
    ·
    <a href="../forwarder/README.md">Forwarder component</a>
    ·
    <a href="../../terraform/README.md">Terraform configuration</a>
    ·
    <a href="../../terraform/README.md#Monitoring">Monitoring</a>
  </p>
</p>

## Table of Contents

*   [Table of Contents](#table-of-contents)
*   [Overview](#overview)
*   [Scaling parameters](#scaling-parameters)
*   [Scaling profiles](#scaling-profiles)
*   [Scaling rules](#scaling-rules)
*   [Scaling methods](#scaling-methods)
*   [Scaling adjustments](#scaling-adjustments)
*   [Downstream messaging](#downstream-messaging)
*   [Troubleshooting](#troubleshooting)

## Overview

The Scaler component receives a message from the Poller component that includes
the configuration parameters and the utilization metrics for a single
Memorystore cluster. It compares the metric values with the recommended
thresholds and determines if the instance should be scaled, the number of
shards/nodes to which it should be scaled, and adjusts the size of the cluster
accordingly.

The sequence of operations is as follows:

1.  [Scaling parameters](#scaling-parameters) are received from the Poller
    component.
2.  [Scaling rules](#scaling-rules) are evaluated with these parameters to
    establish whether scaling is needed.
3.  A calculation according to one of the [scaling methods](#scaling-methods)
    is applied to establish by how much the cluster should scale.
4.  [Scaling adjustments](#scaling-adjustments) are made to ensure the cluster
    remains within valid, configured, and/or recommended limits.
5.  Optionally, a [downstream message](#downstream-messaging) is sent via
    Pub/Sub to enable integration with other systems or platforms.

## Scaling parameters

As opposed to the Poller component, the Scaler component does not need any user
configuration. The parameters that the Scaler receives are a combination of the
[configuration parameters][autoscaler-poller-parameters] used by the Poller
component, the Memorystore cluster metrics, and a number of other
characteristics of the Memorystore cluster instance.

The following is an example of the message sent from the Poller to the Scaler.

```json
{
  "projectId": "memorystore-cluster-project-id",
  "regionId": "us-central1",
  "clusterId": "autoscaler-target-memorystore-cluster",
  "engine": "REDIS",
  "scalingProfile": "CPU",
  "scalingMethod": "STEPWISE",
  "units": "SHARDS",
  "currentSize": 3,
  "stepSize": 1,
  "minSize": 3,
  "maxSize": 10,
  "scaleOutCoolingMinutes": 10,
  "scaleInCoolingMinutes": 10,
  "stateDatabase": {
    "name": "firestore"
  },
  "scalerPubSubTopic": "projects/memorystore-cluster-project-id/topics/scaler-topic",
  "metrics": [
    {
      "value": 0.1916827415703537,
      "name": "cpu_maximum_utilization"
    },
    {
      "value": 0.1768677270076482,
      "name": "cpu_average_utilization"
    },
    {
      "value": 0.029637693214174952,
      "name": "memory_maximum_utilization"
    },
    {
      "value": 0.029490114406189493,
      "name": "memory_average_utilization"
    },
    {
      "name": "maximum_evicted_keys",
      "value": 0
    },
    {
      "name": "average_evicted_keys",
      "value": 0
    }
  ]
}
```

Notice the `scalingProfile` parameter, which is described in more detail in
the following section, [scaling-profiles](#scaling-profiles).

## Scaling profiles

A scaling profile consists of a combination of scaling rules that,
when grouped together, define the metrics that will be evaluated to reach
a scaling decsion. One of the following scaling profiles may be provided:

*   `CPU`
*   `MEMORY`
*   `CPU_AND_MEMORY` (default, used if no other profile is specified)
*   `CUSTOM` (see section [custom-scaling](#custom-scaling)

The `CPU_AND_MEMORY` profile includes rules for scaling on CPU as well as memory
utilization. Please see the following section for more details on how these
[scaling rules](#scaling-rules) are evaluated.

You can create a new scaling profile by copying one of the existing scaling
profiles in the [profiles directory](./scaler-core/scaling-profiles/profiles/README.md)
and adapting it to suit your needs. This profile will be loaded if you specify
its name using the `scalingProfile` parameter in your configuration.

### Custom scaling

You can configure custom scaling by using the scaling profile `CUSTOM`, and supplying
an array of scaling rules in the user-supplied configuration. An example of rules
supplied in JSON as part of a custom scaling profile is as follows:

```json
[
  {
    "clusterId": "cluster-1",
    "maxSize": 10,
    "minSize": 3,
    "projectId": "project-1",
    "regionId": "us-central1",
    "scalerPubSubTopic": "projects/project-1/topics/scaler-topic",
    "scalingMethod": "STEPWISE",
    "scalingProfile": "CUSTOM",
    "stateDatabase": {
      "name": "firestore"
    },
    "units": "SHARDS",
    "scalingRules": [
      {
        "name": "custom_memory_scale_out",
        "conditions": {
          "all": [
            {
              "fact": "memory_average_utilization",
              "operator": "greaterThan",
              "value": 70
            }
          ]
        },
        "event": {
          "type": "OUT",
          "params": {
            "message": "High average memory utilization",
            "scalingMetrics": ["memory_average_utilization"]
          }
        }
      },
      {
        "name": "custom_memory_scale_in",
        "conditions": {
          "all": [
            {
              "fact": "memory_average_utilization",
              "operator": "lessThan",
              "value": 60
            }
          ]
        },
        "event": {
          "type": "IN",
          "params": {
            "message": "Low average memory utilization",
            "scalingMetrics": ["memory_average_utilization"]
          }
        }
      },
      // Additional rules may be added here
    ]
  }
]
```

These rules will be passed from the Poller to the Scaler and evaluated to
inform scaling decisions.

## Scaling rules

The Scaler component uses a [Rules Engine][rules-engine] to evaluate a set of
parameterized rules according to a set of metrics and other parameters
that it receives from the Poller. Each rule is evaluated, and the results
of these evaluations are combined to form a scaling decision, which may
be `IN`, `OUT`, or `NONE`.

The rules are represented as JavaScript Objects within the Autoscaler
codebase, and can be found [here](./scaler-core/scaling-profiles/rules/README.md).

The rules are grouped into the following categories:

*   [CPU Utilization](./scaler-core/scaling-profiles/rules/cpu/README.md)
*   [Memory Utilization](./scaler-core/scaling-profiles/rules/memory/README.md)

The following is an annotated example of one of the included rules. This
rule triggers a scale-out if the average CPU utilization (i.e. across all
primary shards) is greater than 80%.

```javascript
module.exports = {
  name: basename(__filename, '.js'),
  conditions: {
    all: [
      {
        // The Cloud Monitoring metric name
        fact: 'cpu_average_utilization',
        // The comparison operator
        operator: 'greaterThan',
        // The threshold for the rule to evaluate as TRUE
        value: 80,
      },
    ],
  },
  event: {
    // The scaling decision should this rule evaluate as TRUE
    type: 'OUT',
    params: {
      // The string to use in the Cloud Logging message when the rule fires
      message: 'high average CPU utilization',
      // The metrics to use in scaling calculations
      scalingMetrics: ['cpu_average_utilization'],
    },
  },
};
```

The values in these files may be modified to alter the behaviour of the
Autoscaler. Thorough testing is recommended.

## Scaling methods

The Scaler component supports two scaling methods out of the box:

*   [STEPWISE](scaler-core/scaling-methods/stepwise.js): This is the default
    method used by the Scaler. It suggests adding or removing shards
    using a fixed step amount defined by the parameter `stepSize`.

*   [DIRECT](scaler-core/scaling-methods/direct.js): This method suggests
    scaling to the number of shards specified by the `maxSize` parameter. It
    does NOT take in account the current utilization metrics. It is useful
    to scale an instance in preparation for a batch job and and to scale
    it back after the job is finished.

*   [LINEAR](scaler-core/scaling-methods/linear.js): This method suggests
    scaling to the number of shards calculated with a simple linear
    cross-multiplication between the threshold metric and its current
    utilization. In other words, the new number of shards divided by the current
    number of shards is equal to the scaling metric value divided by the scaling
    metric threshold value. Using this method, the new number of shards or
    processing units is [directly proportional][directly-proportional] to the
    current resource utilization and the threshold. The proposed change size can
    be limited using `scaleInLimit` and `scaleOutLimit`, where the variation
    in the shard count in a single iteration will not exceed by these limits
    when scaling in or out respectively.

The selected scaling method will produce a suggested size to which the
cluster should be scaled. This suggested size then undergoes some final checks
and may be adjusted prior to the actual scaling request. These are detailed in
the following section.

## Scaling adjustments

Before issuing a Memorystore API request to scale in or out, the suggested
size generated by evaluating the appropriate scaling method is checked as
follows:

1.  For a suggested scale-in operation, ensure the suggested size is
    large enough to accommodate the current stored data set, plus a default or
    custom-configured percentage headroom
    (see [minFreeMemoryPercent](../poller/README.md#configuration-parameters)).
2.  Ensure it is within the configured minimum and maximum cluster sizes.

As a result of the above checks, the suggested size may be adjusted before
the final scaling request is made to the Memorystore API.

## Downstream messaging

A downstream application is a system that receives information from the
Autoscaler.

When certain events happens, the Autoscaler can publish messages to a
PubSub topic. Downstream applications can
[create a subscription][pub-sub-create-subscription] to that topic
and [pull the messages][pub-sub-receive] to process them further.

This feature is disabled by default. To enable it, specify `projects/${projectId}/topics/downstream-topic`
as the value of the `downstreamPubSubTopic` parameter in the [Poller configuration](../poller/README.md#configuration-parameters).
Make sure you replace the placeholder `${projectId}` with your actual project ID.

The topic is created at deployment time as specified in the
[base module Terraform config](../../terraform/modules/autoscaler-base/main.tf).

### Message structure

The following is an example of a message published by the Autoscaler.

```json
[
  {
    "ackId": "U0RQBhYsXUZIUTcZCGhRDk9eIz81IChFEQMIFAV8fXFDRXVeXhoHUQ0ZcnxpfT5TQlUBEVN-VVsRDXptXG3VzfqNRF9BfW5ZFAgGQ1V7Vl0dDmFeWF3SjJ3whoivS3BmK9OessdIf77en9luZiA9XxJLLD5-LSNFQV5AEkwmFkRJUytDCypYEU4EISE-MD5F",
    "ackStatus": "SUCCESS",
    "message": {
      "attributes": {
        "event": "SCALING",
        "googclient_schemaencoding": "JSON",
        "googclient_schemaname": "projects/memorystore-cluster-project/schemas/downstream-schema",
        "googclient_schemarevisionid": "207c0c97"
      },
      "data": "eyJwcm9qZWN0SWQiOiJyZWRpcy1jbHVzdGVyLXByb2plY3QiLCJyZWdpb25JZCI6InVzLWNlbnRyYWwxIiwiY3VycmVudFNpemUiOjUsInN1Z2dlc3RlZFNpemUiOjYsInVuaXRzIjowLCJtZXRyaWNzIjpbeyJuYW1lIjoiY3B1X21heGltdW1fdXRpbGl6YXRpb24iLCJ2YWx1ZSI6MC4yMjUxNDk3OTAyNDY4MTYxN30seyJuYW1lIjoiY3B1X2F2ZXJhZ2VfdXRpbGl6YXRpb24iLCJ2YWx1ZSI6MC4xNzQ1OTEzMTcwOTE1MjI3Nn0seyJuYW1lIjoibWVtb3J5X21heGltdW1fdXRpbGl6YXRpb24iLCJ2YWx1ZSI6MC4wMzYyMTE3NTU5ODgzNDI3NDZ9LHsibmFtZSI6Im1lbW9yeV9hdmVyYWdlX3V0aWxpemF0aW9uIiwidmFsdWUiOjAuMDM0OTUxMDYwNDM5MTE3MDZ9LHsibmFtZSI6Im1heGltdW1fZXZpY3RlZF9rZXlzIiwidmFsdWUiOjB9LHsibmFtZSI6ImF2ZXJhZ2VfZXZpY3RlZF9rZXlzIiwidmFsdWUiOjB9XX0=",
      "messageId": "8437946659663924",
      "publishTime": "2024-02-16T16:39:49.252Z"
    }
  }
]
```

Notable attributes are:

*   **message.attributes.event:** the name of the event for which this message
    was triggered. The Autoscaler publishes a message when it scales a
    Memorystore cluster. The name of that event is `'SCALING'`. You can define
    [custom messages](#custom-messages) for your own event types.
*   **message.attributes.googclient_schemaname:** the
    [Pub/Sub schema][pub-sub-schema] defining the format that the data field
    must follow. The schema represents the contract between the message
    producer (Autoscaler) and the message consumers (downstream applications).
    Pub/Sub enforces the format. The default schema is defined as a Protocol
    Buffer in the file
    [downstream.schema.proto](scaler-core/downstream.schema.proto).
*   **message.attributes.googclient_schemaencoding:** consumers will receive
    the data in the messages encoded as Base64 containing JSON.
*   **message.publishTime:** timestamp when the message was published
*   **message.data:** the message payload encoded as Base64 containing a JSON
    string. In the example, the [decoded][base-64-decode] string contains the
    following data:

```json
{
  "projectId": "memorystore-cluster-project",
  "regionId": "us-central1",
  "currentSize": 5,
  "suggestedSize": 6,
  "units": "SHARDS",
  "metrics": [
    {
      "name": "cpu_maximum_utilization",
      "value": 0.22514979024681617
    },
    {
      "name": "cpu_average_utilization",
      "value": 0.17459131709152276
    },
    {
      "name": "memory_maximum_utilization",
      "value": 0.036211755988342746
    },
    {
      "name": "memory_average_utilization",
      "value": 0.03495106043911706
    },
    {
      "name": "maximum_evicted_keys",
      "value": 0
    },
    {
      "name": "average_evicted_keys",
      "value": 0
    }
  ]
}
```

### Custom messages

Before defining a custom message, consider if your use case can be solved by
[log-based metrics][log-based-metrics].

The Memorystore Cluster Autoscaler produces verbose structured logging for all
its actions. These logs can be used through log-based metrics to create
[charts and alerts in Cloud Monitoring][charts-and-alerts]. In turn, alerts can
be notified through several different [channels][notification-channels] including
Pub/Sub, and managed through [incidents][alert-incidents].

If your use case can be better solved by a custom downstream message, then this
section explains how to define one, which implies modifying the Scaler code.

To publish a new event as a downstream message:

*   Choose a unique name for your event. The convention is an all-caps
    alphanumeric + underscores ID with a verb. e.g. `'SCALING'`
*   Call the Scaler function `publishDownstreamEvent`.
    For an example, look at the [Scaler](scaler-core/index.js)
    function `processScalingRequest`.

In case you need to add fields to the message payload:

1.  Add your custom fields to the [Pub/Sub schema protobuf](scaler-core/downstream.schema.proto).
    Your custom fields must use [field numbers][proto-field-numbers] over 1000.
    Field numbers from 1 to 1000 are [reserved][proto-reserved] for future
    Autoscaler enhancements. Make sure field numbers are unique within your org
    and not reused if previously deleted.

2.  Run `terraform apply` to update the downstream Pub/Sub topic with the new schema.

3.  Create and call a function similar to the [Scaler](scaler-core/index.js)
    `publishDownstreamEvent()`. In this function you populate the message
    payload with the default fields and your new custom fields, and then call
    `publishProtoMsgDownstream()`.

### Consuming messages

The payload of messages sent downstream from the Autoscaler is plain JSON encoded
with Base64, so you do not need to use the protobuf library for receiving messages.
See [this article][pub-sub-receive] for an example.

However, if you want to validate the received message against the Protobuf schema,
you can follow [this example][pub-sub-receive-proto].

## Troubleshooting

### Poller can't read metrics

For example:

```none
Unable to retrieve metrics for projects/[PROJECT_ID]/us-central1/[MEMORYSTORE_INSTANCE_ID]:
Error: 7 PERMISSION_DENIED: Permission monitoring.timeSeries.list denied (or the resource may not exist).
```

*   Service account is missing permissions
    *   `poller-sa@{PROJECT_ID}.gserviceaccount.com` for Cloud Run functions, or
    *   `scaler-sa@{PROJECT_ID}.gserviceaccount.com` for Kubernetes deployment requires
        *   `redis.clusters.list`,
        *   `redis.clusters.get`,
        *   `monitoring.timeSeries.list`
*   [GKE Workload Identity](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
    is not correctly configured
*   Incorrectly configured Memorystore cluster ID

### Scaler cannot access state database

For example:

```none
Failed to read from Spanner State storage:
projects/[PROJECT_ID]/instances/memorystore-autoscaler-state/databases/memorystore-autoscaler-state/tables/memorystoreClusterAutoscaler:
Error: 7 PERMISSION_DENIED:
Caller is missing IAM permission spanner.sessions.create on resource projects/[PROJECT_ID]/instances/[SPANNER_STATE_INSTANCE]/databases/memorystore-autoscaler-state.
```

*   Scaler service account is missing permissions to Spanner or Firestore.
    *   `scaler-sa@{PROJECT_ID}.gserviceaccount.com`
*   Incorrect Spanner or Firestore details in configuration file.
*   [GKE Workload Identity](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
    is not correctly configured.

### Spanner state store results in an error

For example:

```none
Error: 5 NOT_FOUND: Database not found: projects/[PROJECT_ID]/instances/[SPANNER_STATE_INSTANCE]/databases/memorystore-autoscaler-state
```

*   State database is missing from Spanner state instance.

### Scaler cannot scale Memorystore instance(s)

```none
Unsuccessful scaling attempt: Error: 7 PERMISSION_DENIED:
Permission 'redis.clusters.update' denied on 'projects/[PROJECT_ID]/locations/us-central1/clusters/[MEMORYSTORE_INSTANCE_ID]'.
```

*   Scaler service account is missing `redis.clusters.update` permissions to
    Memorystore.
    *   `scaler-sa@{PROJECT_ID}.gserviceaccount.com`
*   Incorrect Memorystore instance specified in configuration file.
*   [GKE Workload Identity](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
    is not correctly configured

### Latency Spikes when Scaling in

*   The amount of compute capacity removed from the instance might be too large.
    *   Use the `scaleInLimit` parameter.
    *   Increase the `scaleInCoolingMinutes.`
    *   Set a larger `minSize` for the instance.

See the documentation on the [Poller parameters][autoscaler-poller-parameters]
for further details.

### Autoscaler is too reactive or not reactive enough

*   The "sweet spot" between thresholds is too narrow or too wide.
    *   Adjust the `thresholds` for the scaling profile.

<!-- LINKS: https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[alert-incidents]: https://cloud.google.com/monitoring/alerts/log-based-incidents
[autoscaler-poller-parameters]: ../poller/README.md#configuration-parameters
[base-64-decode]: https://www.base64decode.org/
[charts-and-alerts]: https://cloud.google.com/logging/docs/logs-based-metrics#monitoring
[directly-proportional]: https://en.wikipedia.org/wiki/Proportionality_(mathematics)#Direct_proportionality
[log-based-metrics]: https://cloud.google.com/logging/docs/logs-based-metrics
[notification-channels]: https://cloud.google.com/monitoring/support/notification-options
[proto-field-numbers]: https://protobuf.dev/programming-guides/proto3/#assigning
[proto-reserved]: https://protobuf.dev/programming-guides/proto3/#fieldreserved
[pub-sub-create-subscription]: https://cloud.google.com/pubsub/docs/create-subscription#pubsub_create_push_subscription-nodejs
[pub-sub-receive-proto]: https://cloud.google.com/pubsub/docs/samples/pubsub-subscribe-proto-messages#pubsub_subscribe_proto_messages-nodejs_javascript
[pub-sub-receive]: https://cloud.google.com/pubsub/docs/publish-receive-messages-client-library#receive_messages
[pub-sub-schema]: https://cloud.google.com/pubsub/docs/schemas
[rules-engine]: https://github.com/CacheControl/json-rules-engine
