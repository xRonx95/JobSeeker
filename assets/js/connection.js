/* Route SDK HTTP calls through the site's fixed Supabase reverse proxy.
   Authorization and RLS remain Supabase's responsibility; no server key is used. */
(() => {
  'use strict';
  window.IsabelaConnection = {
    createFetch({ upstream, proxy = '', origin = location.origin, fetcher = fetch.bind(window) }) {
      const project = new URL(upstream);
      return (input, init) => {
        const request = input instanceof Request;
        const url = new URL(request ? input.url : String(input), origin);
        if (!proxy || url.origin !== project.origin || !/^\/(auth|rest|storage)\/v1\//.test(url.pathname))
          return fetcher(input, init);
        const target = new URL(proxy.replace(/\/$/, '') + url.pathname + url.search, origin);
        // Do not replay failed writes: an interrupted response may hide a success.
        return fetcher(request ? new Request(target, input) : target.href, init);
      };
    },
  };
})();
