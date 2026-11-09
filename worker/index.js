// Cloudflare serves every file in the repo straight from its CDN. This Worker
// only runs when a request matches no static file, which happens for two
// reasons: the file is over the 25 MiB static-asset limit and lives in the R2
// bucket instead (same path as its key), or the URL really does not exist.

export default {
  async fetch(request, env) {
    if (request.method === "GET" || request.method === "HEAD") {
      const file = await fromBucket(request, env);
      if (file) return file;
    }
    const page = await env.ASSETS.fetch(new URL("/404.html", request.url));
    return new Response(page.body, { status: 404, headers: page.headers });
  },
};

async function fromBucket(request, env) {
  let key;
  try {
    key = decodeURIComponent(new URL(request.url).pathname.slice(1));
  } catch {
    return null;
  }
  if (!key || !env.BIG_FILES) return null;

  const object = await env.BIG_FILES.get(key, {
    range: request.headers,
    onlyIf: request.headers,
  });
  if (!object) return null;

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/octet-stream");
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=86400");

  // A failed If-None-Match returns the object without a body.
  if (!("body" in object)) return new Response(null, { status: 304, headers });

  let status = 200;
  let length = object.size;
  if (request.headers.has("range") && object.range) {
    const r = object.range;
    const suffix = r.suffix == null ? null : Math.min(r.suffix, object.size);
    const offset = suffix == null ? r.offset ?? 0 : object.size - suffix;
    length = suffix == null ? r.length ?? object.size - offset : suffix;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    status = 206;
  }
  headers.set("content-length", String(length));
  return new Response(request.method === "HEAD" ? null : object.body, { status, headers });
}
