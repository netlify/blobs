# Changelog

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
