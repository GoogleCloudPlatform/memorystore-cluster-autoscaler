<br />
<p align="center">
  <h2 align="center">OSS Memorystore Autoscaler</h2>
  <img alt="Autoscaler" src="../../resources/hero-image.jpg">

  <p align="center">
    <!-- In one sentence: what does the code in this directory do? -->
    Retrieve metrics for one or more Memorystore Cluster Instances
    <br />
    <a href="../../README.md">Home</a>
    ·
    Poller component
    ·
    <a href="../scaler/README.md">Scaler component</a>
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
*   [Configuration parameters](#configuration-parameters)
    *   [Required](#required)
    *   [Optional](#optional)
*   [Example JSON configuration for Cloud Run functions](#example-json-configuration-for-cloud-run-functions)
*   [Example YAML ConfigMap for Kubernetes deployment](#example-yaml-configmap-for-kubernetes-deployment)

## Overview

The Poller component takes an array of Memorystore Cluster instances and obtains
load metrics for each of them from [Cloud Monitoring][cloud-monitoring]. This
array may come from the payload of a Cloud PubSub message or from configuration
held in a [Kubernetes ConfigMap][configmap], depending on configuration.

Then for each Memorystore cluster instance it publishes a message via the
specified Cloud PubSub topic or via API call (in a Kubernetes configuration), which
includes the metrics and part of the configuration for the scaling operation.

The Scaler component receives the message, compares the metric values with the
recommended thresholds. If any of the values fall outside this range, the Scaler
component will adjust the number of nodes in the Memorystore cluster
accordingly.

## Configuration parameters

The following are the configuration parameters consumed by the Poller component.
Some of these parameters are forwarded to the Scaler component as well.

In the case of the
[Cloud Run functions](../../terraform/cloud-functions/README.md#configuration)
deployment, the parameters are defined using the JSON payload of the PubSub
message that is published by the Cloud Scheduler job.

In the case of the
[Kubernetes deployment](../../terraform/gke/README.md#configuration), the
parameters are defined using a [Kubernetes ConfigMap][configmap] that is loaded
by the Kubernetes Cron job.

The Autoscaler JSON (for Cloud Run functions) or YAML (for GKE) configuration
can be validated by running the command:

```shell
npm install
npm run validate-config-file -- path/to/config_file
```

<!--
  -- Any changes to this file also need to be reflected in
  -- autoscaler-config.schema.json, and in autoscaler-common/types.js.
  -->

### Required

| Key                 | Description |
| ------------------- | ----------- |
| `projectId`         | Project ID of the Memorystore Cluster to be monitored by the Autoscaler |
| `regionId`          | Region ID of the Memorystore Cluster to be monitored by the Autoscaler |
| `instanceId`        | Instance ID of the Memorystore Cluster to be monitored by the Autoscaler |

### Required for a Cloud Run functions deployment

| Key                 | Description |
| ------------------- | ----------- |
| `scalerPubSubTopic` | PubSub topic for the Poller function to publish messages for the Scaler function. The topic must be in the format `projects/{projects}/topics/{topicId}`. |

### Optional

| Key                      | Default Value    | Description |
| ------------------------ | ---------------- | ----------- |
| `units`                  | `SHARDS`         | Specifies the units for capacity. Currently `SHARDS` is the only valid unit. |
| `minSize`                | 1                | Minimum number of Memorystore Cluster shards that the instance can be scaled IN to. |
| `maxSize`                | 10               | Maximum number of Memorystore Cluster shards that the instance can be scaled OUT to. |
| `scalingProfile`         | `CPU_AND_MEMORY` | Scaling profiles that should be used. Options are: `CPU_AND_MEMORY`, `CPU`, `MEMORY`, or `CUSTOM`. See the [scaling profiles section][autoscaler-scaling-profiles] in the Scaler component page for more information. |
| `scalingMethod`          | `STEPWISE`       | Scaling method that should be used. Options are: `STEPWISE`, `DIRECT` and `LINEAR`. See the [scaling methods section][autoscaler-scaler-methods] in the Scaler component page for more information. |
| `scalingRules`           | `undefined`      | Scaling rules to be used when the `CUSTOM` scaling profile is supplied. See the [scaling profiles section][autoscaler-scaling-profiles] in the Scaler component page for more information. |
| `stepSize`               | 1                | Number of shards that should be added or removed when scaling with the `STEPWISE` method. |
| `scaleInLimit`           | `undefined`      | Maximum number of shards that can be removed on a single step when scaling with the `LINEAR` method. If `undefined` or `0`, it will not limit the number of shards. |
| `scaleOutLimit`          | `undefined`      | Maximum number of shards that can be added on a single step when scaling with the `LINEAR` method. If `undefined` or `0`, it will not limit the number of shards. |
| `minFreeMemoryPercent`   | 30               | Percentage of total memory to maintain as safety (i.e. free, unused) headroom.  |
| `scaleOutCoolingMinutes` | 10               | Minutes to wait after scaling IN or OUT before a scale OUT event can be processed. |
| `scaleInCoolingMinutes`  | 20               | Minutes to wait after scaling IN or OUT before a scale IN event can be processed. |
| `stateProjectId`         | `${projectId}`   | The project ID where the Autoscaler state will be persisted. By default it is persisted using [Cloud Firestore][cloud-firestore] in the same project as the Memorystore Cluster instance. |
| `stateDatabase`          | Object           | An Object that can override the database for managing the state of the Autoscaler. The default database is Firestore. Refer to the [state database](#state-database) for details. |
| `downstreamPubSubTopic`  | `undefined`      | Set this parameter to `projects/${projectId}/topics/downstream-topic` if you want the the Autoscaler to publish events that can be consumed by downstream applications.  See [Downstream messaging](../scaler/README.md#downstream-messaging) for more information. |

## State Database

The table describes the objects used to specify the database
for managing the state of the Autoscaler.

| Key                        | Default      | Description |
| -------------------------- | ------------ | ----------- |
| `name`                     | `firestore`  | Name of the database for managing the state of the Autoscaler. By default, Firestore is used. The currently supported values are `firestore` and `spanner`. |

### State Management in Cloud Spanner

If the value of `name` is `spanner`, the following values are required.

| Key                        | Description |
| -------------------------- | ----------- |
| `instanceId`               | The instance id of Memorystore Cluster which you want to manage the state. |
| `databaseId`               | The database id of Memorystore Cluster instance which you want to manage the state. |

When using Cloud Spanner to manage the state, a table with the following
DDL is created at runtime.

```sql
CREATE TABLE memorystoreClusterAutoscaler (
  id STRING(MAX),
  lastScalingTimestamp TIMESTAMP,
  createdOn TIMESTAMP,
  updatedOn TIMESTAMP,
  lastScalingCompleteTimestamp TIMESTAMP,
  scalingOperationId STRING(MAX),
  scalingRequestedSize INT64,
  scalingPreviousSize INT64,
  scalingMethod STRING(MAX),
) PRIMARY KEY (id)
```

## Example JSON configuration for Cloud Run functions

```json
[
  {
    "projectId": "memorystore-cluster-project-id",
    "regionId": "us-central1",
    "clusterId": "autoscaler-target-memorystore-cluster",
    "scalingMethod": "STEPWISE",
    "units": "SHARDS",
    "maxSize": 10,
    "minSize": 3,
    "scalerPubSubTopic": "projects/memorystore-cluster-project-id/topics/scaler-topic",
    "stateDatabase": {
      "name": "firestore"
    }
  }
]
```

By default, the JSON configuration is managed by Terraform, in the
[autoscaler-scheduler][autoscaler-scheduler-tf] module. If you would
like to manage this configuration directly (i.e. outside Terraform),
then you will need to configure the Terraform lifecycle `ignore_changes`
meta-argument by uncommenting the appropriate line as described in the above
file. This is so that subsequent Terraform operations do not reset your
configuration to the supplied defaults.

To retrieve the current configuration, run the following command:

```sh
gcloud scheduler jobs describe poll-cluster-metrics --location=${REGION} \
   --format="value(pubsubTarget.data)" | base64 -d | python3 -m json.tool | tee autoscaler-config.json
```

To directly update the configuration using the contents of the
`autoscaler-config.json` file, run the following command:

```sh
gcloud scheduler jobs update pubsub poll-cluster-metrics --location=${REGION} \
   --message-body-from-file=autoscaler-config.json
```

## Example YAML ConfigMap for Kubernetes deployment

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: autoscaler-config
  namespace: memorystore-cluster-autoscaler
data:
  autoscaler-config.yaml: |
    ---
    - projectId: memorystore-cluster-project-id
      regionId: us-central1
      clusterId: autoscaler-target-memorystore-cluster
      scalingMethod: STEPWISE
      units: SHARDS
      minSize: 3
      maxSize: 10
      stateDatabase:
        name: firestore
```

<!-- LINKS: https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[autoscaler-scaler-methods]: ../scaler/README.md#scaling-methods
[autoscaler-scaling-profiles]: ../scaler/README.md#scaling-profiles
[autoscaler-scheduler-tf]: ../../terraform/modules/autoscaler-scheduler/main.tf
[cloud-firestore]: https://cloud.google.com/firestore
[cloud-monitoring]: https://cloud.google.com/monitoring
[configmap]: https://kubernetes.io/docs/concepts/configuration/configmap
