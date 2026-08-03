/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/* ============================================================
 * Hoox Brand Polish — Custom JS
 * Scroll progress bar at top of page
 * ============================================================ */
/* global document, window */

(function () {
  // Create the scroll progress bar element
  var bar = document.createElement("div");
  bar.id = "scroll-progress-bar";
  bar.style.width = "0%";
  document.body.appendChild(bar);

  function updateProgressBar() {
    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    var progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    bar.style.width = Math.min(progress, 100) + "%";
  }

  window.addEventListener("scroll", updateProgressBar, { passive: true });
  updateProgressBar(); // Initial call
})();
