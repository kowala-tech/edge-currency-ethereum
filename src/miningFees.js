/**
 * Created by paul on 8/26/17.
 * @flow
 */

// import type { Fees, Fee, CalcedFees } from './types.js'
import type { Fees, CalcedFees } from './types.js'
import type { EdgeSpendInfo } from 'edge-core-js'
// import { normalizeAddress } from './utils.js'
// import { bns } from 'biggystring'

export const ES_FEE_LOW = 'low'
export const ES_FEE_STANDARD = 'standard'
export const ES_FEE_HIGH = 'high'
export const ES_FEE_CUSTOM = 'custom'

export function calcMiningFee (spendInfo: EdgeSpendInfo, networkFees: Fees): CalcedFees {
  // FIXME: Fixed values
  return { gasLimit: '21000', gasPrice: '1' }
  // if (spendInfo.spendTargets && spendInfo.spendTargets.length && spendInfo.spendTargets[0].publicAddress) {
  //   const { customNetworkFee } = spendInfo || {}
  //   if (spendInfo.networkFeeOption === ES_FEE_CUSTOM && customNetworkFee) {
  //     const { gasLimit, gasPrice } = customNetworkFee
  //     const gasPriceGwei = bns.mul(gasPrice, '1000000000')
  //     if (gasLimit && bns.gt(gasLimit, '0') && gasPrice && bns.gt(gasPrice, '0')) {
  //       return { gasLimit, gasPrice: gasPriceGwei }
  //     }
  //   }
  //   const targetAddress = normalizeAddress(spendInfo.spendTargets[0].publicAddress)
  //   let networkFeeForGasPrice:Fee = networkFees['default']
  //   let networkFeeForGasLimit:Fee = networkFees['default']
  //
  //   if (typeof networkFees[targetAddress] !== 'undefined') {
  //     networkFeeForGasLimit = networkFees[targetAddress]
  //     if (typeof networkFeeForGasLimit.gasPrice !== 'undefined') {
  //       networkFeeForGasPrice = networkFeeForGasLimit
  //     }
  //   }
  //
  //   let useLimit = 'regularTransaction'
  //   if (spendInfo.currencyCode && spendInfo.currencyCode !== 'KUSD') {
  //     useLimit = 'tokenTransaction'
  //   }
  //
  //   let networkFeeOption = 'standard'
  //   if (typeof spendInfo.networkFeeOption === 'string') {
  //     networkFeeOption = spendInfo.networkFeeOption
  //   }
  //
  //   const gasLimit = networkFeeForGasLimit.gasLimit[useLimit]
  //   let gasPrice = ''
  //   if (!spendInfo.spendTargets[0].nativeAmount) {
  //     throw new Error('ErrorInvalidNativeAmount')
  //   }
  //   let nativeAmount = spendInfo.spendTargets[0].nativeAmount
  //   if (useLimit === 'tokenTransaction') {
  //     // Small hack. Edgetimate the relative value of token to kusd as 10%
  //     nativeAmount = bns.div(nativeAmount, '10')
  //   }
  //   if (!networkFeeForGasPrice.gasPrice) {
  //     throw new Error('ErrorInvalidGasPrice')
  //   }
  //   const gasPriceObj = networkFeeForGasPrice.gasPrice
  //   switch (networkFeeOption) {
  //     case ES_FEE_LOW:
  //       gasPrice = gasPriceObj.lowFee
  //       break
  //     case ES_FEE_STANDARD:
  //       if (bns.gte(nativeAmount, networkFeeForGasPrice.gasPrice.standardFeeHighAmount)) {
  //         gasPrice = gasPriceObj.standardFeeHigh
  //         break
  //       }
  //       if (bns.lte(nativeAmount, gasPriceObj.standardFeeLowAmount)) {
  //         if (!networkFeeForGasPrice.gasPrice) {
  //           throw new Error('ErrorInvalidGasPrice')
  //         }
  //         gasPrice = networkFeeForGasPrice.gasPrice.standardFeeLow
  //         break
  //       }
  //
  //       // Scale the fee by the amount the user is sending scaled between standardFeeLowAmount and standardFeeHighAmount
  //       const lowHighAmountDiff = bns.sub(gasPriceObj.standardFeeHighAmount, gasPriceObj.standardFeeLowAmount)
  //       const lowHighFeeDiff = bns.sub(gasPriceObj.standardFeeHigh, gasPriceObj.standardFeeLow)
  //
  //       // How much above the lowFeeAmount is the user sending
  //       const amountDiffFromLow = bns.sub(nativeAmount, gasPriceObj.standardFeeLowAmount)
  //
  //       // Add this much to the low fee = (amountDiffFromLow * lowHighFeeDiff) / lowHighAmountDiff)
  //       const temp1 = bns.mul(amountDiffFromLow, lowHighFeeDiff)
  //       const addFeeToLow = bns.div(temp1, lowHighAmountDiff)
  //       gasPrice = bns.add(gasPriceObj.standardFeeLow, addFeeToLow)
  //       break
  //     case ES_FEE_HIGH:
  //       gasPrice = networkFeeForGasPrice.gasPrice.highFee
  //       break
  //     default:
  //       throw new Error(`Invalid networkFeeOption`)
  //   }
  //   const out: CalcedFees = { gasLimit, gasPrice }
  //   return out
  // } else {
  //   throw new Error('ErrorInvalidSpendInfo')
  // }
}
