# Changelog

## [2.0.0](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/compare/v1.0.0...v2.0.0) (2024-12-05)


### ⚠ BREAKING CHANGES

* While v18 remains in maintenance until April 2025, several dependencies no longer support node 18.

### Features

* remove support for node v18 ([#36](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/36)) ([cfe1180](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/cfe1180ff5e7038730050c0067fbb3a1e9d179e8))
* support 1, 2, and 4 shard clusters ([#32](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/32)) ([7c50433](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/7c5043308f9e01071fcf5c6a79573084b059937b))


### Bug Fixes

* **deps:** update markdownlint-cli to address vulnerability ([#38](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/38)) ([165b5d7](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/165b5d795030ab24dcf1946414ba99c29c2e9b38))
* **deps:** update npm-packages ([#15](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/15)) ([e33d14e](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/e33d14ea6c5c5ef769821683fbb3e91ee98165f5))
* **deps:** update npm-packages ([#27](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/27)) ([b7c7b4f](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/b7c7b4ffe73a2d9b3ab76b2d6aaba04a645397a2))
* **deps:** update terraform google to v6.10.0 ([#16](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/16)) ([29ed251](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/29ed251f0439623a9f5e650faceba212dbf0882b))
* **deps:** update terraform google to v6.11.1 ([#31](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/31)) ([a8e223c](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/a8e223c4c63f7a54adcc8c19e411896c0a16d12e))
* **deps:** update terraform google to v6.12.0 ([#34](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/34)) ([04814bb](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/04814bbf49b3c9f2426c93cb8e62f1b3f0821e7f))

## 1.0.0 (2024-11-07)


### Features

* initial commit ([7b73d13](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/7b73d13914d795d57c3d984ffbb4163687a189fc))
* prepare Terraform docs for GA ([#20](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/20)) ([9b80d1e](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/9b80d1ebcb5364df88918d4cfeae37ee27cb4222))


### Bug Fixes

* **deps:** update json-rules-engine to address npm audit ([#2](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/2)) ([b6803fa](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/b6803fa53505cef4fea3f87ccc805e17d9ee4262))
* **deps:** update terraform module versions ([#8](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/8)) ([5a8df32](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/5a8df328e4b022b7e904996673b012f8af387e36))
* **tests:** remove use of rewire from counters_test.js ([#4](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/4)) ([99e4dc3](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/99e4dc33646a07b2b480423f1b37a0a89c0fb5f5))


### Miscellaneous Chores

* add release-please config ([#6](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/6)) ([93b02f0](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/93b02f08f9f205bbdabda8967ce99bf2aa3b8466))
