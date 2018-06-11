/**
 * Created by paul on 7/7/17.
 */
// @flow

import { currencyInfo } from './currencyInfo.js'
import type {
  EdgeCurrencyEngine,
  EdgeTransaction,
  EdgeCurrencyEngineCallbacks,
  EdgeCurrencyEngineOptions,
  EdgeSpendInfo,
  EdgeWalletInfo,
  EdgeMetaToken,
  EdgeCurrencyInfo,
  EdgeDenomination,
  EdgeFreshAddress,
  EdgeDataDump,
  EdgeIo
} from 'edge-core-js'
import { calcMiningFee } from './miningFees.js'
import { sprintf } from 'sprintf-js'
import { bns } from 'biggystring'
import { NetworkFeesSchema, CustomTokenSchema } from './schema.js'
import {
  DATA_STORE_FILE,
  DATA_STORE_FOLDER,
  WalletLocalData,
  type CustomToken
} from './types.js'
import { isHex, normalizeAddress, bufToHex, validateObject, toHex } from './utils.js'

const Buffer = require('buffer/').Buffer
const abi = require('../lib/export-fixes-bundle.js').ABI
const walletUtils = require('../lib/export-fixes-bundle.js').Wallet
const KowalaTx = require('../lib/export-fixes-bundle.js').Transaction

const ADDRESS_POLL_MILLISECONDS = 3000
const BLOCKHEIGHT_POLL_MILLISECONDS = 3000
const NETWORKFEES_POLL_MILLISECONDS = (60 * 10 * 1000) // 10 minutes
const SAVE_DATASTORE_MILLISECONDS = 1000
const ADDRESS_QUERY_LOOKBACK_BLOCKS = (60 * 60 * 24 * 7) // ~ one week

const PRIMARY_CURRENCY = currencyInfo.currencyCode

type BroadcastResults = {
 incrementNonce: boolean,
 decrementNonce: boolean
}

class KowalaParams {
 from: Array<string>
 to: Array<string>
 gas: string
 gasPrice: string
 gasUsed: string
 cumulativeGasUsed: string
 errorVal: number
 tokenRecipientAddress: string | null

 constructor (from: Array<string>,
   to: Array<string>,
   gas: string,
   gasPrice: string,
   gasUsed: string,
   cumulativeGasUsed: string,
   errorVal: number,
   tokenRecipientAddress: string | null) {
   this.from = from
   this.to = to
   this.gas = gas
   this.gasPrice = gasPrice
   this.gasUsed = gasUsed
   this.errorVal = errorVal
   this.cumulativeGasUsed = cumulativeGasUsed
   if (typeof tokenRecipientAddress === 'string') {
     this.tokenRecipientAddress = tokenRecipientAddress
   } else {
     this.tokenRecipientAddress = null
   }
 }
}

class Engine {
 walletInfo: EdgeWalletInfo
 edgeTxLibCallbacks: EdgeCurrencyEngineCallbacks
 walletLocalFolder: any
 engineOn: boolean
 addressesChecked: boolean
 tokenCheckStatus: { [currencyCode: string]: number } // Each currency code can be a 0-1 value
 walletLocalData: WalletLocalData
 walletLocalDataDirty: boolean
 transactionsChangedArray: Array<EdgeTransaction>
 currencyInfo: EdgeCurrencyInfo
 allTokens: Array<EdgeMetaToken>
 customTokens: Array<EdgeMetaToken>
 currentSettings: any
 timers: any
 walletId: string
 io: EdgeIo

 constructor (io_: any, walletInfo: EdgeWalletInfo, opts: EdgeCurrencyEngineOptions) {
   // Validate that we are a valid EdgeCurrencyEngine:
   // eslint-disable-next-line no-unused-vars
   const test: EdgeCurrencyEngine = this

   const { walletLocalFolder, callbacks } = opts

   this.io = io_
   this.engineOn = false
   this.addressesChecked = false
   this.tokenCheckStatus = {}
   this.walletLocalDataDirty = false
   this.transactionsChangedArray = []
   this.walletInfo = walletInfo
   this.walletId = walletInfo.id ? `${walletInfo.id} - ` : ''
   this.currencyInfo = currencyInfo
   this.allTokens = currencyInfo.metaTokens.slice(0)
   this.customTokens = []
   this.timers = {}

   if (typeof opts.optionalSettings !== 'undefined') {
     this.currentSettings = opts.optionalSettings
   } else {
     this.currentSettings = this.currencyInfo.defaultSettings
   }

   // Hard coded for testing
   // this.walletInfo.keys.privateKey = '389b07b3466eed587d6bdae09a3613611de9add2635432d6cd1521af7bbc3757'
   // this.walletInfo.keys.address = '0xd6e579085c82329c89fca7a9f012be59028ed53f'
   this.edgeTxLibCallbacks = callbacks
   this.walletLocalFolder = walletLocalFolder

   // Fix messed-up wallets that have a private key in the wrong place:
   if (typeof this.walletInfo.keys.privateKey !== 'string') {
     if (walletInfo.keys.keys && walletInfo.keys.keys.privateKey) {
       this.walletInfo.keys.privateKey = walletInfo.keys.keys.privateKey
     }
   }

   // Fix messed-up wallets that have a public address in the wrong place:
   if (typeof this.walletInfo.keys.address !== 'string') {
     if (walletInfo.keys.publicAddress) {
       this.walletInfo.keys.address = walletInfo.keys.publicAddress
     } else if (walletInfo.keys.keys && walletInfo.keys.keys.publicAddress) {
       this.walletInfo.keys.address = walletInfo.keys.keys.publicAddress
     } else {
       const privKey = Buffer.from(this.walletInfo.keys.privateKey, 'hex')
       const wallet = walletUtils.fromPrivateKey(privKey)
       this.walletInfo.keys.address = wallet.getAddressString()
     }
   }

   this.log(`Created Wallet Type ${this.walletInfo.type} for Currency Plugin ${this.currencyInfo.pluginName} `)
 }

