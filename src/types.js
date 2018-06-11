/**
 * Created by paul on 8/26/17.
 */
// @flow

import type { EdgeTransaction } from 'edge-core-js'
import { currencyInfo } from './currencyInfo.js'
export const DATA_STORE_FOLDER = 'txEngineFolder'
export const DATA_STORE_FILE = 'walletLocalData.json'
export const PRIMARY_CURRENCY = currencyInfo.currencyCode

export type Settings = {
  apiServers: {},
  chainId: {},
  iosAllowedTokens: {[currencyCode: string]: boolean}
}

type FeesGasLimit = {
  regularTransaction: string,
  tokenTransaction: string
}

export type FeesGasPrice = {
  lowFee: string,
  standardFeeLow: string,
  standardFeeHigh: string,

  // The amount of wei which will be charged the standardFeeLow
  standardFeeLowAmount: string,

  // The amount of wei which will be charged the standardFeeHigh
  standardFeeHighAmount: string,
  highFee: string
}

export type Fee = {
  gasLimit: FeesGasLimit, gasPrice?: FeesGasPrice
}

export type Fees = {
  [address: string]: Fee
}

export type CalcedFees = {
  gasPrice: string,
  gasLimit: string
}

const defaultNetworkFees = {
  default: {
    gasLimit: {
      regularTransaction: '21001',
      tokenTransaction: '37123'
    },
    gasPrice: {
      lowFee: '1000000001',
      standardFeeLow: '40000000001',
      standardFeeHigh: '300000000001',
      standardFeeLowAmount: '100000000000000000',
      standardFeeHighAmount: '10000000000000000000',
      highFee: '40000000001'
    }
  },
  '1983987abc9837fbabc0982347ad828': {
    gasLimit: {
      regularTransaction: '21002',
      tokenTransaction: '37124'
    },
    gasPrice: {
      lowFee: '1000000002',
      standardFeeLow: '40000000002',
      standardFeeHigh: '300000000002',
      standardFeeLowAmount: '200000000000000000',
      standardFeeHighAmount: '20000000000000000000',
      highFee: '40000000002'
    }
  },
  '2983987abc9837fbabc0982347ad828': {
    gasLimit: {
      regularTransaction: '21002',
      tokenTransaction: '37124'
    }
  }
}

export type CustomToken = {
  currencyCode: string,
  currencyName: string,
  multiplier: string,
  contractAddress: string
}

export class WalletLocalData {
  blockHeight: number
  lastAddressQueryHeight: number
  nextNonce: string
  address: string
  totalBalances: {[currencyCode: string]: string}
  enabledTokens: Array<string>
  transactionsObj: {[currencyCode: string]: Array<EdgeTransaction>}
  networkFees: Fees

  constructor (jsonString: string | null) {
    this.blockHeight = 0

    const totalBalances:{[currencyCode: string]: string} = {}
    this.totalBalances = totalBalances

    this.nextNonce = '0'

    this.lastAddressQueryHeight = 0

    // Dumb extra local var needed to make Flow happy
    const transactionsObj:{[currencyCode: string]: Array<EdgeTransaction>} = {}
    this.transactionsObj = transactionsObj

    this.networkFees = defaultNetworkFees

    this.address = ''
    this.enabledTokens = [ PRIMARY_CURRENCY ]
    if (jsonString !== null) {
      const data = JSON.parse(jsonString)

      if (typeof data.blockHeight === 'number') this.blockHeight = data.blockHeight
      if (typeof data.lastAddressQueryHeight === 'string') this.lastAddressQueryHeight = data.lastAddressQueryHeight
      if (typeof data.nextNonce === 'string') this.nextNonce = data.nextNonce
      if (typeof data.address === 'string') this.address = data.address
      if (typeof data.totalBalances !== 'undefined') this.totalBalances = data.totalBalances
      if (typeof data.enabledTokens !== 'undefined') this.enabledTokens = data.enabledTokens
      if (typeof data.networkFees !== 'undefined') this.networkFees = data.networkFees
      if (typeof data.transactionsObj !== 'undefined') this.transactionsObj = data.transactionsObj
    }
  }
}
