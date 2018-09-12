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
const util = require('util')

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

async function parseKmzFile(fileContent) {
  let xml2jsOptions = {
    compact: true,
    ignoreComment: true,
    alwaysChildren: true
  }
  let kmzFileJS = await parser.xml2js(fileContent, xml2jsOptions)
  // let kmzFileJSON = await parser.xml2json(fileContent, xml2jsOptions)
  // await fs.writeFile(
  //   path.join(__dirname, 'kmzFileJSONcompact.json'),
  //   kmzFileJSON,
  //   {encoding: 'utf8'}
  // )

  return kmzFileJS
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

async function readTimeseriesDataMosmix(csvBasePath, startTimestamp, stationId) {
  // TODO: ensure that not only the 6 o'clock-run is used but the others as well
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

async function main() {
  let stationId = '01001' // Jan Mayen
  let startTimestamp = moment([2018, 8, 12]).valueOf() // now, UNIX EPOCH in ms resolution
  let basePath = '/home/moritz/tmp/crawler/weather/local_forecasts'
  let csvBasePath = path.join(basePath, 'poi')
  let csvFile = path.join(basePath, 'poi', '2018091106', '01001-MOSMIX.csv')
  // let kmzFile = path.join(basePath, '2018091103', '01001-MOSMIX.kmz')
  let kmzFile = path.join(basePath, 'mos', '2018091103', 'MOSMIX_L_2018091103_01001.kml')
  console.log(csvFile)
  console.log(kmzFile)

  const exists = await fs.pathExists(kmzFile) && await fs.pathExists(csvFile)
  if (!exists) {
    exit(1)
  }

  let kmzFileXML = await fs.readFile(kmzFile, 'utf8')
  let resultKMZ = await parseKmzFile(kmzFileXML)
  console.log(resultKMZ)
  // console.log(util.inspect(resultKMZ, false, null))

  let resultCSV = await readTimeseriesDataMosmix(csvBasePath, startTimestamp, stationId)
  console.log(resultCSV)
  // console.log(util.inspect(resultCSV, false, null))
}

main()

exports.parseCsvFile = parseCsvFile
exports.deriveCsvFilePath = deriveCsvFilePath
exports.readTimeseriesDataReport = readTimeseriesDataReport
exports.readTimeseriesDataMosmix = readTimeseriesDataMosmix

module.exports = exports