  // *************************************
  // Private methods
  // *************************************
 async fetchGetApi (cmd: string) {
   const networkName = this.walletInfo.type
   const url = sprintf('%s/%s', this.currentSettings.otherSettings.apiServer[networkName], cmd)
   return this.fetchGet(url)
 }

 async fetchGet (url: string) {
   const response = await this.io.fetch(url, {
     method: 'GET'
   })
   if (!response.ok) {
     throw new Error(
       `The server returned error code ${response.status} for ${url}`
     )
   }
   return response.json()
 }

  // *************************************
  // Poll on the blockheight
  // *************************************
 async blockHeightInnerLoop () {
   try {
     const jsonObj = await this.fetchGetApi('blockheight')
     const valid = validateObject(jsonObj, {
       'type': 'object',
       'properties': {
         'block_height': {'type': 'integer'}
       },
       'required': ['block_height']
     })
     if (valid) {
       const blockHeight:number = parseInt(jsonObj.block_height)
       this.log(`Got block height ${blockHeight}`)
       if (this.walletLocalData.blockHeight !== blockHeight) {
         this.walletLocalData.blockHeight = blockHeight // Convert to decimal
         this.walletLocalDataDirty = true
         this.edgeTxLibCallbacks.onBlockHeightChanged(this.walletLocalData.blockHeight)
       }
     }
   } catch (err) {
     this.log('Error fetching height: ' + err)
   }
 }

 processTransaction (tx: any) {
   let netNativeAmount:string // Amount received into wallet
   const ourReceiveAddresses:Array<string> = []
   const gasPrice:string = String(tx.gas_price)
   const gasUsed:string = String(tx.gas_used)
   const amount:string = String(tx.amount)
   const to:string = String(tx.to).toLowerCase()
   const from:string = String(tx.from).toLowerCase()
   const blockHeight:number = parseInt(tx.block_height)
   const timestamp:number = parseInt(tx.timestamp)
   const nativeNetworkFee:string = bns.mul(gasPrice, gasUsed)

   if (from === this.walletLocalData.address.toLowerCase()) {
     netNativeAmount = bns.sub('0', amount)

     // For spends, include the network fee in the transaction amount
     netNativeAmount = bns.sub(netNativeAmount, nativeNetworkFee)
   } else {
     netNativeAmount = bns.add('0', amount)
     ourReceiveAddresses.push(this.walletLocalData.address.toLowerCase())
   }

   const kowalaParams = new KowalaParams(
     [ from ],
     [ to ],
     nativeNetworkFee,
     gasPrice,
     gasUsed,
     gasUsed,
     parseInt(0),
     null
   )

   const edgeTransaction:EdgeTransaction = {
     txid: tx.hash,
     date: timestamp,
     currencyCode: currencyInfo.currencyCode,
     blockHeight: blockHeight,
     nativeAmount: netNativeAmount,
     networkFee: nativeNetworkFee,

     ourReceiveAddresses,
     signedTx: 'unsigned',
     otherParams: kowalaParams
   }

   const idx = this.findTransaction(PRIMARY_CURRENCY, tx.hash)
   if (idx === -1) {
     this.log(sprintf('New transaction: %s', tx.hash))

     // New transaction not in database
     this.addTransaction(PRIMARY_CURRENCY, edgeTransaction)

     this.edgeTxLibCallbacks.onTransactionsChanged(
       this.transactionsChangedArray
     )
     this.transactionsChangedArray = []
   } else {
     // Already have this tx in the database. See if anything changed
     const transactionsArray = this.walletLocalData.transactionsObj[ PRIMARY_CURRENCY ]
     const edgeTx = transactionsArray[ idx ]
     if (
       edgeTx.blockHeight !== edgeTransaction.blockHeight ||
    edgeTx.networkFee !== edgeTransaction.networkFee ||
    edgeTx.nativeAmount !== edgeTransaction.nativeAmount ||
    edgeTx.otherParams.errorVal !== edgeTransaction.otherParams.errorVal
     ) {
       this.log(sprintf('Update transaction: %s height:%s', tx.hash, tx.blockHeight))
       this.updateTransaction(PRIMARY_CURRENCY, edgeTransaction, idx)
       this.edgeTxLibCallbacks.onTransactionsChanged(
         this.transactionsChangedArray
       )
       this.transactionsChangedArray = []
     } else {
       // this.log(sprintf('Old transaction. No Update: %s', tx.hash))
     }
   }
 }

