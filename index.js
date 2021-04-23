'use strict'

const wd = require('wd')
const FirefoxProfile = require('firefox-profile')
const uuid = require('uuid').v4
const Provider = require('browser-provider')
const Browser = require('abstract-browser')
const sauceBrowsers = require('airtap-sauce-browsers').callback
const sauceConnectLauncher = require('sauce-connect-launcher')
const transient = require('transient-error')
const buildNumber = require('build-number')
const debug = require('debug')('airtap-sauce')
const debugTunnel = require('debug')('airtap-sauce:sc')
const fs = require('fs')

const kHostname = Symbol('kHostname')
const kPort = Symbol('kPort')
const kUsername = Symbol('kUsername')
const kAccessKey = Symbol('kAccessKey')
const kTunnelOptions = Symbol('kTunnelOptions')
const kTunnelIdentifier = Symbol('kTunnelIdentifier')
const kProvider = Symbol('kProvider')
const kWebdriver = Symbol('kWebdriver')
const kInitWebdriver = Symbol('kInitWebdriver')
const kPing = Symbol('kPing')
const kPingTimer = Symbol('kPingTimer')

class SauceProvider extends Provider {
  constructor (options) {
    super(options)

    this[kHostname] = this.options.hostname || 'ondemand.saucelabs.com'
    this[kPort] = parseInt(this.options.port || 80, 10)
    this[kUsername] = process.env.SAUCE_USERNAME || this.options.username
    this[kAccessKey] = process.env.SAUCE_ACCESS_KEY || this.options.key
    this[kTunnelOptions] = this.options.tunnel || {}
    this[kTunnelIdentifier] = null
  }

  _manifests (callback) {
    sauceBrowsers(callback)
  }

  _browser (manifest, target) {
    return new SauceBrowser(this, manifest, target)
  }

  _tunnel ({ domains }, callback) {
    // If the Travis Sauce Connect addon is running, use that. Is there a
    // better way to detect this (e.g. some environment variable)?
    if (process.env.TRAVIS_JOB_NUMBER && fs.existsSync('/home/travis/sauce-connect.log')) {
      debug('using Travis Sauce Connect')
      this[kTunnelIdentifier] = process.env.TRAVIS_JOB_NUMBER
      return process.nextTick(callback)
    } else if (!this[kUsername] || !this[kAccessKey]) {
      this[kTunnelIdentifier] = null
      return process.nextTick(callback, new NoCredentialsError())
    }

    // Required for concurrent tunnels
    this[kTunnelIdentifier] = 'airtap-sauce-' + uuid()

    const tunnelOptions = {
      // Disable SSL bumping by default (slower, but less issues)
      noSslBumpDomains: 'all',

      // Only route the specified domains through the tunnel
      tunnelDomains: domains,

      // Enable retries
      connectRetries: 3,
      connectRetryTimeout: 5e3,
      downloadRetries: 3,
      downloadRetryTimeout: 5e3,

      // TODO: camelCase
      ...this[kTunnelOptions],

      username: this[kUsername],
      accessKey: this[kAccessKey],
      tunnelIdentifier: this[kTunnelIdentifier],
      logger: debugTunnel
    }

    sauceConnectLauncher(tunnelOptions, (err, sauceConnect) => {
      if (err) return callback(err)

      debug('sauce connect tunnel: %s', this[kTunnelIdentifier])
      callback(null, sauceConnect)
    })
  }
}

module.exports = SauceProvider

class SauceBrowser extends Browser {
  constructor (provider, manifest, target) {
    super(manifest, target)

    this[kWebdriver] = null
    this[kPingTimer] = null
    this[kProvider] = provider
  }

