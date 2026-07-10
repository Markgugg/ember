import "server-only";
import { lookup } from "dns/promises";

/**
 * Open Graph preview for a story's source article.
 *
 * This is the same metadata LinkedIn reads when it builds a post's card, so a
 * preview here is a rehearsal of the real thing rather than a mock-up. It is
 * best effort: many sites block bots, and a missing preview is a normal
 * outcome that the UI shows plainly instead of guessing.
 *
 * The URL comes from a Hacker News submission, which means it is attacker
 * influenced. A server that fetches whatever a stranger submitted is an SSRF
 * hole, so hosts that resolve to private or link-local space are refused
 * before any request goes out.
 */

export interface ArticlePreview {
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  /** False when the site refused us; the UI says so rather than inventing. */
  fetched: boolean;
}

const TTL_MS = 30 * 60 * 1000;
/**
 * Failures expire fast. Caching a block for the full TTL means one timeout or
 * one rate-limit poisons that story's preview for half an hour, which reads
 * to the user as "the preview feature stopped working".
 */
const FAILURE_TTL_MS = 60 * 1000;
const MAX_BYTES = 512 * 1024;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};

const g = globalThis as typeof globalThis & {
  __previewCache?: Map<string, { at: number; value: ArticlePreview }>;
};
const cache = (g.__previewCache ??= new Map());

/** Refuse loopback, private, link-local, and unique-local destinations. */
function isPrivateAddress(address: string): boolean {
  if (address.includes(":")) {
    const v6 = address.toLowerCase();
    return (
      v6 === "::1" ||
      v6.startsWith("fc") ||
      v6.startsWith("fd") ||
      v6.startsWith("fe80") ||
      v6.startsWith("::ffff:127.") ||
      v6.startsWith("::ffff:10.") ||
      v6.startsWith("::ffff:169.254.")
    );
  }
  const [a, b] = address.split(".").map(Number);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // cloud metadata lives here
  return false;
}

async function isSafeUrl(raw: string): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  try {
    const { address } = await lookup(url.hostname);
    if (isPrivateAddress(address)) return null;
  } catch {
    return null;
  }
  return url;
}

function meta(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) return decodeEntities(match[1].trim()).slice(0, 400);
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

/** `content` may precede or follow `property`, so both orders are tried. */
const ogPatterns = (name: string): RegExp[] => [
  new RegExp(
    `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`,
    "i",
  ),
  new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`,
    "i",
  ),
];

export async function fetchArticlePreview(
  rawUrl: string,
): Promise<ArticlePreview> {
  const cached = cache.get(rawUrl);
  if (cached) {
    const ttl = cached.value.fetched ? TTL_MS : FAILURE_TTL_MS;
    if (Date.now() - cached.at < ttl) return cached.value;
  }

  const domain = safeDomain(rawUrl);
  const empty: ArticlePreview = {
    url: rawUrl,
    domain,
    title: null,
    description: null,
    image: null,
    siteName: null,
    fetched: false,
  };

  const url = await isSafeUrl(rawUrl);
  if (!url) return empty;

  let value = empty;
  try {
    const res = await fetch(url, {
      // Cloudflare fingerprints the whole request, not just the UA: a plain
      // bot header set gets a 403 from openai.com and friends, while this one
      // gets the page. We read nothing but the public Open Graph tags of a
      // page the member is about to link to, which is exactly what LinkedIn's
      // own crawler does when it builds the card.
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    const type = res.headers.get("content-type") ?? "";
    if (res.ok && type.includes("html")) {
      const html = (await res.text()).slice(0, MAX_BYTES);
      const image = meta(html, ogPatterns("og:image"));
      value = {
        url: rawUrl,
        domain,
        title:
          meta(html, ogPatterns("og:title")) ??
          meta(html, [/<title[^>]*>([^<]{3,300})<\/title>/i]),
        description:
          meta(html, ogPatterns("og:description")) ??
          meta(html, ogPatterns("description")),
        image: image ? absolutize(image, url) : null,
        siteName: meta(html, ogPatterns("og:site_name")),
        fetched: true,
      };
    }
  } catch {
    /* blocked, slow, or not HTML — `fetched: false` says so */
  }

  cache.set(rawUrl, { at: Date.now(), value });
  return value;
}

function absolutize(src: string, base: URL): string | null {
  try {
    const resolved = new URL(src, base);
    return resolved.protocol === "https:" || resolved.protocol === "http:"
      ? resolved.toString()
      : null;
  } catch {
    return null;
  }
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "link";
  }
}

/** What LinkedIn's own crawler sends. Cloudflare decides whether to serve it. */
const LINKEDIN_BOT_UA =
  "LinkedInBot/1.0 (compatible; Mozilla/5.0; Jakarta Commons-HttpClient/3.1 +http://www.linkedin.com)";

const crawlCache = ((globalThis as typeof globalThis & {
  __crawlCache?: Map<string, { at: number; value: boolean }>;
}).__crawlCache ??= new Map());

/**
 * Can LinkedIn build a rich card from this URL on its own?
 *
 * This decides the shape of the post, and it is the difference between a
 * picture with a title and domain under it, and a bare grey box. LinkedIn
 * renders the image into its own ARTICLE card when it can crawl the page; when
 * Cloudflare 403s LinkedInBot, the card comes out empty and we upload the
 * image ourselves instead.
 *
 * We probe with LinkedIn's user agent from our own IP. Cloudflare may
 * allowlist the real crawler by address, so a `false` here can be pessimistic:
 * we'd upload an image LinkedIn could have fetched. That failure is safe (the
 * post still has a picture). The opposite is the one to avoid, and it's rarer.
 */
export async function linkedinCanRenderCard(rawUrl: string): Promise<boolean> {
  const cached = crawlCache.get(rawUrl);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const url = await isSafeUrl(rawUrl);
  if (!url) return false;

  let value = false;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": LINKEDIN_BOT_UA, Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok && (res.headers.get("content-type") ?? "").includes("html")) {
      const html = (await res.text()).slice(0, MAX_BYTES);
      // A card without an image is the flat box we're trying to avoid.
      value = Boolean(meta(html, ogPatterns("og:image")));
    }
  } catch {
    value = false;
  }

  crawlCache.set(rawUrl, { at: Date.now(), value });
  return value;
}

/** LinkedIn rejects anything larger; we also refuse to hold it in memory. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export interface FetchedImage {
  bytes: Buffer;
  contentType: string;
}

/**
 * Download an article's Open Graph image so it can be uploaded to LinkedIn.
 *
 * Same SSRF guard as the page fetch: an og:image URL is every bit as
 * attacker-influenced as the page that declared it, and it is the more
 * tempting target because the response never reaches the user's eyes.
 */
export async function fetchImageBytes(
  rawUrl: string,
): Promise<FetchedImage | null> {
  const url = await isSafeUrl(rawUrl);
  if (!url) return null;

  try {
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, Accept: "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(contentType)) return null;

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_IMAGE_BYTES) return null;

    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;

    return { bytes, contentType };
  } catch {
    return null;
  }
}
