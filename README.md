# Kowala Currency Plugin for Edge
[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)

Implements Kowala send/receive functionality per the spec for [edge-core-js](https://github.com/EdgeApp/edge-core-js) plugins

## Installing
yarn add git://github.com/kowala-tech/edge-currency-kowala.git#develop

```
import { kowalaCurrencyPluginFactory } from `edge-currency-kowala`

const context = makeEdgeContext({
  apiKey: YOUR_API_KEY,
  plugins: [ kowalaCurrencyPluginFactory ]
})
```

## Docker
To build this plugin with docker-compose, use `docker-compose up`.

## Testing
Run `yarn test` to run the unit tests.

## License
BSD 3