  _open (cb) {
    debug('manifest: %O', this.manifest)

    const hostname = this[kProvider][kHostname]
    const port = this[kProvider][kPort]
    const username = this[kProvider][kUsername]
    const key = this[kProvider][kAccessKey]

    if (!username || !key) {
      return process.nextTick(cb, new NoCredentialsError())
    }

    const webdriver = wd.remote(hostname, port, username, key)

    // Has no timeout by default, which can put us in limbo.
    webdriver.configureHttp({ timeout: 60e3 })

    const options = this.manifest.options
    const isAppium = this.manifest.automationBackend === 'appium'
    const type = isAppium ? 'appium' : 'legacy'
    const caps = { ...this.manifest.capabilities[type], ...options.capabilities }

    if (Object.keys(caps).length === 0) {
      return process.nextTick(cb, new Error('Capabilities are required'))
    }
    const testName = options.name || this.manifest.name
    const build = buildNumber() || process.env.GITHUB_RUN_ID
    const tunnelIdentifier = this[kProvider][kTunnelIdentifier]
    const appiumVersion = isAppium && process.env.SAUCE_APPIUM_VERSION

    if (testName) caps.name = testName
    if (build) caps.build = build
    if (tunnelIdentifier) caps.tunnelIdentifier = tunnelIdentifier
    if (appiumVersion) caps.appiumVersion = appiumVersion

    if (this.manifest.name === 'firefox' && options.profile) {
      const fp = new FirefoxProfile()
      const profile = options.profile
      const extensions = profile.extensions

      for (const preference in profile) {
        if (preference !== 'extensions') {
          fp.setPreference(preference, profile[preference])
        }
      }

      fp.addExtensions(extensions || [], () => {
        fp.encoded((zippedProfile) => {
          caps.firefox_profile = zippedProfile
          this[kInitWebdriver](webdriver, caps, cb)
        })
      })
    } else {
      this[kInitWebdriver](webdriver, caps, cb)
    }
  }

  // TODO: use cleanError() and don't retry on all errors
  [kInitWebdriver] (webdriver, caps, cb) {
    webdriver.init(caps, (err, sessionId, actualCaps) => {
      if (err) {
        if (err.data) {
          err.message += ': ' + err.data.split('\n').slice(0, 1)
        }

        return cb(transient(err))
      }

      debug('webdriver session: %s', sessionId)
      debug('actual capabilities: %O', actualCaps)

      webdriver.get(this.target.url, (err) => {
        if (err) {
          return webdriver.quit(() => {
            cb(transient(err))
          })
        }

        // Don't set until we have a session (that we can quit)
        this[kWebdriver] = webdriver
        this[kPing]()

        cb()
      })
    })
  }

  // Periodically send a dummy command to prevent timing out and to
  // catch Sauce Labs operational issues as well as user cancelation.
  [kPing] () {
    const timer = this[kPingTimer] = setInterval(() => {
      this[kWebdriver].url((err) => {
        if (this[kPingTimer] !== timer) return
        if (err) this.emit('error', cleanError(err))
      })
    }, 30e3)
  }

  _setStatus (ok, callback) {
    if (!this[kWebdriver]) return callback()

    this[kWebdriver].sauceJobStatus(ok, (err) => {
      if (err) debug('setting job status failed: %O', cleanError(err))
      callback()
    })
  }

  _close (cb) {
    clearInterval(this[kPingTimer])
    this[kPingTimer] = null

    if (this[kWebdriver]) {
      const webdriver = this[kWebdriver]
      this[kWebdriver] = null
      webdriver.quit(cb)
    } else {
      cb()
    }
  }
}

function cleanError (err) {
  // The `wd` module doesn't parse these error responses, it expects JSON.
  if (/not json response/i.test(err.message) && typeof err.data === 'string') {
    if (/has already finished/i.test(err.data)) {
      return new Error('Sauce Labs test finished prematurely or was canceled by user')
    } else if (/internal server error/i.test(err.data)) {
      // Retry on Sauce Labs operational issues
      return transient(new Error(err.data))
    } else if (err.data) {
      return new Error(err.data)
    }
  }

  return err
}

class NoCredentialsError extends Error {
  constructor () {
    super('Sauce Labs credentials are required')

    Object.defineProperty(this, 'name', { value: 'NoCredentialsError' })
    Object.defineProperty(this, 'expected', { value: true })
  }
}