 async checkAddressFetch (tk: string, url: string) {
   let checkAddressSuccess = true
   let jsonObj = {}
   let valid = false

   try {
     jsonObj = await this.fetchGetApi(url)
     valid = validateObject(jsonObj, {
       'type': 'object',
       'properties': {
         'balance': {'type': 'integer'}
       },
       'required': ['balance']
     })
     if (valid) {
       const balance = String(jsonObj.balance)

       if (typeof this.walletLocalData.totalBalances[tk] === 'undefined') {
         this.walletLocalData.totalBalances[tk] = '0'
       }
       if (!bns.eq(balance, this.walletLocalData.totalBalances[tk])) {
         this.walletLocalData.totalBalances[tk] = balance
         this.log(tk + ': token Address balance: ' + balance)
         this.edgeTxLibCallbacks.onBalanceChanged(tk, balance)
       }
     } else {
       checkAddressSuccess = false
     }
   } catch (e) {
     checkAddressSuccess = false
   }
   return checkAddressSuccess
 }

 async checkTransactionsFetch () {
   const address = this.walletLocalData.address
   const endBlock:number = 999999999
   let startBlock:number = 0
   let checkAddressSuccess = true
   let url = ''
   let jsonObj = {}
   let valid = false
   if (this.walletLocalData.lastAddressQueryHeight > ADDRESS_QUERY_LOOKBACK_BLOCKS) {
     // Only query for transactions as far back as ADDRESS_QUERY_LOOKBACK_BLOCKS from the last time we queried transactions
     startBlock = this.walletLocalData.lastAddressQueryHeight - ADDRESS_QUERY_LOOKBACK_BLOCKS
   }

   try {
     url = sprintf('transactions/%s/from/%s/to/%s', address, startBlock, endBlock)
     jsonObj = await this.fetchGetApi(url)
     valid = validateObject(jsonObj, {
       'type': 'object',
       'properties': {
         'transactions': {
           'type': 'array',
           'items': {
             'type': 'object',
             'properties': {
               'block_height': {'type': 'integer'},
               'timestamp': {'type': 'integer'},
               'hash': {'type': 'string'},
               'from': {'type': 'string'},
               'to': {'type': 'string'},
               'amount': {'type': 'integer'},
               'gas_used': {'type': 'integer'},
               'gas_price': {'type': 'integer'}
             },
             'required': [
               'block_height',
               'timestamp',
               'hash',
               'from',
               'to',
               'amount',
               'gas_used',
               'gas_price'
             ]
           }
         }
       },
       'required': ['transactions']
     })

     if (valid) {
       const transactions = jsonObj.transactions
       this.log('Fetched transactions count: ' + transactions.length)

       // Get transactions
       // Iterate over transactions in address
       for (let i = 0; i < transactions.length; i++) {
         const tx = transactions[i]
         this.processTransaction(tx)
         this.tokenCheckStatus[ PRIMARY_CURRENCY ] = ((i + 1) / transactions.length)
         if (i % 10 === 0) {
           this.updateOnAddressesChecked()
         }
       }
       if (transactions.length === 0) {
         this.tokenCheckStatus[ PRIMARY_CURRENCY ] = 1
       }
       this.updateOnAddressesChecked()
     } else {
       checkAddressSuccess = false
     }
   } catch (e) {
     this.log(e)
     checkAddressSuccess = false
   }
   return checkAddressSuccess
 }

 updateOnAddressesChecked () {
   if (this.addressesChecked) {
     return
   }
   const activeTokens: Array<string> = []

   for (const tokenCode of this.walletLocalData.enabledTokens) {
     const ti = this.getTokenInfo(tokenCode)
     if (ti) {
       activeTokens.push(tokenCode)
     }
   }

   const perTokenSlice = 1 / activeTokens.length
   let numCompleteStatus = 0
   let totalStatus = 0
   for (const token of activeTokens) {
     const status = this.tokenCheckStatus[token]
     totalStatus += status * perTokenSlice
     if (status === 1) {
       numCompleteStatus++
     }
   }
   if (numCompleteStatus === activeTokens.length) {
     this.addressesChecked = true
     this.edgeTxLibCallbacks.onAddressesChecked(1)
     this.walletLocalData.lastAddressQueryHeight = this.walletLocalData.blockHeight
   } else {
     this.edgeTxLibCallbacks.onAddressesChecked(totalStatus)
   }
 }

