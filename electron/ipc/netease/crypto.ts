import crypto from "node:crypto";

/**
 * 网易云的 weapi 加密（移植自 ncm-player 的「网易云特殊适配」部分）。
 *
 * 为什么需要它：网易云那批 `/weapi/**` 接口不接受明文 JSON，
 * 要求把 body 换成 `params` + `encSecKey` 两个字段：
 *
 *   params    = base64( AES-128-CBC( sk, base64( AES-128-CBC( presetKey, JSON ) ) ) )
 *   encSecKey = hex( RSA(pubKey, reverse(sk) 补零到 128 字节) )   ← RSA 无填充
 *
 * 也就是说要两层 AES 套一个 RSA。presetKey / 公钥模数都是固定常量。
 */

const IV = Buffer.from("0102030405060708");
const PRESET_KEY = Buffer.from("0CoJUm6Qyw8W8jud");
const PUBLIC_EXPONENT = "010001";
const MODULUS =
  "00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7";
const BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** 每层 AES 都是 128 位 CBC，iv 固定 */
const aesEncrypt = (text: Buffer, key: Buffer) => {
  const cipher = crypto.createCipheriv("aes-128-cbc", key, IV);
  return Buffer.concat([cipher.update(text), cipher.final()]);
};

/**
 * 模幂：base^exp mod m。
 * 直接用 `base ** exp % m` 会先算出一个上百万位的大整数，这里走快速幂，
 * 每次乘法后立刻取模，开销和指数位数成正比。
 */
const modPow = (base: bigint, exp: bigint, mod: bigint) => {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
};

/** RSA 无填充加密：明文右侧补 0x00 到 128 字节，输出定长 256 个 hex 字符 */
const rsaEncrypt = (secretKey: string) => {
  const reversed = Buffer.from(secretKey.split("").reverse().join(""), "utf-8");
  const padded = Buffer.concat([reversed, Buffer.alloc(128 - reversed.length)]);
  const encrypted = modPow(
    BigInt(`0x${padded.toString("hex")}`),
    BigInt(`0x${PUBLIC_EXPONENT}`),
    BigInt(`0x${MODULUS}`),
  );
  return encrypted.toString(16).padStart(256, "0");
};

const randomSecretKey = (length = 16) => {
  let out = "";
  for (let i = 0; i < length; i += 1) out += BASE62[crypto.randomInt(BASE62.length)];
  return out;
};

export const weapi = (payload: unknown) => {
  const secretKey = randomSecretKey();
  const once = aesEncrypt(Buffer.from(JSON.stringify(payload), "utf-8"), PRESET_KEY);
  const params = aesEncrypt(Buffer.from(once.toString("base64"), "utf-8"), Buffer.from(secretKey, "utf-8")).toString(
    "base64",
  );

  return {
    params,
    encSecKey: rsaEncrypt(secretKey),
  };
};

/** weapi 请求体要自己拼成 urlencoded，不能用 URLSearchParams（会多编码一层 `/`、`+` 之类） */
export const toWeapiForm = (payload: unknown) => {
  const { params, encSecKey } = weapi(payload);
  return `params=${encodeURIComponent(params)}&encSecKey=${encodeURIComponent(encSecKey)}`;
};
