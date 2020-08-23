'use strict'

const test = require('tape')
const integration = require('airtap/test/integration')
const Provider = require('.')

integration(test, Provider, {
  wanted: [
    { name: 'chrome' },
    { name: 'ff' },
    { name: 'ie', version: '9..11' },
    { name: 'edge', version: ['oldest', 'latest'] },
    { name: 'safari' },
    { name: 'ios safari' },
    { name: 'android browser', version: '5..6' },
    { name: 'chrome for android' }
  ],
  test: {
    // Use buffer@4 for these tests, so we can target IE < 11
    browserify: [{ require: 'buffer/', expose: 'buffer' }]
  }
})