  // **********************************************
  // Check all addresses for new transactions
  // **********************************************
 async checkAddressesInnerLoop () {
   const address = this.walletLocalData.address
   try {
     //  only has one address
     let url = ''
     const promiseArray = []

     // ************************************
     // Fetch token balances
     // ************************************
     for (const tk of this.walletLocalData.enabledTokens) {
       if (tk === PRIMARY_CURRENCY) {
         url = sprintf('balance/%s', address)
       } else {
         continue
       }
       promiseArray.push(this.checkAddressFetch(tk, url))
     }

     promiseArray.push(this.checkTransactionsFetch())

     await Promise.all(promiseArray)
   } catch (e) {
     this.log('Error fetching address transactions: ' + address)
   }
 }

 findTransaction (currencyCode: string, txid: string) {
   if (typeof this.walletLocalData.transactionsObj[currencyCode] === 'undefined') {
     return -1
   }

   const currency = this.walletLocalData.transactionsObj[currencyCode]
   return currency.findIndex(element => {
     return normalizeAddress(element.txid) === normalizeAddress(txid)
   })
 }

 sortTxByDate (a: EdgeTransaction, b: EdgeTransaction) {
   return b.date - a.date
 }

 addTransaction (currencyCode: string, edgeTransaction: EdgeTransaction) {
   // Add or update tx in transactionsObj
   const idx = this.findTransaction(currencyCode, edgeTransaction.txid)

   if (idx === -1) {
     this.log('addTransaction: adding and sorting:' + edgeTransaction.txid)
     if (typeof this.walletLocalData.transactionsObj[currencyCode] === 'undefined') {
       this.walletLocalData.transactionsObj[currencyCode] = []
     }
     this.walletLocalData.transactionsObj[currencyCode].push(edgeTransaction)

     // Sort
     this.walletLocalData.transactionsObj[currencyCode].sort(this.sortTxByDate)
     this.walletLocalDataDirty = true
     this.transactionsChangedArray.push(edgeTransaction)
   } else {
     this.updateTransaction(currencyCode, edgeTransaction, idx)
   }
 }

 updateTransaction (currencyCode: string, edgeTransaction: EdgeTransaction, idx: number) {
   // Update the transaction
   this.walletLocalData.transactionsObj[currencyCode][idx] = edgeTransaction
   this.walletLocalDataDirty = true
   this.transactionsChangedArray.push(edgeTransaction)
   this.log('updateTransaction:' + edgeTransaction.txid)
 }

  // *************************************
  // Save the wallet data store
  // *************************************
 async saveWalletLoop () {
   if (this.walletLocalDataDirty) {
     try {
       this.log('walletLocalDataDirty. Saving...')
       const walletJson = JSON.stringify(this.walletLocalData)
       await this.walletLocalFolder
         .folder(DATA_STORE_FOLDER)
         .file(DATA_STORE_FILE)
         .setText(walletJson)
       this.walletLocalDataDirty = false
     } catch (err) {
       this.log(err)
     }
   }
 }

 async checkUpdateNetworkFees () {
   try {
     const jsonObj = {
       default: {
         gasLimit: {
           regularTransaction: '21000',
           tokenTransaction: '21000'
         },
         gasPrice: {
           lowFee: '1',
           highFee: '1',
           standardFeeLow: '1',
           standardFeeHigh: '1',
           standardFeeLowAmount: '100000000000000000',
           standardFeeHighAmount: '10000000000000000000'
         }
       }
     }
     const valid = validateObject(jsonObj, NetworkFeesSchema)

     if (valid) {
       this.walletLocalData.networkFees = jsonObj
     } else {
       this.log('Error: Fetched invalid networkFees')
     }
   } catch (err) {
     this.log('Error fetching networkFees:')
     this.log(err)
   }
 }

 doInitialCallbacks () {
   for (const currencyCode of this.walletLocalData.enabledTokens) {
     try {
       this.edgeTxLibCallbacks.onTransactionsChanged(
         this.walletLocalData.transactionsObj[currencyCode]
       )
       this.edgeTxLibCallbacks.onBalanceChanged(currencyCode, this.walletLocalData.totalBalances[currencyCode])
     } catch (e) {
       this.log('Error for currencyCode', currencyCode, e)
     }
   }
 }

 getTokenInfo (token: string) {
   return this.allTokens.find(element => {
     return element.currencyCode === token
   })
 }

 async addToLoop (func: string, timer: number) {
   try {
     // $FlowFixMe
     await this[func]()
   } catch (e) {
     this.log('Error in Loop:', func, e)
   }
   if (this.engineOn) {
     this.timers[func] = setTimeout(() => {
       if (this.engineOn) {
         this.addToLoop(func, timer)
       }
     }, timer)
   }
   return true
 }

 log (...text: Array<any>) {
   text[0] = `${this.walletId}${text[0]}`
   console.log(...text)
 }

  // *************************************
  // Public methods
  // *************************************

 updateSettings (settings: any) {
   this.currentSettings = settings
 }

 async startEngine () {
   this.engineOn = true
   this.doInitialCallbacks()
   this.addToLoop('blockHeightInnerLoop', BLOCKHEIGHT_POLL_MILLISECONDS)
   this.addToLoop('checkAddressesInnerLoop', ADDRESS_POLL_MILLISECONDS)
   this.addToLoop('saveWalletLoop', SAVE_DATASTORE_MILLISECONDS)
   this.addToLoop('checkUpdateNetworkFees', NETWORKFEES_POLL_MILLISECONDS)
 }

