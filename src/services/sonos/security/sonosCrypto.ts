import CryptoJS from 'crypto-js';
import { Buffer } from 'buffer';
import { log } from '../../../utils/logger';

const TAG = 'SonosCrypto';

/**
 * Static salt appended to the household ID before the first MD5 pass.
 *
 * Verified against `references/tvonos/src/SonosDecoder.java` (`lb1.b`, the
 * static byte array named `b`). The signed Java byte values
 * `{26, 1, -89, 49, -55, 110, -98, -67, -24, 71, 81, -126, -78, 116, -73, 14}`
 * are the same bytes as below once read as unsigned.
 */
const SALT_BYTES = [
  26, 1, 167, 49, 201, 110, 158, 189, 232, 71, 81, 130, 178, 116, 183, 14,
];
const SALT_WORD_ARRAY = CryptoJS.lib.WordArray.create(new Uint8Array(SALT_BYTES) as unknown as number[]);

/**
 * Decrypts a `ThirdPartyMediaServersX` GENA payload (`"2:<base64>"`).
 *
 * Algorithm (AES/CBC/PKCS5Padding), ported 1:1 from `SonosDecoder.a()`:
 *   1. Strip the `"2:"` prefix and base64-decode the remainder.
 *   2. `iv` = first 16 bytes; `ct` = everything after.
 *   3. `h`   = MD5(utf8(householdId) ++ SALT)
 *   4. `key` = MD5(iv ++ h)
 *   5. `plain = AES-CBC-PKCS5(key, iv).decrypt(ct)`
 *   6. The last 4 bytes of `plain` are an MD5 integrity trailer over the
 *      remaining bytes — when they match, that prefix is the real XML;
 *      when they don't (or `plain` is <4 bytes), the entire decrypted
 *      buffer is returned as-is, matching the Java fallback behaviour.
 *
 * Returns `null` if `payload` does not start with `"2:"`. Returns `''`
 * (and logs) if decryption throws — callers must treat an empty string
 * as "no data", exactly as `ZoneTopologyListener.d()` does.
 */
export function decryptThirdPartyPayload(householdId: string, payload: string): string | null {
  if (!payload?.startsWith('2:')) {
    return null;
  }

  const base64Body = payload.slice(2);

  try {
    const fullWordArray = CryptoJS.enc.Base64.parse(base64Body);
    const fullBytes = wordArrayToBytes(fullWordArray);

    if (fullBytes.length < 16) {
      log.warn(TAG, 'Decoded payload shorter than the 16-byte IV; cannot decrypt');
      return '';
    }

    const ivBytes = fullBytes.slice(0, 16);
    const ctBytes = fullBytes.slice(16);
    const ivWordArray = bytesToWordArray(ivBytes);
    const ctWordArray = bytesToWordArray(ctBytes);

    // h = MD5(householdId + SALT)
    const householdWordArray = CryptoJS.enc.Utf8.parse(householdId);
    const hashInput = concatWordArrays(householdWordArray, SALT_WORD_ARRAY);
    const h = CryptoJS.MD5(hashInput);

    // key = MD5(iv + h)
    const keyInput = concatWordArrays(ivWordArray, h);
    const key = CryptoJS.MD5(keyInput);

    const decrypted = CryptoJS.AES.decrypt(
      // CryptoJS.AES.decrypt accepts a CipherParams object built directly
      // from the raw ciphertext WordArray when no OpenSSL header is present.
      CryptoJS.lib.CipherParams.create({ ciphertext: ctWordArray }),
      key,
      {
        iv: ivWordArray,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      },
    );

    const plainBytes = wordArrayToBytes(decrypted);

    if (plainBytes.length >= 4) {
      const body = plainBytes.slice(0, -4);
      const trailer = plainBytes.slice(-4);
      const bodyDigest = wordArrayToBytes(CryptoJS.MD5(bytesToWordArray(body)));

      const trailerMatches =
        bodyDigest[0] === trailer[0] &&
        bodyDigest[1] === trailer[1] &&
        bodyDigest[2] === trailer[2] &&
        bodyDigest[3] === trailer[3];

      if (trailerMatches) {
        return bytesToUtf8(body);
      }

      log.warn(TAG, 'Integrity trailer mismatch; returning full decrypted buffer as fallback');
      return bytesToUtf8(plainBytes);
    }

    return bytesToUtf8(plainBytes);
  } catch (error) {
    log.error(TAG, 'Failed to decrypt ThirdPartyMediaServersX payload', error);
    return '';
  }
}

function wordArrayToBytes(wordArray: CryptoJS.lib.WordArray): number[] {
  const { words, sigBytes } = wordArray;
  const bytes: number[] = new Array(sigBytes);
  for (let i = 0; i < sigBytes; i++) {
    bytes[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return bytes;
}

function bytesToWordArray(bytes: number[]): CryptoJS.lib.WordArray {
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    words[i >>> 2] = (words[i >>> 2] || 0) | (bytes[i] << (24 - (i % 4) * 8));
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

function concatWordArrays(
  a: CryptoJS.lib.WordArray,
  b: CryptoJS.lib.WordArray,
): CryptoJS.lib.WordArray {
  return a.clone().concat(b);
}

/**
 * Decodes bytes as UTF-8. `CryptoJS.enc.Utf8` throws on malformed sequences
 * (unlike Java's `new String(bytes, UTF_8)`, which replaces them), so this
 * falls back to the `buffer` polyfill's `toString('utf8')`, which decodes
 * leniently (invalid sequences become the replacement character) instead
 * of throwing.
 */
function bytesToUtf8(bytes: number[]): string {
  try {
    return bytesToWordArray(bytes).toString(CryptoJS.enc.Utf8);
  } catch {
    return Buffer.from(bytes).toString('utf8');
  }
}
