# Kowala Currency Plugin for Edge
[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)

Implements Kowala send/receive functionality per the spec for crypto currency plugins for [airbitz-core-js](https://github.com/Airbitz/airbitz-core-js)

## Installing

    npm i git://github.com/kowala-tech/edge-currency-kusd.git#develop -s

```
import { kusdCurrencyPluginFactory } from `edge-currency-kusd`
```

Now you can pass `kusdCurrencyPluginFactory` to `edge-core-js`.

```
const context = makeEdgeContext({
  apiKey: YOUR_API_KEY,
  plugins: [ kusdCurrencyPluginFactory ]
})
```

## Contributing

You'll need to install Yarn 1.3.2 globally on your machine

To run a local version of this repo inside the full Edge Wallet app, clone this repo at the same level as `edge-react-gui`

    git clone git@github.com:Airbitz/edge-currency-kusd.git`
    cd edge-currency-kusd
    yarn

Run `npm run test` to run the unit tests.

To use the local cloned version of this repo, `cd edge-react-gui` and run

    npm run updot edge-currency-kusd
    npm run postinstall

This will copy the necessary files from `edge-currency-kusd` into the `edge-react-gui/node_modules/edge-currency-kusd` replacing the npm installed version. This needs to be done after any modifications to `edge-currency-kusd`

## License
BSD 3