 async killEngine () {
   // Set status flag to false
   this.engineOn = false
   // Clear Inner loops timers
   for (const timer in this.timers) {
     clearTimeout(this.timers[timer])
   }
   this.timers = {}
 }

 async resyncBlockchain (): Promise<void> {
   await this.killEngine()
   const temp = JSON.stringify({
     enabledTokens: this.walletLocalData.enabledTokens,
     networkFees: this.walletLocalData.networkFees,
     address: this.walletLocalData.address
   })
   this.walletLocalData = new WalletLocalData(temp)
   this.walletLocalDataDirty = true
   await this.saveWalletLoop()
   await this.startEngine()
 }

  // synchronous
 getBlockHeight (): number {
   return parseInt(this.walletLocalData.blockHeight)
 }

 enableTokensSync (tokens: Array<string>) {
   for (const token of tokens) {
     if (this.walletLocalData.enabledTokens.indexOf(token) === -1) {
       this.walletLocalData.enabledTokens.push(token)
     }
   }
 }

  // asynchronous
 async enableTokens (tokens: Array<string>) {
   this.enableTokensSync(tokens)
 }

 disableTokensSync (tokens: Array<string>) {
   for (const token of tokens) {
     const index = this.walletLocalData.enabledTokens.indexOf(token)
     if (index !== -1) {
       this.walletLocalData.enabledTokens.splice(index, 1)
     }
   }
 }

  // asynchronous
 async disableTokens (tokens: Array<string>) {
   this.disableTokensSync(tokens)
 }

 async getEnabledTokens (): Promise<Array<string>> {
   return this.walletLocalData.enabledTokens
 }

 async addCustomToken (tokenObj: any) {
   const valid = validateObject(tokenObj, CustomTokenSchema)

   if (valid) {
     const ethTokenObj: CustomToken = tokenObj
     // If token is already in currencyInfo, error as it cannot be changed
     for (const tk of this.currencyInfo.metaTokens) {
       if (
         tk.currencyCode.toLowerCase() === ethTokenObj.currencyCode.toLowerCase() ||
     tk.currencyName.toLowerCase() === ethTokenObj.currencyName.toLowerCase()
       ) {
         throw new Error('ErrorCannotModifyToken')
       }
     }

     // Validate the token object
     if (ethTokenObj.currencyCode.toUpperCase() !== ethTokenObj.currencyCode) {
       throw new Error('ErrorInvalidCurrencyCode')
     }
     if (ethTokenObj.currencyCode.length < 2 || ethTokenObj.currencyCode.length > 7) {
       throw new Error('ErrorInvalidCurrencyCodeLength')
     }
     if (ethTokenObj.currencyName.length < 3 || ethTokenObj.currencyName.length > 20) {
       throw new Error('ErrorInvalidCurrencyNameLength')
     }
     if (bns.lt(ethTokenObj.multiplier, '1') || bns.gt(ethTokenObj.multiplier, '100000000000000000000000000000000')) {
       throw new Error('ErrorInvalidMultiplier')
     }
     let contractAddress = ethTokenObj.contractAddress.replace('0x', '').toLowerCase()
     if (!isHex(contractAddress) || contractAddress.length !== 40) {
       throw new Error('ErrorInvalidContractAddress')
     }
     contractAddress = '0x' + contractAddress

     for (const tk of this.customTokens) {
       if (
         tk.currencyCode.toLowerCase() === ethTokenObj.currencyCode.toLowerCase() ||
     tk.currencyName.toLowerCase() === ethTokenObj.currencyName.toLowerCase()
       ) {
         // Remove old token first then re-add it to incorporate any modifications
         const idx = this.customTokens.findIndex(element => element.currencyCode === ethTokenObj.currencyCode)
         if (idx !== -1) {
           this.customTokens.splice(idx, 1)
         }
       }
     }

     // Create a token object for inclusion in customTokens
     const denom: EdgeDenomination = {
       name: ethTokenObj.currencyCode,
       multiplier: ethTokenObj.multiplier
     }
     const edgeMetaToken: EdgeMetaToken = {
       currencyCode: ethTokenObj.currencyCode,
       currencyName: ethTokenObj.currencyName,
       denominations: [denom],
       contractAddress
     }

     this.customTokens.push(edgeMetaToken)
     this.allTokens = this.currencyInfo.metaTokens.concat(this.customTokens)
     this.enableTokensSync([edgeMetaToken.currencyCode])
   } else {
     throw new Error('Invalid custom token object')
   }
 }

  // synchronous
 getTokenStatus (token: string) {
   return this.walletLocalData.enabledTokens.indexOf(token) !== -1
 }

