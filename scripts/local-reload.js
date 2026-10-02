(function () {
  try {
    var es = new EventSource("/__local/reload");
    es.onmessage = function (m) {
      if (m.data === "reload") window.location.reload();
    };
  } catch (e) {}
})();
