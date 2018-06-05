'use strict'

const _ = require('lodash')
const moment = require('moment')
const path = require('path')
const fs = require('fs-extra')

const COLUMN_SEPARATOR = ';'


function deriveCsvFilePath(csvBasePath, type, timestamp, stationId) {
  let formatString
  let extension

  if (type === 'REPORT') {
    formatString = 'YYYYMMDD'
    extension = 'BEOB'
  } else {
    formatString = 'YYYYMMDDHH'
    extension = 'MOSMIX'
  }

  const dayDateTimeString = moment.utc(timestamp).format(formatString)
  const fileName = stationId + '-' + extension + '.csv'

  return path.join(csvBasePath, dayDateTimeString, fileName)
}

function parseCsvFile(fileContent) {
  fileContent = fileContent.replace(/\r\n/g, '\n')

  const lines = fileContent.split('\n')

  let headings = []
  let values = []
  _.forEach(lines, (line, index) => {
    if (line === '') {
      return
    }

    const columns = line.split(COLUMN_SEPARATOR)
    if (index === 0) {
      headings = columns
      return
    }

    if (index < 3) {
      return
    }

    if (index === 3) {
      _.forEach(columns, () => {
        values.push([])
      })
    }

    _.forEach(columns, (value, index) => {
      if (value === '---') {
        values[index].push(null)
      } else {
        values[index].push(parseFloat(value.replace(',', '.')))
      }
    })

  })

  const result = {}

  _.forEach(values, (valueColumn, index) => {
    if (index < 2) {
      return
    }

    result[headings[index]] = valueColumn
  })

  _.forEach(values[0], (value, index) => {
    if (index === 0) {
      result['timestamp'] = []
    }
    const date = moment.utc(value, 'DD.MM.YYYY').valueOf()

    const time = moment.utc(values[1][index], 'HH:mm').year(1970).month(0).date(1).valueOf()
    result['timestamp'].push(date + time)
  })

  return result
}

async function readTimeseriesDataReport(csvBasePath, startTimestamp, endTimestamp, stationId) {
  let dayTimestamp = moment.utc(startTimestamp).startOf('day').valueOf()

  const result = {}
  while (dayTimestamp < endTimestamp) {
    const filePath = deriveCsvFilePath(csvBasePath, 'REPORT', dayTimestamp, stationId)
    const fileContent = await fs.readFile(filePath, {
      encoding: 'utf8'
    })

    const partialTimeseries = parseCsvFile(fileContent)

    const timestamps = partialTimeseries['timestamp']
    _.forEach(partialTimeseries, (values, key) => {
      if (key === 'timestamp') {
        return
      }

      if (_.isNil(result[key])) {
        result[key] = []
      }

      _.forEach(values, (value, index) => {
        if (timestamps[index] < startTimestamp || timestamps[index] >= endTimestamp) {
          return
        }
        result[key].push({timestamp: timestamps[index], value: value})
      })
    })
    dayTimestamp += 86400 * 1000
  }

  _.forEach(result, (item, key) => {
    result[key] = _.sortBy(item, (item) => {
      return item.timestamp
    })
  })
  return result
}

async function readTimeseriesDataMosmix(csvBasePath, startTimestamp, stationId) {
  let dayTimestamp = moment.utc(startTimestamp).startOf('day').add(6, 'hours').valueOf()

  const filePath = deriveCsvFilePath(csvBasePath, 'MOSMIX', dayTimestamp, stationId)
  const fileContent = await fs.readFile(filePath, {
    encoding: 'utf8'
  })

  const result = {}
  const partialTimeseries = parseCsvFile(fileContent)
  const timestamps = partialTimeseries['timestamp']
  _.forEach(partialTimeseries, (values, key) => {
    if (key === 'timestamp') {
      return
    }

    if (_.isNil(result[key])) {
      result[key] = []
    }

    _.forEach(values, (value, index) => {
      result[key].push({
        timestamp: timestamps[index],
        value: value
      })
    })
  })

  _.forEach(result, (item, key) => {
    result[key] = _.sortBy(item, (item) => {
      return item.timestamp
    })
  })
  return result
}

exports.parseCsvFile = parseCsvFile
exports.deriveCsvFilePath = deriveCsvFilePath
exports.readTimeseriesDataReport = readTimeseriesDataReport
exports.readTimeseriesDataMosmix = readTimeseriesDataMosmix

module.exports = exports