  // synchronous
 getBalance (options: any): string {
   let currencyCode = PRIMARY_CURRENCY

   if (typeof options !== 'undefined') {
     const valid = validateObject(options, {
       'type': 'object',
       'properties': {
         'currencyCode': {'type': 'string'}
       }
     })

     if (valid) {
       currencyCode = options.currencyCode
     }
   }

   if (typeof this.walletLocalData.totalBalances[currencyCode] === 'undefined') {
     return '0'
   } else {
     const nativeBalance = this.walletLocalData.totalBalances[currencyCode]
     return nativeBalance
   }
 }

  // synchronous
 getNumTransactions (options: any): number {
   let currencyCode = PRIMARY_CURRENCY

   const valid = validateObject(options, {
     'type': 'object',
     'properties': {
       'currencyCode': {'type': 'string'}
     }
   })

   if (valid) {
     currencyCode = options.currencyCode
   }

   if (typeof this.walletLocalData.transactionsObj[currencyCode] === 'undefined') {
     return 0
   } else {
     return this.walletLocalData.transactionsObj[currencyCode].length
   }
 }

  // asynchronous
 async getTransactions (options: any) {
   let currencyCode:string = PRIMARY_CURRENCY

   const valid:boolean = validateObject(options, {
     'type': 'object',
     'properties': {
       'currencyCode': {'type': 'string'}
     }
   })

   if (valid) {
     currencyCode = options.currencyCode
   }

   if (typeof this.walletLocalData.transactionsObj[currencyCode] === 'undefined') {
     return []
   }

   let startIndex:number = 0
   let numEntries:number = 0
   if (options === null) {
     return this.walletLocalData.transactionsObj[currencyCode].slice(0)
   }
   if (options.startIndex !== null && options.startIndex > 0) {
     startIndex = options.startIndex
     if (
       startIndex >=
    this.walletLocalData.transactionsObj[currencyCode].length
     ) {
       startIndex =
     this.walletLocalData.transactionsObj[currencyCode].length - 1
     }
   }
   if (options.numEntries !== null && options.numEntries > 0) {
     numEntries = options.numEntries
     if (
       numEntries + startIndex >
    this.walletLocalData.transactionsObj[currencyCode].length
     ) {
       // Don't read past the end of the transactionsObj
       numEntries =
     this.walletLocalData.transactionsObj[currencyCode].length -
     startIndex
     }
   }

   // Copy the appropriate entries from the arrayTransactions
   let returnArray = []

   if (numEntries) {
     returnArray = this.walletLocalData.transactionsObj[currencyCode].slice(
       startIndex,
       numEntries + startIndex
     )
   } else {
     returnArray = this.walletLocalData.transactionsObj[currencyCode].slice(
       startIndex
     )
   }
   return returnArray
 }

  // synchronous
 getFreshAddress (options: any): EdgeFreshAddress {
   return { publicAddress: this.walletLocalData.address }
 }

  // synchronous
 addGapLimitAddresses (addresses: Array<string>, options: any) {
 }

  // synchronous
 isAddressUsed (address: string, options: any) {
   return false
 }

