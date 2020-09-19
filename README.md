# airtap-sauce

**Sauce Labs [browser provider](https://github.com/airtap/browser-provider). List and run browsers on [Sauce Labs](https://saucelabs.com/).**

[![npm status](http://img.shields.io/npm/v/airtap-sauce.svg)](https://www.npmjs.org/package/airtap-sauce)
[![node](https://img.shields.io/node/v/airtap-sauce.svg)](https://www.npmjs.org/package/airtap-sauce)
[![Sauce Labs integration status](https://github.com/airtap/sauce/workflows/Sauce%20Labs/badge.svg)](https://github.com/airtap/sauce/actions?query=workflow%3A%22Sauce+Labs%22)
[![Lint](https://github.com/airtap/sauce/workflows/Lint/badge.svg)](https://github.com/airtap/sauce/actions?query=workflow%3ALint)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

## Table of Contents

<details><summary>Click to expand</summary>

- [Usage](#usage)
  - [Programmatic](#programmatic)
  - [With Airtap](#with-airtap)
- [API](#api)
  - [`Sauce([options])`](#sauceoptions)
  - [Browser options](#browser-options)
- [Install](#install)
- [Big Thanks](#big-thanks)
- [License](#license)

</details>

## Usage

### Programmatic

```js
const Sauce = require('airtap-sauce')
const provider = new Sauce()

// Get a list of desired browsers
const wanted = [{ name: 'android', version: '5..latest' }]
const manifests = await provider.manifests(wanted)

// Instantiate a browser
const target = { url: 'http://localhost:3000' }
const browser = provider.browser(manifests[0], target)

await browser.open()
```

### With [Airtap](https://github.com/airtap/airtap)

```yaml
providers:
  - airtap-sauce

browsers:
  - name: android
    version: 5..latest
```

This provider also exposes `platform`, `capabilities` and [more properties](https://github.com/airtap/sauce-browsers) to match on:

```yaml
browsers:
  - name: chrome
    version: 69
    platform: mac 10.15
```

## API

### `Sauce([options])`

Constructor. Returns an instance of [`browser-provider`](https://github.com/airtap/browser-provider). Options:

- `username` (string): defaults to `process.env.SAUCE_USERNAME`
- `key` (string): defaults to `process.env.SAUCE_ACCESS_KEY`
- `hostname` (string): defaults to `'ondemand.saucelabs.com'`
- `port` (number): defaults to `80`
- `tunnel` (object): custom options for [`sauce-connect-launcher`](https://github.com/bermi/sauce-connect-launcher)

In Airtap these can be set like so:

```yaml
providers:
  - airtap-sauce:
      tunnel:
        connectRetries: 10
```

### Browser options

- `name` (string): name for Sauce Labs job, defaults to browser manifest name
- `profile` (object, only on Firefox): custom user profile to programmatically configure anything that can be changed in `about:config`
- `capabilities` (object): custom Selenium capabilities.

In Airtap these can be set like so:

```yaml
browsers:
  - name: firefox
    options:
      name: my-custom-job-name
      profile:
        webgl.force-enabled: true
```

## Install

With [npm](https://npmjs.org) do:

```
npm install airtap-sauce
```

## Big Thanks

Cross-browser Testing Platform and Open Source ♥ Provided by [Sauce Labs](https://saucelabs.com).

[![Sauce Labs logo](./sauce-labs.svg)](https://saucelabs.com)

## License

[MIT](LICENSE) © 2018 [Roman Shtylman](https://github.com/defunctzombie), [Zuul contributors](https://github.com/defunctzombie/zuul/graphs/contributors) and [Airtap contributors](https://github.com/airtap)
