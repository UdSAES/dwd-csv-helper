# dwd-csv-helper
`dwd-csv-helper` is a tiny helper package to extract timeseries data from .csv- and .kmz-files that have been downloaded by the [microservice `dwd_data_crawler`](https://github.com/UdSAES/dwd_data_crawler).

The package is being developed and maintained by the [Chair of Automation and Energy Systems](https://www.uni-saarland.de/en/lehrstuhl/frey/start.html) at the [Saarland University](https://www.uni-saarland.de/nc/en/home.html).

## LICENSE
`dwd-csv-helper` is released under the [ISC license](./LICENSE).

## Installation
```
$ npm install dwd-csv-helper
```

## Compatibility
Due to changes in the name and unit of some variables provided as part of the MOSMIX-forecast, the output of `readTimeseriesDataMosmix` was changed; this requires an update of `dwd_data_access` (compare the [commit message](https://github.com/UdSAES/dwd-csv-helper/commit/3af30bb1cfbbb52e2c439078634ac4db41bcd320))!

## Usage
The `dwd-csv-helper` package exposes two functions.

### readTimeseriesDataReport
* Purpose: asynchronously extract a timeseries of measurement data for a given station id within a given time interval
* Arguments:
  1. (`String`): path to the directory comprising the directories for the individual days of measurement data (e.g. `'SOME_PATH/weather/weather_reports/poi'`)
  2. (`Number`): inclusive start timestamp for the timeseries to be extracted as UNIX EPOCH in ms resolution (e.g. `1529280000000` for 2018-06-18 00:00 UTC)
  3. (`Number`): exclusive end timestamp for the timeseries to be extracted as UNIX EPOCH in ms resolution (e.g. `1529366400000` for 2018-06-19 00:00 UTC)
  4. (`String`): the identifier of the weather station for which to extract the timeseries (e.g. `'10708'` for weather station in Saarbrücken)
* Returns (`Object`): a map of all timeseries items extracted.
  * The keys of the `Object` refer to the values in the first line of the csv files
  * The value behind the key is an Array of `Object` with the following attributes:
    * `timestamp`: the timestamp of the measurement value as UNIX EPOCH in ms resolution
    * `value`: the measurement value as raw value (no unit conversion)

``` JavaScript
const {
  readTimeseriesDataReport
} = require('dwd-csv-helper')

async function main () {

  // load and extrat timeseries
  let tsCollection
  try {
    tsCollection = await readTimeseriesDataReport(
      '/mnt/data/weather/weather_reports/poi', // must be adopted to the correct path
      1529280000000,                           // inclusive start timestamp: 2018-06-18 00:00 UTC
      1529366400000,                           // exclusive end timestamp: 2018-06-19 00:00 UTC
      '10708'                                  // weather station Saarbrücken
    )
  } catch (error) {
    console.error('something went wrong while extracting the timeseries')
    console.error(error)
    return
  }

  // display extracted timeseries data
  const keys = Object.keys(ts)
  for (let i = 0; i < keys.length; i++) {
    const timeseries = tsCollection[keys[i]]
    console.log(keys[i], timeseries)
  }
}

main()
```
### readTimeseriesDataMosmix
* Purpose:
    * Asynchronously extract a timeseries of forecast data for a given reference time for a given station ID
    * Take care of the fact that the [format in which the MOSMIX-forecasts are provided by DWD changed on 2018-09-17](https://www.dwd.de/DE/leistungen/opendata/neuigkeiten/opendata_jul2018_02.html).
* Arguments:
  1. (`String`): path to the directory comprising the directories for the individual forecasts (e.g. `'SOME_PATH/weather/local_forecasts/poi'`)
  2. (`Number`): the reference timestamp of the forecast timeseries to be extracted as UNIX EPOCH in ms resolution (e.g. `1529301600000` for 2018-06-18 06:00 UTC)
  3. (`String`): the identifier of the weather station for which to extract the timeseries (e.g. `'10708'` for weather station in Saarbrücken)
* Returns (`Object`): a map of all timeseries items extracted
  * The keys of the `Object` refer to the values in the first line of the csv files
  * The value behind the key is an Array of `Object` with the following attributes:
    * `timestamp`: the timestamp of the measurement value as UNIX EPOCH in ms resolution
    * `value`: the measurement value as raw value (no unit conversion)

``` JavaScript
const {
  readTimeseriesDataReport
} = require('dwd-csv-helper')

async function main () {

  // load and extract timeseries data for a certain forecast
  let tsCollection
  try {
    tsCollection = await readTimeseriesDataMosmix(
      '/mnt/data/weather/local_forecasts/poi', // must be adopted to the correct path
      1529301600000,                           // inclusive start timestamp: 2018-06-18 06:00 UTC
      '10708'                                  // weather station Saarbrücken
    )
  } catch (error) {
    console.error('something went wrong while extracting the timeseries')
    console.error(error)
    return
  }

  // display extracted timeseries data
  const keys = Object.keys(ts)
  for (let i = 0; i < keys.length; i++) {
    const timeseries = tsCollection[keys[i]]
    console.log(keys[i], timeseries)
  }
}

main()
```

## Development
There are some unit tests defined in `index.spec.js`. They mainly check whether the output of the major functions matches some expected output, i.e. their purpose is regression testing. The necessary test data is provided in `./test/data`, the expected output is stored in `./test/expected`, organized using directories matching the unit tests' structure.
