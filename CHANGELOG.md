# Changelog

## [6.1.0](https://github.com/netlify/blobs/compare/v6.0.1...v6.1.0) (2023-11-14)


### Features

* support API access in local server ([#108](https://github.com/netlify/blobs/issues/108)) ([bea8874](https://github.com/netlify/blobs/commit/bea88742cdd868ef797ef88bf63fec778307d504))
* support HEAD requests in local server ([#109](https://github.com/netlify/blobs/issues/109)) ([25ff62c](https://github.com/netlify/blobs/commit/25ff62c054c3fe6f223abd8523ae1af8d76295f3))


### Bug Fixes

* update repo url in package.json ([#106](https://github.com/netlify/blobs/issues/106)) ([84e4e58](https://github.com/netlify/blobs/commit/84e4e58d06dd4d890e10a1e41285fbc567194ae5))

## [6.0.1](https://github.com/netlify/blobs/compare/v6.0.0...v6.0.1) (2023-11-13)


### Bug Fixes

* successful delete returns 204 ([#104](https://github.com/netlify/blobs/issues/104)) ([da0ea31](https://github.com/netlify/blobs/commit/da0ea3145489d2cb93fdeb32be6db33af6049869))

## [6.0.0](https://github.com/netlify/blobs/compare/v5.0.0...v6.0.0) (2023-11-10)


### ⚠ BREAKING CHANGES

* return `AsyncIterator` for `list()` ([#102](https://github.com/netlify/blobs/issues/102))

### Features

* return `AsyncIterator` for `list()` ([#102](https://github.com/netlify/blobs/issues/102)) ([f951513](https://github.com/netlify/blobs/commit/f951513a33d0009e863752e95d801486c410c4d7))

## [5.0.0](https://github.com/netlify/blobs/compare/v4.2.0...v5.0.0) (2023-11-09)


### ⚠ BREAKING CHANGES

* remove `fresh` property from metadata result ([#99](https://github.com/netlify/blobs/issues/99))
* return boolean from `delete()` ([#98](https://github.com/netlify/blobs/issues/98))
* disallow setting an object as a stream ([#96](https://github.com/netlify/blobs/issues/96))

### Features

* disallow setting an object as a stream ([#96](https://github.com/netlify/blobs/issues/96)) ([1c8f668](https://github.com/netlify/blobs/commit/1c8f668e27210c92a564efb45a3ae6bc7a0c518b))
* remove `fresh` property from metadata result ([#99](https://github.com/netlify/blobs/issues/99)) ([a0f337a](https://github.com/netlify/blobs/commit/a0f337a81a30c19804737da6ea62f67dd015ca6c))
* remove return value of `delete()` ([#100](https://github.com/netlify/blobs/issues/100)) ([b0c607b](https://github.com/netlify/blobs/commit/b0c607b1c4742f2f4d32b709c1df5ee4cb14d383))
* return boolean from `delete()` ([#98](https://github.com/netlify/blobs/issues/98)) ([a566287](https://github.com/netlify/blobs/commit/a566287619a97a3ce146768225284fecc0910be2))

## [4.2.0](https://github.com/netlify/blobs/compare/v4.1.0...v4.2.0) (2023-11-07)


### Features

* add `getMetadata` method ([#90](https://github.com/netlify/blobs/issues/90)) ([0327476](https://github.com/netlify/blobs/commit/03274763dc0afc9fdbe3981685f8eba1882bae4a))


### Bug Fixes

* delete status code checking ([#93](https://github.com/netlify/blobs/issues/93)) ([ea3d754](https://github.com/netlify/blobs/commit/ea3d754fb918b25490c6b924806a3bf8ae378120))
* internal vs external metadata headers ([#92](https://github.com/netlify/blobs/issues/92)) ([de41f9e](https://github.com/netlify/blobs/commit/de41f9e6e59a50426338f504270a6b37aa8e3904))

## [4.1.0](https://github.com/netlify/blobs/compare/v4.0.0...v4.1.0) (2023-11-02)


### Features

* load context from global variable ([#87](https://github.com/netlify/blobs/issues/87)) ([cbb5c3d](https://github.com/netlify/blobs/commit/cbb5c3d3fb92d2680865831926d11af8a9ac2103))

## [4.0.0](https://github.com/netlify/blobs/compare/v3.3.0...v4.0.0) (2023-10-26)


### ⚠ BREAKING CHANGES

* validate keys and store names ([#80](https://github.com/netlify/blobs/issues/80))

### Features

* add `list()` method ([#82](https://github.com/netlify/blobs/issues/82)) ([00db5ff](https://github.com/netlify/blobs/commit/00db5ff2cfb1e1780eadd4f1605f76f6519f65d2))
* support `list()` in local server ([#83](https://github.com/netlify/blobs/issues/83)) ([9fc8456](https://github.com/netlify/blobs/commit/9fc845604fc20189a18fff5add075d542fbddc8e))
* update validation rules ([#84](https://github.com/netlify/blobs/issues/84)) ([7218bb5](https://github.com/netlify/blobs/commit/7218bb5865770f7a83967613c378d4b7bed9df3c))
* validate keys and store names ([#80](https://github.com/netlify/blobs/issues/80)) ([af867f8](https://github.com/netlify/blobs/commit/af867f87225f2c1e10192d3a4403b76d49c6cb56))

## [3.3.0](https://github.com/netlify/blobs/compare/v3.2.0...v3.3.0) (2023-10-23)


### Features

* add local server ([#75](https://github.com/netlify/blobs/issues/75)) ([dc209d7](https://github.com/netlify/blobs/commit/dc209d715ca87d3b774784fde3cf02ce0e3b0faf))
* add support for conditional requests ([#76](https://github.com/netlify/blobs/issues/76)) ([82df6ad](https://github.com/netlify/blobs/commit/82df6ad0889ea29fd6191133c8a319e7e458ab7d))
* encode store name + check for `fetch` ([#73](https://github.com/netlify/blobs/issues/73)) ([0cb0b36](https://github.com/netlify/blobs/commit/0cb0b3654b164e327e9602ad229bfdd69f0cab45))

## [3.2.0](https://github.com/netlify/blobs/compare/v3.1.0...v3.2.0) (2023-10-19)


### Features

* add support for arbitrary metadata ([#70](https://github.com/netlify/blobs/issues/70)) ([9b2a4df](https://github.com/netlify/blobs/commit/9b2a4dfe2adbb028c5cbfbe814e53e010a58be19))


### Bug Fixes

* couple of small fixes ([#72](https://github.com/netlify/blobs/issues/72)) ([edadf1c](https://github.com/netlify/blobs/commit/edadf1c6288ae0c55e48cc196e2476e3ef95cc0c))

## [3.1.0](https://github.com/netlify/blobs/compare/v3.0.0...v3.1.0) (2023-10-18)


### Features

* add `getDeployStore` method ([#68](https://github.com/netlify/blobs/issues/68)) ([5135f3d](https://github.com/netlify/blobs/commit/5135f3d3dfaf55c48c51e8b115ab64c8728e73aa))

## [3.0.0](https://github.com/netlify/blobs/compare/v2.2.0...v3.0.0) (2023-10-17)


### ⚠ BREAKING CHANGES

* add `getStore` method ([#58](https://github.com/netlify/blobs/issues/58))

### Features

* add `getStore` method ([#58](https://github.com/netlify/blobs/issues/58)) ([6507e87](https://github.com/netlify/blobs/commit/6507e87cdebe110b6e5145c7c69f3c1a16b066ee))

## [2.2.0](https://github.com/netlify/blobs/compare/v2.1.1...v2.2.0) (2023-10-13)


### Features

* add package.json to export map ([#64](https://github.com/netlify/blobs/issues/64)) ([3ea080e](https://github.com/netlify/blobs/commit/3ea080e9cdde95f14b8d372181be78b208727d0b))

## [2.1.1](https://github.com/netlify/blobs/compare/v2.1.0...v2.1.1) (2023-10-13)


### Bug Fixes

* adjust export map to be actually importable ([#62](https://github.com/netlify/blobs/issues/62)) ([1bedfde](https://github.com/netlify/blobs/commit/1bedfde6c5ddb368b5789bc1766f7918eac19a8f))

## [2.1.0](https://github.com/netlify/blobs/compare/v2.0.0...v2.1.0) (2023-10-11)


### Features

* export commonjs and esm from package ([#59](https://github.com/netlify/blobs/issues/59)) ([38b9c81](https://github.com/netlify/blobs/commit/38b9c81c280a2bc3b7a348103d94b98fd44f67e9))

## [2.0.0](https://github.com/netlify/blobs/compare/v1.6.1...v2.0.0) (2023-09-25)


### ⚠ BREAKING CHANGES

* use URI-encoded keys ([#50](https://github.com/netlify/blobs/issues/50))

### Features

* use URI-encoded keys ([#50](https://github.com/netlify/blobs/issues/50)) ([fd8e1c6](https://github.com/netlify/blobs/commit/fd8e1c6b0f30714e0e0649a22b0b615bc48dbabe))

## [1.6.1](https://github.com/netlify/blobs/compare/v1.6.0...v1.6.1) (2023-09-21)


### Bug Fixes

* workaround for a cloudfront issue where it throws on a 403 ([c0fd160](https://github.com/netlify/blobs/commit/c0fd160d49c95205b577b031e3b3aee622e003af))

## [1.6.0](https://github.com/netlify/blobs/compare/v1.5.0...v1.6.0) (2023-07-31)


### Features

* add `setFiles()` method ([#28](https://github.com/netlify/blobs/issues/28)) ([fd769de](https://github.com/netlify/blobs/commit/fd769dec65a215bf3de74dcf279ab2484e4f3a70))


### Bug Fixes

* **deps:** update dependency esbuild to v0.18.17 ([ad0d7e3](https://github.com/netlify/blobs/commit/ad0d7e3b2757dabad1c1e43e2f9a912317b72d8f))

## [1.5.0](https://github.com/netlify/blobs/compare/v1.4.0...v1.5.0) (2023-07-27)


### Features

* add `setFile()` method ([#26](https://github.com/netlify/blobs/issues/26)) ([b8dc848](https://github.com/netlify/blobs/commit/b8dc848aa74adc3c8d37314a0b6c00a4e2c0e28a))
* add retry logic ([#27](https://github.com/netlify/blobs/issues/27)) ([c824f0d](https://github.com/netlify/blobs/commit/c824f0d6db06b87bed9e9509ca0301d72d307b67))
* build with esbuild ([#22](https://github.com/netlify/blobs/issues/22)) ([23c6576](https://github.com/netlify/blobs/commit/23c6576dd336c0d87fbc32608c30fbcbd625139f))
* update `get` signature ([#23](https://github.com/netlify/blobs/issues/23)) ([e817d59](https://github.com/netlify/blobs/commit/e817d590c1bea56925147571aa1506988fee9905))

## [1.4.0](https://github.com/netlify/blobs/compare/v1.3.0...v1.4.0) (2023-07-20)


### Features

* support TTL in `setJSON` method ([#17](https://github.com/netlify/blobs/issues/17)) ([392c9e1](https://github.com/netlify/blobs/commit/392c9e1cb00ae32622d32e36c06475706a9bcdf0))

## [1.3.0](https://github.com/netlify/blobs/compare/v1.2.0...v1.3.0) (2023-07-19)


### Features

* throw error on missing config properties ([#15](https://github.com/netlify/blobs/issues/15)) ([10f30a8](https://github.com/netlify/blobs/commit/10f30a89ee3c8614b3a7f8a06a4a4672b9c83937))

## [1.2.0](https://github.com/netlify/blobs/compare/v1.1.0...v1.2.0) (2023-07-18)


### Miscellaneous Chores

* release 1.2.0 ([88173ae](https://github.com/netlify/blobs/commit/88173aeaba04cc90c3a9b9c47fc4fbc7e2f2a99c))

## [1.1.0](https://github.com/netlify/blobs/compare/v1.0.0...v1.1.0) (2023-07-18)


### Features

* throw when API returns an error code ([#12](https://github.com/netlify/blobs/issues/12)) ([a6573b2](https://github.com/netlify/blobs/commit/a6573b2acb218e9bb12cdde3b1a83d64214aa864))

## 1.0.0 (2023-07-18)


### Features

* return `null` on 404 ([614e214](https://github.com/netlify/blobs/commit/614e21463f55c13a30462f3c575acdfa0a5ba299))
* update `get` signature ([33b774c](https://github.com/netlify/blobs/commit/33b774c49aadfbc99391d96b357c27e69a4a4e93))
* various small updates ([#10](https://github.com/netlify/blobs/issues/10)) ([30e9d4b](https://github.com/netlify/blobs/commit/30e9d4b999b559cccb342db5a511ef1f54a5aadd))


### Bug Fixes

* fix linting problems ([4cceed2](https://github.com/netlify/blobs/commit/4cceed26784deac5865b1c9f2234b549f0c613d7))