  // synchronous
 async makeSpend (edgeSpendInfo: EdgeSpendInfo) {
   // Validate the spendInfo
   const valid = validateObject(edgeSpendInfo, {
     'type': 'object',
     'properties': {
       'currencyCode': { 'type': 'string' },
       'networkFeeOption': { 'type': 'string' },
       'spendTargets': {
         'type': 'array',
         'items': {
           'type': 'object',
           'properties': {
             'currencyCode': { 'type': 'string' },
             'publicAddress': { 'type': 'string' },
             'nativeAmount': { 'type': 'string' },
             'destMetadata': { 'type': 'object' },
             'destWallet': { 'type': 'object' }
           },
           'required': [
             'publicAddress'
           ]
         }
       }
     },
     'required': [ 'spendTargets' ]
   })

   if (!valid) {
     throw (new Error('Error: invalid ABCSpendInfo'))
   }

   //  can only have one output
   if (edgeSpendInfo.spendTargets.length !== 1) {
     throw (new Error('Error: only one output allowed'))
   }

   let tokenInfo = {}
   tokenInfo.contractAddress = ''

   let currencyCode:string = ''
   if (typeof edgeSpendInfo.currencyCode === 'string') {
     currencyCode = edgeSpendInfo.currencyCode
     if (!this.getTokenStatus(currencyCode)) {
       throw (new Error('Error: Token not supported or enabled'))
     } else if (currencyCode !== currencyInfo.currencyCode) {
       tokenInfo = this.getTokenInfo(currencyCode)
       if (!tokenInfo || typeof tokenInfo.contractAddress !== 'string') {
         throw (new Error('Error: Token not supported or invalid contract address'))
       }
     }
   } else {
     currencyCode = currencyInfo.currencyCode
   }
   edgeSpendInfo.currencyCode = currencyCode

   // ******************************
   // Get the fee amount

   let params = {}
   const { gasLimit, gasPrice } = calcMiningFee(edgeSpendInfo, this.walletLocalData.networkFees)

   let publicAddress = ''
   if (typeof edgeSpendInfo.spendTargets[0].publicAddress === 'string') {
     publicAddress = edgeSpendInfo.spendTargets[0].publicAddress
   } else {
     throw new Error('No valid spendTarget')
   }

   if (currencyCode === PRIMARY_CURRENCY) {
     params = new KowalaParams(
       [this.walletLocalData.address],
       [publicAddress],
       gasLimit,
       gasPrice,
       '0',
       '0',
       0,
       null
     )
   } else {
     let contractAddress = ''
     if (typeof tokenInfo.contractAddress === 'string') {
       contractAddress = tokenInfo.contractAddress
     } else {
       throw new Error('makeSpend: Invalid contract address')
     }
     params = new KowalaParams(
       [this.walletLocalData.address],
       [contractAddress],
       gasLimit,
       gasPrice,
       '0',
       '0',
       0,
       publicAddress
     )
   }

   let nativeAmount = '0'
   if (typeof edgeSpendInfo.spendTargets[0].nativeAmount === 'string') {
     nativeAmount = edgeSpendInfo.spendTargets[0].nativeAmount
   } else {
     throw (new Error('Error: no amount specified'))
   }

   const InsufficientFundsError = new Error('Insufficient funds')
   InsufficientFundsError.name = 'ErrorInsufficientFunds'
   const InsufficientFundsEthError = new Error('Insufficient funds for transaction fee')
   InsufficientFundsEthError.name = 'ErrorInsufficientFundsMoreEth'

   const balanceEth = this.walletLocalData.totalBalances[currencyInfo.currencyCode]
   let nativeNetworkFee = bns.mul(gasPrice, gasLimit)
   let totalTxAmount = '0'
   let parentNetworkFee = null

   if (currencyCode === PRIMARY_CURRENCY) {
     totalTxAmount = bns.add(nativeNetworkFee, nativeAmount)
     if (bns.gt(totalTxAmount, balanceEth)) {
       throw (InsufficientFundsError)
     }
     nativeAmount = bns.mul(totalTxAmount, '-1')
   } else {
     parentNetworkFee = nativeNetworkFee

     if (bns.gt(nativeNetworkFee, balanceEth)) {
       throw (InsufficientFundsEthError)
     }

     nativeNetworkFee = '0' // Do not show a fee for token transations.
     const balanceToken = this.walletLocalData.totalBalances[currencyCode]
     if (bns.gt(nativeAmount, balanceToken)) {
       throw (InsufficientFundsError)
     }
     nativeAmount = bns.mul(nativeAmount, '-1')
   }

   // const negativeOneBN = new BN('-1', 10)
   // nativeAmountBN.imul(negativeOneBN)
   // nativeAmount = nativeAmountBN.toString(10)

   // **********************************
   // Create the unsigned EdgeTransaction

   const edgeTransaction:EdgeTransaction = {
     txid: '', // txid
     date: 0, // date
     currencyCode, // currencyCode
     blockHeight: 0, // blockHeight
     nativeAmount, // nativeAmount
     networkFee: nativeNetworkFee, // networkFee
     ourReceiveAddresses: [], // ourReceiveAddresses
     signedTx: '0', // signedTx
     otherParams: params // otherParams
   }

   if (parentNetworkFee) {
     edgeTransaction.parentNetworkFee = parentNetworkFee
   }

   return edgeTransaction
 }

  // asynchronous
 async signTx (edgeTransaction: EdgeTransaction): Promise<EdgeTransaction> {
   // Do signing

   const gasLimitHex = toHex(edgeTransaction.otherParams.gas)
   const gasPriceHex = toHex(edgeTransaction.otherParams.gasPrice)
   let nativeAmountHex

   // let nativeAmountHex = bns.mul('-1', edgeTransaction.nativeAmount, 16)
   if (edgeTransaction.currencyCode === PRIMARY_CURRENCY) {
     // Remove the networkFee from the nativeAmount
     const nativeAmount = bns.add(edgeTransaction.nativeAmount, edgeTransaction.networkFee)
     nativeAmountHex = bns.mul('-1', nativeAmount, 16)
   } else {
     nativeAmountHex = bns.mul('-1', edgeTransaction.nativeAmount, 16)
   }

   // const nonceBN = new BN(this.walletLocalData.nextNonce.toString(10), 10)
   // const nonceHex = '0x' + nonceBN.toString(16)
   //
   const nonceHex = toHex(this.walletLocalData.nextNonce)
   let data
   if (edgeTransaction.currencyCode === PRIMARY_CURRENCY) {
     data = ''
   } else {
     const dataArray = abi.simpleEncode(
       'transfer(address,uint256):(uint256)',
       edgeTransaction.otherParams.tokenRecipientAddress,
       nativeAmountHex
     )
     data = '0x' + Buffer.from(dataArray).toString('hex')
     nativeAmountHex = '0x00'
   }

   const networkName = this.walletInfo.type
   const txParams = {
     nonce: nonceHex,
     gasPrice: gasPriceHex,
     gasLimit: gasLimitHex,
     to: edgeTransaction.otherParams.to[0],
     value: nativeAmountHex,
     data: data,
     chainId: currencyInfo.defaultSettings.otherSettings.chainId[networkName]
   }

   const privKey = Buffer.from(this.walletInfo.keys.privateKey, 'hex')

   const tx = new KowalaTx(txParams)
   tx.sign(privKey)

   edgeTransaction.signedTx = bufToHex(tx.serialize())
   edgeTransaction.txid = bufToHex(tx.hash())
   edgeTransaction.date = Date.now() / 1000

   return edgeTransaction
 }

