(function () {
  /* Stamped by the dev server on each boot: when the shipped code differs
     from what this browser last saw, older drafts/caches go so the new code
     is the only state. Production keys are untouched — this file never loads
     on the live site. */
  var SITE_VERSION = "__SITE_VERSION__";
  try {
    var vk = "__wom_site_version";
    if (window.localStorage && localStorage.getItem(vk) !== SITE_VERSION) {
      /* Only the undo history goes: it points at revisions of older code. The
         draft, the cache and anything waiting to publish are content — the
         server keeps every section across code versions now, and the client
         rebases onto it — so an update must never throw the office's work away. */
      ["wom.cms.history"].forEach(function (k) {
        try {
          localStorage.removeItem(k);
        } catch (e) {}
      });
      try {
        localStorage.setItem(vk, SITE_VERSION);
      } catch (e) {}
    }
  } catch (e) {}
  if (typeof window === "undefined") return;
  if (window.createServerSocket) return;  window.createServerSocket = function () {
    var connId = "c" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    var listeners = {};
    var openedOnce = false;
    var failTimer = 0;
    var openedResolve, openedReject;
    var opened = new Promise(function (res, rej) {
      openedResolve = res;
      openedReject = rej;
    });
    function fire(type, ev) {
      (listeners[type] || []).slice().forEach(function (fn) {
        try {
          fn(ev);
        } catch (err) {
          setTimeout(function () {
            throw err;
          }, 0);
        }
      });
    }
    function call(method, arg) {
      return fetch("/__cms/" + method + "?conn=" + encodeURIComponent(connId), {
        method: "POST",
        headers: { "content-type": "text/plain;charset=utf-8" },
        body: arg === undefined || arg === null ? "" : String(arg),
      }).then(function (res) {
        if (!res.ok) throw new Error("rpc " + method + ": http " + res.status);
        return res.text();
      });
    }
    var es = null;
    try {
      es = new EventSource("/__cms/events?conn=" + encodeURIComponent(connId));
    } catch (err) {
      openedReject(err);
    }
    if (es) {
      es.onopen = function () {
        if (failTimer) {
          clearTimeout(failTimer);
          failTimer = 0;
        }
        fire("open", {});
        if (!openedOnce) {
          openedOnce = true;
          openedResolve();
        }
      };
      es.onmessage = function (m) {
        fire("message", { data: m.data });
      };
      es.onerror = function () {
        if (!openedOnce) {
          try {
            es.close();
          } catch (e) {}
          openedReject(new Error("cms backend unreachable"));
        } else if (!failTimer) {
          failTimer = setTimeout(function () {
            failTimer = 0;
            fire("close", { code: 1006 });
          }, 15000);
        }
      };
    }
    var rpc = new Proxy(
      {},
      {
        get: function (_, method) {
          if (method === "then" || method === "catch" || method === "finally") return undefined;
          return function (arg) {
            return call(method, arg);
          };
        },
      }
    );
    return {
      opened: opened,
      rpc: rpc,
      binaryType: "arraybuffer",
      addEventListener: function (t, fn) {
        (listeners[t] = listeners[t] || []).push(fn);
      },
      removeEventListener: function (t, fn) {
        listeners[t] = (listeners[t] || []).filter(function (f) {
          return f !== fn;
        });
      },
      close: function () {
        try {
          if (es) es.close();
        } catch (e) {}
      },
    };
  };
})();
