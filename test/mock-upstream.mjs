// Intentionally simulate all external election providers being offline.
// The dashboard must still return its scheduled House/Senate race inventory.
globalThis.fetch=async()=>new Response('Provider unavailable',{status:503});
