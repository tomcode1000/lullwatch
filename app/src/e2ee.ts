// End-to-end encryption to the model's sealed key (NEAR AI Cloud E2EE v2):
// X25519 key agreement, HKDF-SHA256 ("ed25519_encryption"), XChaCha20-Poly1305.
// Wire format, hex: ephemeral public key (32) || nonce (24) || ciphertext+tag.
// Our server only ever relays these hex strings.

import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { ed25519, edwardsToMontgomeryPriv, edwardsToMontgomeryPub, x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils";

const INFO = "ed25519_encryption";

const keyFor = (shared: Uint8Array) => hkdf(sha256, shared, undefined, INFO, 32);

export type ClientKeys = { publicHex: string; x25519Secret: Uint8Array };

// A fresh identity per session, so nothing links one labour's questions to another's.
export function newClientKeys(): ClientKeys {
  const secret = ed25519.utils.randomPrivateKey();
  return { publicHex: bytesToHex(ed25519.getPublicKey(secret)), x25519Secret: edwardsToMontgomeryPriv(secret) };
}

export function seal(plaintext: string, recipientEd25519Hex: string): string {
  const recipient = edwardsToMontgomeryPub(hexToBytes(recipientEd25519Hex));
  const eph = randomBytes(32);
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(keyFor(x25519.getSharedSecret(eph, recipient)), nonce).encrypt(utf8ToBytes(plaintext));
  return bytesToHex(new Uint8Array([...x25519.getPublicKey(eph), ...nonce, ...ct]));
}

export function open(sealedHex: string, x25519Secret: Uint8Array): string {
  const data = hexToBytes(sealedHex);
  const key = keyFor(x25519.getSharedSecret(x25519Secret, data.slice(0, 32)));
  return new TextDecoder().decode(xchacha20poly1305(key, data.slice(32, 56)).decrypt(data.slice(56)));
}
