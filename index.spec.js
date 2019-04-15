// Unit tests for package dwd-csv-helper

'use strict'

// Load modules
const _ = require('lodash')
const path = require('path')
const it = require('mocha').it
const describe = require('mocha').describe
const before = require('mocha').before
const assert = require('chai').assert
const moment = require('moment')

// Load functions to be tested
const readTimeseriesDataMosmix = require('./index.js').readTimeseriesDataMosmix

// Configuration
const TEST_DATA_BASE = path.join(__dirname, 'test', 'data')

// Define unit tests
describe('Unit Tests', function () {
  describe('async function readTimeseriesDataMosmix', function () {
    it('should extract timeseries from .csv-file', async function () {
      const timeseries = await readTimeseriesDataMosmix(
        path.join(TEST_DATA_BASE, 'local_forecasts'),
        moment.utc([2018, 8, 11, 3]).valueOf(), // 2018-09-11, 03:00 UTC in ms
        '01001'
      )
    })

    it('should extract timeseries from .kmz-file', async function () {
      const timeseries = await readTimeseriesDataMosmix(
        path.join(TEST_DATA_BASE, 'local_forecasts'),
        moment.utc([2018, 8, 12, 3]).valueOf(), // 2018-09-12, 03:00 UTC in ms
        '01001'
      )
    })
  })
})
