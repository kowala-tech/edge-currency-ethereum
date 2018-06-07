# Kowala Currency Plugin for Edge
[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)

Implements Kowala send/receive functionality per the spec for crypto currency plugins for [airbitz-core-js](https://github.com/Airbitz/airbitz-core-js)

## Installing

    yarn add git://github.com/kowala-tech/edge-currency-kowala.git#develop

```
import { kowalaCurrencyPluginFactory } from `edge-currency-kowala`
```

Now you can pass `kowalaCurrencyPluginFactory` to `edge-core-js`.

```
const context = makeEdgeContext({
  apiKey: YOUR_API_KEY,
  plugins: [ kowalaCurrencyPluginFactory ]
})
```

## Docker

To build this plugin with `docker-compose`, use `docker-compose up`.

## Contributing

To run a local version of this repo inside the full Edge Wallet app, clone this repo at the same level as `edge-react-gui`

    git clone git@github.com:kowala-tech/edge-currency-kowala.git`
    cd edge-currency-kowala
    yarn

Run `yarn test` to run the unit tests.

## License
BSD 3
