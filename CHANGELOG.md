# Changelog

## [3.1.0](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/compare/v3.0.0...v3.1.0) (2026-02-24)


### Features

* prevent scaling in to less than 1/3 of current size ([#126](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/126)) ([315a743](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/315a7435978812660f63d341058e809ab84c1a1f))


### Bug Fixes

* **docs:** correct casing for VALKEY engine variable in Readme ([a63e60f](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/a63e60f57566e737f888a270fac4632fd91a891c))

## [3.0.0](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/compare/v2.0.1...v3.0.0) (2025-03-18)


### ⚠ BREAKING CHANGES

* This modifies the ID used to identify clusters in the Autoscaler state storage layer. When this version is first deployed to an existing environment that is managed by the Autoscaler, it may trigger a single additional scaling operation during a cooldown period or while a previously started scaling operation is ongoing.

### Features

* add disambiguation for Valkey/Redis in storage layer ([#77](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/77)) ([4995c3d](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/4995c3d138e84c9f31e19633ece5c3f076c78300))
* add Valkey support ([#71](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/71)) ([4d3e76d](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/4d3e76dbf0c0f1506530337b22b7439f38b99fcc))


### Bug Fixes

* bump jsonpath-plus from 10.2.0 to 10.3.0 ([#73](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/73)) ([6ace5dc](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/6ace5dca9ab70efa9fc3d931cab0e3a85d3b1506))
* bump undici from 6.20.1 to 6.21.1 ([#75](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/75)) ([070da15](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/070da1542336cbca6cca86fd7d1b94f62436891e))
* configure terminal as noninteractive ([#64](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/64)) ([5a7b029](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/5a7b0295e97a53231a9387d0adfd9c1bc10258fb))
* **deps:** security updates ([#87](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/87)) ([61cd121](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/61cd12150e6501c7ebd26df330795df61c86237f))
* **deps:** update dependency axios to v1.8.3 [security] ([#89](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/89)) ([b16e8cc](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/b16e8cce305d01599ed1626e8bada05b7b372eed))
* **deps:** update dependency go to v1.24.1 ([#46](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/46)) ([17e9ce6](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/17e9ce61c111db26e48feecb1a851e84ac07a3ca))
* **deps:** update dependency googleapis to v146 ([#76](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/76)) ([f98a9ed](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/f98a9ed360f0f8f71d579123dc1d0c1914e41d74))
* **deps:** update dependency markdown-link-check to v3.13.7 ([#88](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/88)) ([29c54d2](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/29c54d20619916b0259c2028b2a226dd03c6b40f))
* **deps:** update golang-modules ([#58](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/58)) ([7c6e004](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/7c6e004f56a67611581973bceef412fd587118b1))
* **deps:** update module golang.org/x/net to v0.36.0 [security] ([#86](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/86)) ([8f99efe](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/8f99efe36f2c11fb5e52b4c5fb688664e98846ea))
* **deps:** update npm-packages ([#59](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/59)) ([654c8ce](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/654c8ce9e03f27db7b9dc4fe47ee2e72e34e73c2))
* **deps:** update npm-packages ([#63](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/63)) ([b3afd72](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/b3afd7212ae3137317d53b216a204c58e89089f7))
* **deps:** update npm-packages ([#81](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/81)) ([a2bfd23](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/a2bfd23486fc5f1c5a03bc15fc0039360adccf8f))
* **deps:** update terraform ([#60](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/60)) ([72e6fa9](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/72e6fa950ea559083fdd4c6d1187bd367d7ea4dd))
* **deps:** update terraform google to v6.24.0 ([#82](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/82)) ([c1f0ddb](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/c1f0ddb786136ed47ca74bc3e86479db3d37696c))
* **deps:** update terraform terraform-google-modules/kubernetes-engine/google to v36 ([#70](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/70)) ([fe26d75](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/fe26d75658afafdf6eb7c6f8bd7181122121087b))

## [2.0.1](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/compare/v2.0.0...v2.0.1) (2024-12-23)


### Bug Fixes

* **deps:** update module golang.org/x/net to v0.33.0 [security] ([#56](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/56)) ([a4d41fa](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/a4d41fa7d222bf769de4a40f7f658cd5dd070e6b))
* **deps:** update npm-packages ([#54](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/54)) ([d72f9f9](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/d72f9f9a7d60dc328412602c02987d2e5e86a285))
* **deps:** update terraform ([#55](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/55)) ([e8f8f6d](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/e8f8f6dafdd070a76b4ec457bb19ad606f7d346e))

## [2.0.0](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/compare/v1.0.0...v2.0.0) (2024-12-20)


### ⚠ BREAKING CHANGES

* Because this modifies the requirements for how a project must be configured, this is considered a breaking change as it cannot be exhaustively tested across all combinations of projects and Terraform provider versions.
* While v18 remains in maintenance until April 2025, several dependencies no longer support node 18.

### Features

* remove App Engine, add Firestore configurability ([#51](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/51)) ([d358bac](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/d358bacc9c025992bd2e6b62fc70e309e4507f55))
* remove support for node v18 ([#36](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/36)) ([cfe1180](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/cfe1180ff5e7038730050c0067fbb3a1e9d179e8))
* support 1, 2, and 4 shard clusters ([#32](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/32)) ([7c50433](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/7c5043308f9e01071fcf5c6a79573084b059937b))
* support custom metrics ([#42](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/42)) ([0144856](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/0144856bf7ba03c068c751d5e47329110cdef8be))


### Bug Fixes

* **deps:** add missing golang sums ([#48](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/48)) ([88d9975](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/88d9975e81cfdeb21d9c32c45a69bd2f87bb2f15))
* **deps:** update golang-modules ([#47](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/47)) ([5c86ebd](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/5c86ebd646e56dabbcc77b289c3c735fb5f9e31a))
* **deps:** update markdownlint-cli to address vulnerability ([#38](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/38)) ([165b5d7](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/165b5d795030ab24dcf1946414ba99c29c2e9b38))
* **deps:** update module golang.org/x/crypto to v0.31.0 [security] ([#45](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/45)) ([2081dc7](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/2081dc782908ee27f8b517494e2d28aee7c4a916))
* **deps:** update npm-packages ([#15](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/15)) ([e33d14e](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/e33d14ea6c5c5ef769821683fbb3e91ee98165f5))
* **deps:** update npm-packages ([#27](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/27)) ([b7c7b4f](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/b7c7b4ffe73a2d9b3ab76b2d6aaba04a645397a2))
* **deps:** update npm-packages ([#41](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/41)) ([c749650](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/c7496507f5de5fdcbf3bd4ef3ec82dc5911aba87))
* **deps:** update npm-packages ([#49](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/49)) ([e126351](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/e126351b5bae367c9c50f7534148fa20935a2323))
* **deps:** update terraform ([#35](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/35)) ([4d67a39](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/4d67a39072a566bf8680435838b6c8ef7d26600c))
* **deps:** update terraform google to v6.10.0 ([#16](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/16)) ([29ed251](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/29ed251f0439623a9f5e650faceba212dbf0882b))
* **deps:** update terraform google to v6.11.1 ([#31](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/31)) ([a8e223c](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/a8e223c4c63f7a54adcc8c19e411896c0a16d12e))
* **deps:** update terraform google to v6.12.0 ([#34](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/34)) ([04814bb](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/04814bbf49b3c9f2426c93cb8e62f1b3f0821e7f))
* **deps:** update terraform terraform-google-modules/kubernetes-engine/google to v35 ([#50](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/issues/50)) ([79e7f22](https://github.com/GoogleCloudPlatform/memorystore-cluster-autoscaler/commit/79e7f2263d54898dee7f48b68c2d162f73a2bbae))

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
