import { thumbHashToDataURL } from "thumbhash"

// This module provides thumbHash Decoding and background image address conversion methods。

// Bundle thumbHash hex The string is restored to Uint8Array。
function decodeThumbHash(thumbHash: string) {
  return Uint8Array.from(thumbHash.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [])
}

// Bundle thumbHash Convert to background image address。
function getThumbHashUrl(thumbHash?: string | null) {
  return thumbHash ? thumbHashToDataURL(decodeThumbHash(thumbHash)) : undefined
}

export { decodeThumbHash, getThumbHashUrl }
