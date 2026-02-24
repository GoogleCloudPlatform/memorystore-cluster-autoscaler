<br />
<p align="center">
  <h2 align="center">OSS Memorystore Cluster Autoscaler</h2>
  <img alt="Autoscaler" src="../resources/hero-image.jpg">

  <p align="center">
    <!-- In one sentence: what does the code in this directory do? -->
    Automatically increase or reduce the size of Memorystore clusters.
    <br />
    <a href="../README.md">Home</a>
    ·
    <a href="poller/README.md">Poller component</a>
    ·
    <a href="scaler/README.md">Scaler component</a>
  </p>
</p>

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Overview](#overview)

## Overview

This directory contains the source code for the two main components of the
autoscaler: the Poller and the Scaler:

- [Poller](poller/README.md)
- [Scaler](scaler/README.md)

As well as the Forwarder, which is used in the
[distributed deployment model][distributed-docs]:

- [Forwarder](forwarder/README.md)

[distributed-docs]: ../terraform/cloud-functions/distributed/README.md
