// dwd-csv-helper
//
// Copyright 2018 The dwd-csv-helper Developers. See the LICENSE file at
// the top-level directory of this distribution and at
// https://github.com/UdSAES/dwd-csv-helper/LICENSE
//
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
// REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
// AND FITNESS.IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
// INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
// LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
// OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
// PERFORMANCE OF THIS SOFTWARE.
//
// dwd-csv-helper may be freely used and distributed under the ISC license

'use strict'

const _ = require('lodash')
const moment = require('moment')
const path = require('path')
const fs = require('fs-extra')
const parser = require('xml-js')
const exec = require('child-process-promise').exec
const tmp = require('tmp-promise')

const COLUMN_SEPARATOR = ';'


function deriveCsvFilePath(csvBasePath, type, timestamp, stationId) {
  let formatString
  let contentType
  let extension
  let subdir

  if (type === 'REPORT') {
    formatString = 'YYYYMMDD'
    contentType = 'BEOB'
    extension = '.csv'
    subdir = 'poi'
  } else if (type === 'MOSMIX_KMZ'){
    formatString = 'YYYYMMDDHH'
    contentType = 'MOSMIX'
    extension = '.kmz'
    subdir = 'mos'
  } else {
    formatString = 'YYYYMMDDHH'
    contentType = 'MOSMIX'
    extension = '.csv'
    subdir = 'poi'
  }

  const dayDateTimeString = moment.utc(timestamp).format(formatString)
  const fileName = stationId + '-' + contentType + extension

  return path.join(csvBasePath, subdir, dayDateTimeString, fileName)
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

async function parseKmlFile(fileContent) {
  // Read the .kml-file
  let xml2jsOptions = {
    compact: true,
    ignoreComment: true,
    alwaysChildren: true
  }
  let kmzFileJS = await parser.xml2js(fileContent, xml2jsOptions)

  // Build the expected object containing all the data
  let forecastCollection = {}

  let forecastTimeSteps = kmzFileJS['kml:kml']['kml:Document']['kml:ExtendedData']['dwd:ProductDefinition']['dwd:ForecastTimeSteps']['dwd:TimeStep']
  forecastTimeSteps = _.map(forecastTimeSteps, (item) => {
    return moment(item._text).valueOf()
  })

  let forecastData = kmzFileJS['kml:kml']['kml:Document']['kml:Placemark']['kml:ExtendedData']['dwd:Forecast']
  for (let i = 0; i < forecastData.length; i++) {
    let data = _.flatMap(forecastData[i]['dwd:value'], (stringOfValues) => {
      let separator = ';'
      stringOfValues = _.replace(_.trimStart(stringOfValues), /(\s+)/g, separator)
      let listOfValues = _.split(stringOfValues, separator)

      return _.map(listOfValues, (value) => {
        return parseFloat(value)
      })
    })

    if (forecastTimeSteps.length === data.length) {
      let forecast = []
      for (let i = 0; i < data.length; i++) {
          forecast.push({
            timestamp: forecastTimeSteps[i],
            value: data[i]
          })
      }

      let key = forecastData[i]['_attributes']['dwd:elementName']
      forecastCollection[key] = forecast
    }
  }

  return forecastCollection
}

async function readTimeseriesDataReport(csvBasePath, startTimestamp, endTimestamp, stationId) {
  let dayTimestamp = moment.utc(startTimestamp).startOf('day').valueOf()

  const result = {}
  while (dayTimestamp < endTimestamp) {
    const filePath = deriveCsvFilePath(csvBasePath, 'REPORT', dayTimestamp, stationId)
    let fileContent
    try {
      fileContent = await fs.readFile(filePath, {
        encoding: 'utf8'
      })
    } catch (error) {
      console.log(dayTimestamp, error)
      dayTimestamp += 86400 * 1000
      continue
    }


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
        result[key].push({
          timestamp: timestamps[index],
          value: value
        })
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

async function readTimeseriesDataMosmix(mosmixBasePath, startTimestamp, stationId) {
  let dayTimestamp
  let filePath
  let fileContent
  let partialTimeseries
  let result = {}

  // Take care of the fact that DWD stopped providing .csv-files on 2018-09-17
  if (startTimestamp < moment.utc([2018, 8, 12,]).valueOf()) {
    // TODO: ensure that not only the 6 o'clock-run is used but the others as well
    dayTimestamp = moment.utc(startTimestamp).startOf('day').add(6, 'hours').valueOf()
    filePath = deriveCsvFilePath(mosmixBasePath, 'MOSMIX', dayTimestamp, stationId)
    fileContent = await fs.readFile(filePath, { encoding: 'utf8' })
    partialTimeseries = parseCsvFile(fileContent)

    const timestamps = partialTimeseries['timestamp']
    _.forEach(partialTimeseries, (values, key) => {
      if (key === 'timestamp') {
        return
      }

      _.forEach(values, (value, index) => {
        // Perform conversion to new format
        switch (key) {
          case 'TT':
            let newKeyTT = 'TTT'
            if (_.isNil(result[newKeyTT])) {
              result[newKeyTT] = []
            }
            result[newKeyTT].push({
              timestamp: timestamps[index],
              value: value + 273.15 // °C to K
            })
            break
          case 'PPPP':
            if (_.isNil(result[key])) {
              result[key] = []
            }
            result[key].push({
              timestamp: timestamps[index],
              value: value * 100 // hPa to Pa
            })
            break
          case 'Td':
            if (_.isNil(result[key])) {
              result[key] = []
            }
            result[key].push({
              timestamp: timestamps[index],
              value: value + 273.15 // °C to K
            })
            break
          case 'ff':
            let newKeyff = 'FF'
            if (_.isNil(result[newKeyff])) {
              result[newKeyff] = []
            }
            result[newKeyff].push({
              timestamp: timestamps[index],
              value: value / 3.6 // km/h to m/s
            })
            break
          case 'dd':
            let newKeydd = 'DD'
            if (_.isNil(result[newKeydd])) {
              result[newKeydd] = []
            }
            result[newKeydd].push({
              timestamp: timestamps[index],
              value: value
            })
            break
          // ..unless nothing has changed, which has to be found by manually
          // comparing MetElementDefinition.xml to the headings inside a .csv
          default:
          if (_.isNil(result[key])) {
            result[key] = []
          }
            result[key].push({
              timestamp: timestamps[index],
              value: value
            })
        }
      })
    })

    _.forEach(result, (item, key) => {
      result[key] = _.sortBy(item, (item) => {
        return item.timestamp
      })
    })
  } else {
    // TODO: ensure that not only the 3 o'clock-run is used but the others as well
    dayTimestamp = moment.utc(startTimestamp).startOf('day').add(3, 'hours').valueOf()
    filePath = deriveCsvFilePath(mosmixBasePath, 'MOSMIX_KMZ', dayTimestamp, stationId)

    // Unzip the .kmz-file
    const tmpFile = await tmp.file()
    const execCommand = 'unzip -p ' + filePath + ' > ' + tmpFile.path
    const statusOfExecCommand = await exec(execCommand)
    const fileContent = await fs.readFile(tmpFile.path, { encoding: 'utf8' })
    tmpFile.cleanup()

    result = await parseKmlFile(fileContent)
  }

  return result
}

async function main() {
  let stationId = '01001' // Jan Mayen
  let startTimestamp = moment.utc([2018, 8, 12]).valueOf()
  let startTimestampCSV = moment.utc([2018, 8, 11]).valueOf()
  let basePath = '/home/moritz/tmp/crawler/weather/local_forecasts'
  let csvFile = path.join(basePath, 'poi', '2018091106', '01001-MOSMIX.csv')
  let kmzFile = path.join(basePath, 'mos', '2018091203', '01001-MOSMIX.kmz')
  console.log(csvFile)
  console.log(kmzFile)

  const exists = await fs.pathExists(kmzFile) && await fs.pathExists(csvFile)
  if (!exists) {
    console.log('files do not exist, I am outta here')
    process.exit(1)
  }

  let resultKMZ = await readTimeseriesDataMosmix(basePath, startTimestamp, stationId)
  console.log(resultKMZ)

  let resultCSV = await readTimeseriesDataMosmix(basePath, startTimestampCSV, stationId)
  console.log(resultCSV)
}

main()

exports.parseCsvFile = parseCsvFile
exports.parseKmlFile = parseKmlFile
exports.deriveCsvFilePath = deriveCsvFilePath
exports.readTimeseriesDataReport = readTimeseriesDataReport
exports.readTimeseriesDataMosmix = readTimeseriesDataMosmix

module.exports = exports