 async broadcastOverAPI (edgeTransaction: EdgeTransaction): Promise<BroadcastResults> {
   const result: BroadcastResults = {
     incrementNonce: false,
     decrementNonce: false
   }

   const transactionParsed = JSON.stringify(edgeTransaction, null, 2)
   this.log(`Sent transaction to network:\n${transactionParsed}\n`)

   const hexTx = edgeTransaction.signedTx.replace('0x', '')
   const url = sprintf('broadcasttx/%s', hexTx)
   const jsonObj = await this.fetchGetApi(url)

   this.log('broadcastOverAPI jsonObj:', jsonObj)
   if (typeof jsonObj.error !== 'undefined') {
     this.log('Error sending transaction')
     if (
       typeof jsonObj.error === 'string' &&
    jsonObj.error.includes('nonce too low')
     ) {
       result.incrementNonce = true
     } else if (
       typeof jsonObj.error === 'string' &&
    jsonObj.error.includes('Error validating transaction') &&
    jsonObj.error.includes('orphaned, missing reference')
     ) {
       result.decrementNonce = true
     } else {
       throw (jsonObj.error)
     }
     return result
   } else if (jsonObj.tx && typeof jsonObj.tx.hash === 'string') {
     // Success!!
     return result
   } else {
     throw new Error('Invalid return value on transaction send')
   }
 }

  // asynchronous
 async broadcastTx (edgeTransaction: EdgeTransaction): Promise<EdgeTransaction> {
   const results: Array<BroadcastResults | null> = [null, null]
   const errors: Array<Error | null> = [null, null]

   // Because etherscan will allow use of a nonce that's too high, only use it if Blockcypher fails
   // If we can fix this or replace etherscan, then we can use an array of promises instead of await
   // on each broadcast type
   try {
     results[0] = await this.broadcastOverAPI(edgeTransaction)
   } catch (e) {
     errors[0] = e
   }

   let allErrored = true

   for (const e of errors) {
     if (!e) {
       allErrored = false
       break
     }
   }

   let anyResultIncNonce = false
   let anyResultDecrementNonce = false

   for (const r: BroadcastResults | null of results) {
     if (r && r.incrementNonce) {
       anyResultIncNonce = true
     }
     if (r && r.decrementNonce) {
       anyResultDecrementNonce = true
     }
   }

   if (allErrored) {
     throw errors[0] // Can only throw one error so throw the first one
   }

   this.log('broadcastTx errors:', errors)
   this.log('broadcastTx results:', results)

   if (anyResultDecrementNonce) {
     this.walletLocalData.nextNonce = bns.add(this.walletLocalData.nextNonce, '-1')
     this.log('Nonce too high. Decrementing to ' + this.walletLocalData.nextNonce.toString())
     // Nonce error. Increment nonce and try again
     const edgeTx = await this.signTx(edgeTransaction)
     const out = await this.broadcastTx(edgeTx)
     return out
   }

   if (anyResultIncNonce) {
     // All servers returned a nonce-too-low. Increment and retry sign and broadcast
     this.walletLocalData.nextNonce = bns.add(this.walletLocalData.nextNonce, '1')
     this.log('Nonce too low. Incrementing to ' + this.walletLocalData.nextNonce.toString())
     // Nonce error. Increment nonce and try again
     const edgeTx = await this.signTx(edgeTransaction)
     const out = await this.broadcastTx(edgeTx)
     return out
   }
   // Success
   this.walletLocalData.nextNonce = bns.add(this.walletLocalData.nextNonce, '1')

   return edgeTransaction
 }

  // asynchronous
 async saveTx (edgeTransaction: EdgeTransaction) {
   this.addTransaction(edgeTransaction.currencyCode, edgeTransaction)

   this.edgeTxLibCallbacks.onTransactionsChanged([edgeTransaction])
 }

 getDisplayPrivateSeed () {
   if (this.walletInfo.keys && this.walletInfo.keys.privateKey) {
     return this.walletInfo.keys.privateKey
   }
   return ''
 }

 getDisplayPublicSeed () {
   if (this.walletInfo.keys && this.walletInfo.keys.address) {
     return this.walletInfo.keys.address
   }
   return ''
 }

 dumpData (): EdgeDataDump {
   const dataDump: EdgeDataDump = {
     walletId: this.walletId.split(' - ')[0],
     walletType: this.walletInfo.type,
     pluginType: this.currencyInfo.pluginName,
     data: {
       walletLocalData: this.walletLocalData
     }
   }
   return dataDump
 }
}

export { Engine }
