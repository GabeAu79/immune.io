// The blood vessel: a smooth curve the viruses travel along.
(function () {
  'use strict';
  var CTD = (globalThis.CTD = globalThis.CTD || {});

  // Control points of the vessel, from the entry (left) to the vital organs (right).
  CTD.MAP = {
    vesselHalfWidth: 22,
    points: [
      [-40, 105], [110, 95], [225, 150], [225, 280], [115, 350], [110, 470],
      [245, 525], [375, 465], [385, 320], [395, 180], [515, 105], [650, 145],
      [685, 275], [590, 375], [600, 495], [715, 545], [850, 525]
    ]
  };

  var Path = (CTD.Path = {});

  // Turn the control points into a fine polyline using a Catmull-Rom spline.
  Path.build = function (points) {
    var pts = [];
    var n = points.length;
    function P(i) {
      return points[i < 0 ? 0 : i >= n ? n - 1 : i];
    }
    for (var i = 0; i < n - 1; i++) {
      var p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (var s = 0; s < 20; s++) {
        var t = s / 20, t2 = t * t, t3 = t2 * t;
        pts.push({
          x: 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          y: 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        });
      }
    }
    pts.push({ x: points[n - 1][0], y: points[n - 1][1] });
    var cum = [0];
    for (var j = 1; j < pts.length; j++) {
      cum.push(cum[j - 1] + CTD.dist(pts[j].x, pts[j].y, pts[j - 1].x, pts[j - 1].y));
    }
    return { pts: pts, cum: cum, length: cum[cum.length - 1] };
  };

  // Position at distance d along the path.
  Path.posAt = function (path, d, out) {
    out = out || {};
    var cum = path.cum, pts = path.pts;
    if (d <= 0) { out.x = pts[0].x; out.y = pts[0].y; return out; }
    if (d >= path.length) { out.x = pts[pts.length - 1].x; out.y = pts[pts.length - 1].y; return out; }
    var lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (cum[mid] <= d) lo = mid; else hi = mid;
    }
    var f = (d - cum[lo]) / (cum[hi] - cum[lo] || 1);
    out.x = pts[lo].x + (pts[hi].x - pts[lo].x) * f;
    out.y = pts[lo].y + (pts[hi].y - pts[lo].y) * f;
    return out;
  };

  // Closest point on the path to (x, y): returns { dist, d }.
  Path.nearest = function (path, x, y) {
    var best = Infinity, bestD = 0, pts = path.pts;
    for (var i = 0; i < pts.length - 1; i++) {
      var ax = pts[i].x, ay = pts[i].y, bx = pts[i + 1].x, by = pts[i + 1].y;
      var vx = bx - ax, vy = by - ay;
      var len2 = vx * vx + vy * vy || 1;
      var t = CTD.clamp(((x - ax) * vx + (y - ay) * vy) / len2, 0, 1);
      var dd = CTD.dist(x, y, ax + vx * t, ay + vy * t);
      if (dd < best) { best = dd; bestD = path.cum[i] + Math.sqrt(len2) * t; }
    }
    return { dist: best, d: bestD };
  };
})();
