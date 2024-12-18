<br />
<p align="center">
  <h2 align="center">OSS Memorystore Cluster Autoscaler</h2>
  <img alt="Autoscaler" src="../../../resources/hero-image.jpg">

  <p align="center">
    <!-- In one sentence: what does the code in this directory do? -->
    Set up the Autoscaler in Cloud Run functions in a distributed
    deployment using Terraform
    <br />
    <a href="../../../README.md">Home</a>
    ·
    <a href="../../../src/scaler/README.md">Scaler component</a>
    ·
    <a href="../../../src/poller/README.md">Poller component</a>
    ·
    <a href="../../../src/forwarder/README.md">Forwarder component</a>
    ·
    Terraform configuration
    ·
    <a href="../README.md#Monitoring">Monitoring</a>
    <br />
    Cloud Run functions
    ·
    <a href="../../gke/README.md">Google Kubernetes Engine</a>
    <br />
    <a href="../per-project/README.md">Per-Project</a>
    ·
    <a href="../centralized/README.md">Centralized</a>
    ·
    Distributed

  </p>

</p>

## Table of Contents

*   [Table of Contents](#table-of-contents)
*   [Overview](#overview)
*   [Architecture](#architecture)
    *   [Pros](#pros)
    *   [Cons](#cons)
*   [Before you begin](#before-you-begin)
*   [Preparing the Autoscaler Project](#preparing-the-autoscaler-project)
    *   [Using Firestore for Autoscaler state](#using-firestore-for-autoscaler-state)
    *   [Using Spanner for Autoscaler state](#using-spanner-for-autoscaler-state)
    *   [Deploying the Autoscaler](#deploying-the-autoscaler)
*   [Preparing the Application Project](#preparing-the-application-project)
    *   [Deploying the Autoscaler](#deploying-the-autoscaler)
    *   [Authorize the Forwarder function to publish to the Poller topic](#authorize-the-forwarder-function-to-publish-to-the-poller-topic)
*   [Verifying your deployment](#verifying-your-deployment)

## Overview

This directory contains Terraform configuration files to quickly set up the
infrastructure for your Autoscaler with a distributed deployment.

In this deployment option all the components of the Autoscaler
reside in a single project, with the exception of Cloud Scheduler (step 1) and
the [Forwarder topic and function](../../../src/forwarder/README.md)

This deployment is the best of both worlds between the per-project and the
centralized deployments: *Teams who own the Memorystore Cluster instances,
called Application teams, are able to manage the Autoscaler configuration
parameters for their instances with their own Cloud Scheduler jobs.* On the
other hand, the rest of the Autoscaler infrastructure is managed by a central
team.

## Architecture

![architecture-distributed](../../../resources/architecture-distributed.png)

For an explanation of the components of the Autoscaler and the
interaction flow, please read the
[main Architecture section](../README.md#architecture).

Cloud Scheduler can only publish messages to topics in the same project.
Therefore in step 2, we transparently introduce an intermediate component to
make this architecture possible. For more information, see the
[Forwarder function](../../../src/forwarder/README.md).

The distributed deployment has the following pros and cons:

### Pros

*   **Configuration and infrastructure**: application teams are in control of
    their config and schedules
*   **Maintenance**: Scaler infrastructure is centralized, reducing up-keep
    overhead
*   **Policies and audit**: Best practices across teams might be easier to
    specify and enact. Audits might be easier to execute.

### Cons

*   **Configuration**: application teams need to provide service accounts to
    write to the polling topic.
*   **Risk**: the centralized team itself may become a single point of failure
    even if the infrastructure is designed with high availability in mind.

## Before you begin

1.  Open the [Cloud Console][cloud-console]
2.  Activate [Cloud Shell][cloud-shell] \
    At the bottom of the Cloud Console, a
    <a href='https://cloud.google.com/shell/docs/features'>Cloud Shell</a>
    session starts and displays a command-line prompt. Cloud Shell is a shell
    environment with the Cloud SDK already installed, including the
    <code>gcloud</code> command-line tool, and with values already set for your
    current project. It can take a few seconds for the session to initialize.

3.  In Cloud Shell, clone this repository:

    ```sh
    gcloud source repos clone memorystore-cluster-autoscaler --project=memorystore-oss-preview
    ```

4.  Change into the directory of the cloned repository, and check out the
    `main` branch:

    ```sh
    cd memorystore-cluster-autoscaler && git checkout main
    ```

5.  Export variables for the working directories:

    ```sh
    export AUTOSCALER_DIR="$(pwd)/terraform/cloud-functions/distributed/autoscaler-project"
    export APP_DIR="$(pwd)/terraform/cloud-functions/distributed/app-project"
    ```

## Preparing the Autoscaler Project

In this section you prepare the deployment of the project where the centralized
Autoscaler infrastructure, with the exception of Cloud Scheduler, lives.

1.  Go to the [project selector page][project-selector] in the Cloud Console.
    Select or create a Cloud project.

2.  Make sure that billing is enabled for your Google Cloud project.
    [Learn how to confirm billing is enabled for your project][enable-billing].

3.  In Cloud Shell, set environment variables with the ID of your **autoscaler**
    project:

    ```sh
    export AUTOSCALER_PROJECT_ID=<YOUR_PROJECT_ID>
    gcloud config set project "${AUTOSCALER_PROJECT_ID}"
    ```

4.  Choose the [region][region-and-zone] where the Autoscaler
    infrastructure will be located.

    ```sh
    export AUTOSCALER_REGION=us-central1
    ```

5.  Enable the required Cloud APIs :

    ```sh
    gcloud services enable \
        artifactregistry.googleapis.com \
        cloudbuild.googleapis.com \
        cloudfunctions.googleapis.com \
        cloudresourcemanager.googleapis.com \
        compute.googleapis.com \
        eventarc.googleapis.com \
        iam.googleapis.com \
        networkconnectivity.googleapis.com \
        pubsub.googleapis.com \
        logging.googleapis.com \
        monitoring.googleapis.com \
        run.googleapis.com \
        serviceconsumermanagement.googleapis.com
    ```

6.  There are two options for deploying the state store for the Autoscaler:

    1.  Store the state in [Firestore][cloud-firestore]
    2.  Store the state in [Spanner][cloud-spanner]

    For Firestore, follow the steps in
    [Using Firestore for Autoscaler State](#using-firestore-for-autoscaler-state).
    For Spanner, follow the steps in [Using Spanner for Autoscaler state](#using-spanner-for-autoscaler-state).

### Using Firestore for Autoscaler state

1.  To use Firestore for the Autoscaler state, enable the additional API:

    ```sh
    gcloud services enable firestore.googleapis.com
    ```

2.  If you want to choose the name for your Firestore database, set the
    following variable:

    ```sh
    export TF_VAR_firestore_state_database=<DATABASE_NAME>
    ```

    If you do not set this variable, the default database will be used
    (`(default)`).

3.  Next, continue to [Deploying the Autoscaler](#deploying-the-autoscaler).

### Using Spanner for Autoscaler state

1.  To use Spanner for the Autoscaler state, enable the additional API:

    ```sh
    gcloud services enable spanner.googleapis.com
    ```

2.  If you want Terraform to create a Spanner instance (named
    `memorystore-autoscaler-state` by default) to store the state,
    set the following variable:

    ```sh
    export TF_VAR_terraform_spanner_state=true
    ```

    If you already have a Spanner instance where state must be stored,
    set the the name of your instance:

    ```sh
    export TF_VAR_spanner_state_name=<SPANNER_INSTANCE_NAME>
    ```

    If you want to manage the state of the Autoscaler in your own
    Cloud Spanner instance, please create the following table in advance:

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

3.  Next, continue to [Deploying the Autoscaler](#deploying-the-autoscaler).

### Deploying the Autoscaler

1.  Set the project ID and region in the
    corresponding Terraform environment variables:

    ```sh
    export TF_VAR_project_id="${AUTOSCALER_PROJECT_ID}"
    export TF_VAR_region="${AUTOSCALER_REGION}"
    ```

2.  Change directory into the Terraform scaler-project directory and initialize
    it.

    ```sh
    cd "${AUTOSCALER_DIR}"
    terraform init
    ```

3.  Create the Autoscaler infrastructure. Answer `yes` when prompted, after
    reviewing the resources that Terraform intends to create.

    ```sh
    terraform apply -parallelism=2
    ```

    *   If you are running this command in Cloud Shell and encounter errors of
        the form "`Error: cannot assign requested address`", this is a [known
        issue][provider-issue] in the Terraform Google provider, please retry
        with -parallelism=1.

## Preparing the Application Project

In this section you prepare the deployment of the Cloud Scheduler, Forwarder
topic and function in the project where the Memorystore Cluster instances live.

1.  Go to the [project selector page][project-selector] in the Cloud Console.
    Select or create a Cloud project.

2.  Make sure that billing is enabled for your Google Cloud project.
    [Learn how to confirm billing is enabled for your project][enable-billing].

3.  In Cloud Shell, set the environment variables with the ID of your
    **application** project:

    ```sh
    export APP_PROJECT_ID=<INSERT_YOUR_APP_PROJECT_ID>
    gcloud config set project "${APP_PROJECT_ID}"
    ```

4.  Choose the [region][region-and-zone] where the Application project
    will be located:

    ```sh
    export APP_REGION=us-central1
    ```

5.  Use the following command to enable the Cloud APIs:

    ```sh
    gcloud services enable \
        artifactregistry.googleapis.com \
        cloudbuild.googleapis.com \
        cloudfunctions.googleapis.com \
        cloudresourcemanager.googleapis.com \
        cloudscheduler.googleapis.com \
        compute.googleapis.com \
        eventarc.googleapis.com \
        iam.googleapis.com \
        networkconnectivity.googleapis.com \
        pubsub.googleapis.com \
        logging.googleapis.com \
        monitoring.googleapis.com \
        redis.googleapis.com \
        run.googleapis.com \
        serviceconsumermanagement.googleapis.com
    ```

### Deploy the Application infrastructure

1.  Set the project ID and region in the
    corresponding Terraform environment variables

    ```sh
    export TF_VAR_project_id="${APP_PROJECT_ID}"
    export TF_VAR_region="${APP_REGION}"
    ```

2.  By default, a new Memorystore Cluster instance will be created for testing.
    If you want to scale an existing Memorystore Cluster instance, set the
    following variable:

    ```sh
    export TF_VAR_terraform_memorystore_cluster=false
    ```

    Set the following variable to choose the name of a new or existing cluster
    to scale:

    ```sh
    export TF_VAR_memorystore_cluster_name=<memorystore-cluster-name>
    ```

    If you do not set this variable, `autoscaler-target-memorystore-cluster`
    will be used.

3.  Set the project ID where the Firestore instance resides.

    ```sh
    export TF_VAR_state_project_id="${AUTOSCALER_PROJECT_ID}"
    ```

4.  To create a testbench VM with utilities for testing Memorystore, including
    generating load, set the following variable:

    ```sh
    export TF_VAR_terraform_test_vm=true
    ```

    Note that this option can only be selected when you have chosen to create a
    new Memorystore cluster.

5.  Change directory into the Terraform app-project directory and initialize it.

    ```sh
    cd "${APP_DIR}"
    terraform init
    ```

6.  Create the infrastructure in the application project. Answer `yes` when
    prompted, after reviewing the resources that Terraform intends to create.

    ```sh
    terraform import module.autoscaler-scheduler.google_app_engine_application.app "${APP_PROJECT_ID}"
    terraform apply -parallelism=2
    ```

    *   If you are running this command in Cloud Shell and encounter errors of
        the form "`Error: cannot assign requested address`", this is a [known
        issue][provider-issue] in the Terraform Google provider, please retry
        with -parallelism=1

### Authorize the Forwarder function to publish to the Poller topic

1.  Switch back to the Autoscaler project and ensure that Terraform variables
    are correctly set.

    ```sh
    cd "${AUTOSCALER_DIR}"

    export TF_VAR_project_id="${AUTOSCALER_PROJECT_ID}"
    export TF_VAR_region="${AUTOSCALER_REGION}"
    ```

2.  Set the Terraform variables for your Forwarder service accounts, updating
    and adding your service accounts as needed. Answer `yes` when prompted,
    after reviewing the resources that Terraform intends to create.

    ```sh
    export TF_VAR_forwarder_sa_emails='["serviceAccount:forwarder-sa@'"${APP_PROJECT_ID}"'.iam.gserviceaccount.com"]'
    terraform apply -parallelism=2
    ```

If you are running this command in Cloud Shell and encounter errors of the form
"`Error: cannot assign requested address`", this is a
[known issue][provider-issue] in the Terraform Google provider, please retry
with -parallelism=1

## Verifying your deployment

Your Autoscaler infrastructure is ready, follow the instructions in the main
page to [configure your Autoscaler](../README.md#configuration). Please take
in account that in a distributed deployment: *Logs from the Poller and Scaler
functions will appear in the [Logs Viewer][logs-viewer] for the Autoscaler
project.* Logs about syntax errors in the JSON configuration of the Cloud
Scheduler payload will appear in the Logs viewer of each Application project, so
that the team responsible for a specific Cloud Spanner instance can troubleshoot
its configuration issues independently.

<!-- LINKS: https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[cloud-console]: https://console.cloud.google.com
[cloud-firestore]: https://cloud.google.com/firestore
[cloud-shell]: https://console.cloud.google.com/?cloudshell=true
[cloud-spanner]: https://cloud.google.com/spanner
[enable-billing]: https://cloud.google.com/billing/docs/how-to/modify-project
[logs-viewer]: https://console.cloud.google.com/logs/query
[project-selector]: https://console.cloud.google.com/projectselector2/home/dashboard
[provider-issue]: https://github.com/hashicorp/terraform-provider-google/issues/6782
[region-and-zone]: https://cloud.google.com/compute/docs/regions-zones#locations
