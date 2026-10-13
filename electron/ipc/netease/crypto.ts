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

/**
 * 网易云的 eapi 加密。
 *
 * 「一起听」那一批接口（`interface.music.163.com/eapi/listen/together/**`）只认 eapi，
 * 和 weapi 是两套完全不同的东西：
 *
 *   message = `nobody${url}use${JSON.stringify(data)}md5forencrypt`
 *   digest  = md5(message)                             ← 十六进制
 *   payload = `${url}-36cd479b6b5-${data}-36cd479b6b5-${digest}`
 *   params  = AES-128-ECB(EAPI_KEY, payload)           ← 输出十六进制大写
 *
 * 两个容易踩的点：
 *   1. 是 **ECB、没有 IV**（weapi 那套是 CBC + 固定 IV）；
 *   2. 摘要里的 `url` 用 **`/api/...`** 形式，而真正打过去的是 `/eapi/...` —— 两者不一样。
 */
const EAPI_KEY = Buffer.from("e82ckenh8dichen8");

export const eapi = (url: string, payload: unknown) => {
  const text = JSON.stringify(payload);
  const digest = crypto.createHash("md5").update(`nobody${url}use${text}md5forencrypt`).digest("hex");
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;

  const cipher = crypto.createCipheriv("aes-128-ecb", EAPI_KEY, null);
  return Buffer.concat([cipher.update(Buffer.from(data, "utf-8")), cipher.final()])
    .toString("hex")
    .toUpperCase();
};

/** eapi 的 body 就是 `params=<hex>`，hex 全是安全字符，不用再编码 */
export const toEapiForm = (url: string, payload: unknown) => `params=${eapi(url, payload)}`;

/**
 * ⚠️ eapi 的**响应体也是密文**（不是 JSON）—— 这是最容易漏的一步。
 * 直接 `JSON.parse(response.body)` 会抛错，得先用同一把 key 做 AES-128-ECB 解密。
 * 只对 eapi 通道生效，weapi / 明文接口的响应本来就是 JSON。
 */
export const eapiDecrypt = (body: Buffer) => {
  const decipher = crypto.createDecipheriv("aes-128-ecb", EAPI_KEY, null);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf-8");
};
