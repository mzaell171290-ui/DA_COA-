(function () {
  'use strict';

  var REDUCE_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var HAS_GSAP = typeof window.gsap !== 'undefined';

  function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
  function normalizeAngle(d) { return ((d % 360) + 360) % 360; }
  function wrapAngleSigned(deg) {
    var a = (((deg + 180) % 360) + 360) % 360;
    return a - 180;
  }

  
  function readImagesFrom(selector) {
    var nodes = Array.prototype.slice.call(document.querySelectorAll(selector));
    return nodes.map(function (fig) {
      var img = fig.querySelector('img');
      if (!img) return null;
      var kicker = fig.querySelector('.card__kicker');
      var title = fig.querySelector('h4');
      var time = fig.querySelector('time');
      return {
        src: img.getAttribute('src') || '',
        alt: img.getAttribute('alt') || '',
        kicker: kicker ? kicker.textContent.trim() : '',
        title: title ? title.textContent.trim() : '',
        date: time ? time.textContent.trim() : ''
      };
    }).filter(function (d) { return d && d.src; });
  }

  
  function buildItems(pool, segments) {
    var xCols = [];
    for (var i = 0; i < segments; i++) xCols.push(-(segments - 1) + i * 2);
    var evenYs = [-4, -2, 0, 2, 4];
    var oddYs = [-3, -1, 1, 3, 5];

    var coords = [];
    xCols.forEach(function (x, c) {
      var ys = c % 2 === 0 ? evenYs : oddYs;
      ys.forEach(function (y) { coords.push({ x: x, y: y, sizeX: 2, sizeY: 2 }); });
    });

    if (!pool.length) return coords.map(function (c) { return Object.assign({}, c, { src: '', alt: '' }); });

    var used = coords.map(function (_, i) { return pool[i % pool.length]; });
    for (var k = 1; k < used.length; k++) {
      if (used[k].src === used[k - 1].src) {
        for (var j = k + 1; j < used.length; j++) {
          if (used[j].src !== used[k].src) {
            var tmp = used[k]; used[k] = used[j]; used[j] = tmp;
            break;
          }
        }
      }
    }
    return coords.map(function (c, i) { return Object.assign({}, c, used[i]); });
  }

  function baseRotation(offsetX, offsetY, sizeX, sizeY, segments) {
    var unit = 360 / segments / 2;
    return {
      rotateY: unit * (offsetX + (sizeX - 1) / 2),
      rotateX: unit * (offsetY - (sizeY - 1) / 2)
    };
  }

  
  function DomeGallery(root, images, opts) {
    this.root = root;
    this.images = images;
    this.opts = Object.assign({
      fit: 0.55,
      minRadius: 460,
      maxRadius: Infinity,
      segments: 20,
      maxVerticalRotationDeg: 8,
      dragSensitivity: 22,
      dragDampening: 2,
      autoRotateSpeed: 0.035, 
      idleDelay: 2600
    }, opts || {});

    this.rotation = { x: 0, y: 0 };
    this.dragging = false;
    this.moved = false;
    this.inertiaRAF = null;
    this.autoRAF = null;
    this.lastInteraction = 0;
    this.focusedEl = null;

    this._buildDOM();
    this._buildTiles();
    this._observeResize();
    this._bindPointer();
    if (!REDUCE_MOTION) this._startAutoRotate();
    this._revealTiles();
  }

  DomeGallery.prototype._buildDOM = function () {
    var root = this.root;
    root.innerHTML =
      '<main class="dome-gallery__main">' +
      '<div class="dome-gallery__stage"><div class="dome-gallery__sphere"></div></div>' +
      '<div class="dome-gallery__overlay"></div>' +
      '<div class="dome-gallery__overlay--blur"></div>' +
      '<div class="dome-gallery__edge dome-gallery__edge--top"></div>' +
      '<div class="dome-gallery__edge dome-gallery__edge--bottom"></div>' +
      '</main>';

    this.main = root.querySelector('.dome-gallery__main');
    this.stage = root.querySelector('.dome-gallery__stage');
    this.sphere = root.querySelector('.dome-gallery__sphere');

    root.style.setProperty('--segments-x', this.opts.segments);
    root.style.setProperty('--segments-y', this.opts.segments);
  };

  DomeGallery.prototype._buildTiles = function () {
    var items = buildItems(this.images, this.opts.segments);
    var frag = document.createDocumentFragment();
    var self = this;

    items.forEach(function (it) {
      if (!it.src) return;
      var item = document.createElement('div');
      item.className = 'dome-item';
      item.style.setProperty('--offset-x', it.x);
      item.style.setProperty('--offset-y', it.y);
      item.style.setProperty('--item-size-x', it.sizeX);
      item.style.setProperty('--item-size-y', it.sizeY);
      item.dataset.offsetX = it.x;
      item.dataset.offsetY = it.y;
      item.dataset.sizeX = it.sizeX;
      item.dataset.sizeY = it.sizeY;

      var tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'dome-item__tile';
      tile.setAttribute('aria-label', it.alt || it.title || 'Open image');
      tile.dataset.kicker = it.kicker || '';
      tile.dataset.title = it.title || '';
      tile.dataset.date = it.date || '';

      var img = document.createElement('img');
      img.src = it.src;
      img.alt = it.alt || '';
      img.loading = 'lazy';
      img.draggable = false;
      tile.appendChild(img);

      tile.addEventListener('click', function (e) {
        
        
        
        
        
        
        
        
        if (e.detail === 0) self._openTile(tile);
      });

      item.appendChild(tile);
      frag.appendChild(item);
    });

    this.sphere.appendChild(frag);
    this._applyTransform(0, 0);
  };

  DomeGallery.prototype._revealTiles = function () {
    var tiles = Array.prototype.slice.call(this.sphere.querySelectorAll('.dome-item'));
    if (REDUCE_MOTION) { tiles.forEach(function (t) { t.classList.add('is-visible'); }); return; }
    
    tiles.forEach(function (t, i) {
      setTimeout(function () { t.classList.add('is-visible'); }, 8 * (i % 40));
    });
  };

  DomeGallery.prototype._applyTransform = function (x, y) {
    this.sphere.style.transform = 'translateZ(calc(var(--radius) * -1)) rotateX(' + x + 'deg) rotateY(' + y + 'deg)';
  };

  DomeGallery.prototype.setImages = function (images) {
    var self = this;
    this.images = images && images.length ? images : this.images;
    
    if (this.focusedEl) this._closeTile(this.focusedEl);
    this._stopInertia();

    var oldTiles = Array.prototype.slice.call(this.sphere.querySelectorAll('.dome-item'));
    var rebuild = function () {
      self.sphere.innerHTML = '';
      self._buildTiles();
      self._revealTiles();
    };
    if (oldTiles.length && !REDUCE_MOTION) {
      oldTiles.forEach(function (t) { t.classList.remove('is-visible'); });
      setTimeout(rebuild, 260);
    } else {
      rebuild();
    }
  };

  DomeGallery.prototype._observeResize = function () {
    var self = this;
    var ro = new ResizeObserver(function (entries) {
      var cr = entries[0].contentRect;
      var w = Math.max(1, cr.width), h = Math.max(1, cr.height);
      if (w < 10 || h < 10) return; 
      var basis = w >= h * 1.3 ? w : Math.min(w, h);
      var radius = clamp(basis * self.opts.fit, self.opts.minRadius, self.opts.maxRadius);
      radius = Math.min(radius, h * 1.4);
      self.root.style.setProperty('--radius', Math.round(radius) + 'px');
    });
    ro.observe(this.root);
    this._ro = ro;
  };

  DomeGallery.prototype.refresh = function () {
    var r = this.root.getBoundingClientRect();
    if (r.width > 10) {
      var basis = r.width >= r.height * 1.3 ? r.width : Math.min(r.width, r.height);
      var radius = clamp(basis * this.opts.fit, this.opts.minRadius, this.opts.maxRadius);
      radius = Math.min(radius, r.height * 1.4);
      this.root.style.setProperty('--radius', Math.round(radius) + 'px');
    }
  };

  
  DomeGallery.prototype._markInteraction = function () {
    this.lastInteraction = performance.now();
    this.root.closest('.dome-wrap') && this.root.closest('.dome-wrap').classList.add('is-interacted');
  };

  DomeGallery.prototype._stopAutoRotate = function () {
    if (this.autoRAF) { cancelAnimationFrame(this.autoRAF); this.autoRAF = null; }
  };

  DomeGallery.prototype._startAutoRotate = function () {
    var self = this;
    this._stopAutoRotate();
    var step = function () {
      var idleFor = performance.now() - self.lastInteraction;
      if (!self.dragging && !self.focusedEl && idleFor > self.opts.idleDelay) {
        var nextY = wrapAngleSigned(self.rotation.y + self.opts.autoRotateSpeed);
        self.rotation.y = nextY;
        self._applyTransform(self.rotation.x, nextY);
      }
      self.autoRAF = requestAnimationFrame(step);
    };
    this.autoRAF = requestAnimationFrame(step);
  };

  DomeGallery.prototype._stopInertia = function () {
    if (this.inertiaRAF) { cancelAnimationFrame(this.inertiaRAF); this.inertiaRAF = null; }
  };

  DomeGallery.prototype._startInertia = function (vx, vy) {
    var self = this;
    var MAX_V = 1.4;
    var vX = clamp(vx, -MAX_V, MAX_V) * 80;
    var vY = clamp(vy, -MAX_V, MAX_V) * 80;
    var frames = 0;
    var d = clamp(this.opts.dragDampening, 0, 1);
    var frictionMul = 0.94 + 0.055 * d;
    var stopThreshold = 0.015 - 0.01 * d;
    var maxFrames = Math.round(90 + 270 * d);
    this._stopInertia();
    var step = function () {
      vX *= frictionMul; vY *= frictionMul;
      if ((Math.abs(vX) < stopThreshold && Math.abs(vY) < stopThreshold) || ++frames > maxFrames) {
        self.inertiaRAF = null; return;
      }
      var nextX = clamp(self.rotation.x - vY / 200, -self.opts.maxVerticalRotationDeg, self.opts.maxVerticalRotationDeg);
      var nextY = wrapAngleSigned(self.rotation.y + vX / 200);
      self.rotation = { x: nextX, y: nextY };
      self._applyTransform(nextX, nextY);
      self.inertiaRAF = requestAnimationFrame(step);
    };
    this.inertiaRAF = requestAnimationFrame(step);
  };

  DomeGallery.prototype._bindPointer = function () {
    var self = this;
    var startPos = null, startRot = null, pointerId = null, startTile = null;

    this.main.addEventListener('pointerdown', function (e) {
      if (self.focusedEl) return;
      self._stopInertia();
      self._markInteraction();
      self.dragging = true;
      self.moved = false;
      startRot = { x: self.rotation.x, y: self.rotation.y };
      startPos = { x: e.clientX, y: e.clientY, t: performance.now() };
      startTile = e.target && e.target.closest ? e.target.closest('.dome-item__tile') : null;
      pointerId = e.pointerId;
      try { self.main.setPointerCapture(pointerId); } catch (err) {}
    });

    this.main.addEventListener('pointermove', function (e) {
      if (!self.dragging || !startPos) return;
      var dx = e.clientX - startPos.x, dy = e.clientY - startPos.y;
      
      
      
      if (!self.moved && (dx * dx + dy * dy) > 64) self.moved = true;
      var nextX = clamp(startRot.x - dy / self.opts.dragSensitivity, -self.opts.maxVerticalRotationDeg, self.opts.maxVerticalRotationDeg);
      var nextY = wrapAngleSigned(startRot.y + dx / self.opts.dragSensitivity);
      self.rotation = { x: nextX, y: nextY };
      self._applyTransform(nextX, nextY);
      var rect = self.root.getBoundingClientRect();
      self.root.style.setProperty('--spot-x', ((e.clientX - rect.left) / rect.width * 100) + '%');
      self.root.style.setProperty('--spot-y', ((e.clientY - rect.top) / rect.height * 100) + '%');
    });

    function end(e, wasCanceled) {
      if (!self.dragging) return;
      self.dragging = false;
      self._markInteraction();

      var tapTile = (!wasCanceled && !self.moved) ? startTile : null;

      if (startPos && !wasCanceled) {
        var dt = Math.max(1, performance.now() - startPos.t);
        var dx = (e.clientX != null ? e.clientX : startPos.x) - startPos.x;
        var dy = (e.clientY != null ? e.clientY : startPos.y) - startPos.y;
        var vx = clamp((dx / dt) * 16 / self.opts.dragSensitivity, -1.2, 1.2);
        var vy = clamp((dy / dt) * 16 / self.opts.dragSensitivity, -1.2, 1.2);
        if (Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01) self._startInertia(vx, vy);
      }
      startPos = null;
      startTile = null;
      setTimeout(function () { self.moved = false; }, 60);

      
      
      if (tapTile) self._openTile(tapTile);
    }
    this.main.addEventListener('pointerup', function (e) { end(e, false); });
    this.main.addEventListener('pointercancel', function (e) { end(e, true); });
    this.main.addEventListener('pointerleave', function () {
      if (!self.dragging) self.root.style.setProperty('--spot-y', '-50%');
    });
  };

  
  var sharedLightbox = null;
  function getLightbox() {
    if (sharedLightbox) return sharedLightbox;

    
    
    
    
    
    
    var supportsDialog = typeof HTMLDialogElement === 'function';
    var el = document.createElement(supportsDialog ? 'dialog' : 'div');
    el.className = 'dome-lightbox';
    el.innerHTML =
      '<div class="dome-lightbox__scrim"></div>' +
      '<button type="button" class="dome-lightbox__close" aria-label="Close">&#10005;</button>' +
      '<div class="dome-lightbox__stage">' +
      '<div class="dome-lightbox__frame">' +
      '<img alt="">' +
      '<div class="dome-lightbox__dim"></div>' +
      '<div class="dome-lightbox__caption"></div>' +
      '</div>' +
      '</div>';
    document.body.appendChild(el);

    sharedLightbox = {
      root: el,
      isDialog: supportsDialog,
      scrim: el.querySelector('.dome-lightbox__scrim'),
      closeBtn: el.querySelector('.dome-lightbox__close'),
      frame: el.querySelector('.dome-lightbox__frame'),
      img: el.querySelector('.dome-lightbox__frame img'),
      caption: el.querySelector('.dome-lightbox__caption'),
      onClose: null
    };

    function triggerClose() { if (sharedLightbox.onClose) sharedLightbox.onClose(); }
    sharedLightbox.scrim.addEventListener('click', triggerClose);
    sharedLightbox.closeBtn.addEventListener('click', triggerClose);

    if (supportsDialog) {
      
      
      
      el.addEventListener('cancel', function (e) {
        e.preventDefault();
        if (el.classList.contains('is-open')) triggerClose();
      });
    } else {
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && sharedLightbox.root.classList.contains('is-open')) triggerClose();
      });
    }

    return sharedLightbox;
  }

  
  DomeGallery.prototype._openTile = function (tile) {
    var lb = getLightbox();
    if (lb.root.classList.contains('is-open') || this.focusedEl) return;

    this.focusedEl = tile;
    this._markInteraction();
    document.body.classList.add('dg-scroll-lock');

    var tileRect = tile.getBoundingClientRect();
    var img = tile.querySelector('img');
    tile.style.visibility = 'hidden';

    lb.frame.classList.remove('is-revealed');
    lb.img.classList.remove('img-fallback');
    delete lb.img.dataset.fallbackApplied;
    lb.img.src = img.src;
    lb.img.alt = img.alt || '';

    var kicker = tile.dataset.kicker, title = tile.dataset.title, date = tile.dataset.date;
    var hasCaption = !!(kicker || title || date);
    lb.caption.innerHTML =
      (kicker ? '<p class="card__kicker">' + kicker + '</p>' : '') +
      (title ? '<h4>' + title + '</h4>' : '') +
      (date ? '<time>' + date + '</time>' : '');
    lb.caption.style.display = hasCaption ? '' : 'none';

    
    
    var vw = window.innerWidth, vh = window.innerHeight;
    var padX = Math.max(20, vw * 0.04);
    var padY = Math.max(20, vh * 0.05);
    var maxW = Math.min(vw - padX * 2, 1500);
    var maxH = vh - padY * 2;
    var aspect = tileRect.width / tileRect.height;
    var targetW = maxW, targetH = maxW / aspect;
    if (targetH > maxH) { targetH = maxH; targetW = maxH * aspect; }

    lb.frame.style.width = targetW + 'px';
    lb.frame.style.height = targetH + 'px';

    lb.root.classList.add('is-open');
    if (lb.isDialog) {
      try { lb.root.showModal(); } catch (err) {}
    }

    var finalRect = lb.frame.getBoundingClientRect();
    var dx = tileRect.left - finalRect.left;
    var dy = tileRect.top - finalRect.top;
    var sx = tileRect.width / finalRect.width;
    var sy = tileRect.height / finalRect.height;

    var self = this;
    lb.onClose = function () { self._closeTile(tile); };

    if (HAS_GSAP && !REDUCE_MOTION) {
      try {
        gsap.set(lb.frame, { x: dx, y: dy, scaleX: sx, scaleY: sy, transformOrigin: '0 0' });
        gsap.to(lb.frame, { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: 0.55, ease: 'power3.out' });
      } catch (err) {
        lb.frame.style.transform = 'none';
      }
      
      
      if (hasCaption) {
        setTimeout(function () { lb.frame.classList.add('is-revealed'); }, 420);
      }
    } else {
      lb.frame.style.transform = 'none';
      if (hasCaption) lb.frame.classList.add('is-revealed');
    }
  };

  DomeGallery.prototype._closeTile = function (tile) {
    var lb = getLightbox();
    var self = this;

    lb.frame.classList.remove('is-revealed');

    var tileRect = tile.getBoundingClientRect();
    var frameRect = lb.frame.getBoundingClientRect();
    var dx = tileRect.left - frameRect.left;
    var dy = tileRect.top - frameRect.top;
    var sx = tileRect.width / frameRect.width;
    var sy = tileRect.height / frameRect.height;

    var done = false;
    var finish = function () {
      if (done) return;
      done = true;
      lb.root.classList.remove('is-open');
      if (lb.isDialog && lb.root.open) {
        try { lb.root.close(); } catch (err) {}
      }
      lb.img.src = '';
      lb.frame.style.transform = '';
      tile.style.visibility = '';
      self.focusedEl = null;
      document.body.classList.remove('dg-scroll-lock');
    };

    if (HAS_GSAP && !REDUCE_MOTION) {
      try {
        gsap.to(lb.frame, { x: dx, y: dy, scaleX: sx, scaleY: sy, duration: 0.4, ease: 'power2.inOut', onComplete: finish });
      } catch (err) {
        finish();
      }
      
      
      setTimeout(finish, 900);
    } else {
      finish();
    }
  };

  window.DomeGallery = DomeGallery;
  window.readDomeImagesFrom = readImagesFrom;

  
  document.addEventListener('DOMContentLoaded', function () {
    var sourceSelector = '#modal-library-gallery .gallery-card';
    var images = readImagesFrom(sourceSelector);
    if (!images.length) return;

    var instances = {};

    document.querySelectorAll('[data-dome-gallery]').forEach(function (el) {
      var opts = {
        fit: parseFloat(el.getAttribute('data-fit')) || 0.55,
        minRadius: parseFloat(el.getAttribute('data-min-radius')) || 460,
        segments: parseInt(el.getAttribute('data-segments'), 10) || 20,
        idleDelay: parseFloat(el.getAttribute('data-idle-delay')) || 2600
      };
      instances[el.id] = new DomeGallery(el, images, opts);
    });

    
    
    var trigger = document.getElementById('library-gallery-trigger');
    var fullDome = instances['library-dome-full'];
    if (trigger && fullDome) {
      trigger.addEventListener('click', function () {
        requestAnimationFrame(function () { fullDome.refresh(); });
        setTimeout(function () { fullDome.refresh(); }, 120);
      });
    }

    
    var toggleBtns = document.querySelectorAll('.gallery-view-toggle .view-toggle-btn');
    var grid = document.getElementById('library-grid-fallback');
    var domeWrap = document.getElementById('library-dome-full-wrap');
    if (toggleBtns.length && grid && domeWrap) {
      toggleBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          toggleBtns.forEach(function (b) { b.classList.remove('is-active'); });
          btn.classList.add('is-active');
          var view = btn.getAttribute('data-view');
          if (view === 'dome') {
            grid.classList.add('is-hidden');
            domeWrap.classList.remove('is-hidden');
            if (fullDome) requestAnimationFrame(function () { fullDome.refresh(); });
          } else {
            domeWrap.classList.add('is-hidden');
            grid.classList.remove('is-hidden');
          }
        });
      });
    }

    
    
    
    var filterRow = document.getElementById('library-filter-row');
    if (filterRow) {
      var chips = Array.prototype.slice.call(filterRow.querySelectorAll('.filter-chip'));
      var gridFigures = grid ? Array.prototype.slice.call(grid.querySelectorAll('.gallery-card')) : [];

      
      gridFigures.forEach(function (fig) {
        var kicker = fig.querySelector('.card__kicker');
        fig.dataset.category = kicker ? kicker.textContent.trim().toLowerCase() : '';
      });

      chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
          chips.forEach(function (c) { c.classList.remove('is-active'); });
          chip.classList.add('is-active');

          var filter = (chip.getAttribute('data-filter') || chip.textContent.trim()).toLowerCase();
          var matched = filter === 'all'
            ? images
            : images.filter(function (d) { return (d.kicker || '').trim().toLowerCase() === filter; });

          var teaserDome = instances['library-dome-teaser'];
          if (teaserDome) teaserDome.setImages(matched);
          if (fullDome) fullDome.setImages(matched);

          gridFigures.forEach(function (fig) {
            var show = filter === 'all' || fig.dataset.category === filter;
            fig.classList.toggle('is-hidden', !show);
          });
        });
      });
    }
  });
})();

var siteSearchIndex = [
    { type: "Report", title: "Assessment of Disaster Risk Reduction Management at the Local Level", tags: "drrm local government assessment", action: function(){ document.getElementById('modal-report1').showModal(); } },
    { type: "Report", title: "A Special Report on Typhoon Yolanda", tags: "typhoon yolanda haiyan special report", action: function(){ document.getElementById('modal-report2').showModal(); } },
    { type: "Report", title: "Citizen Participatory Audit", tags: "citizen participatory audit cpa category", action: function(){ document.getElementById('modal-report3').showModal(); } },
    { type: "Report", title: "Audit of Flood Control Infrastructure Projects", tags: "flood control infrastructure dpwh", action: function(){ document.getElementById('modal-report4').showModal(); } },
    { type: "Report", title: "Tracking Relief Goods Distribution", tags: "relief goods distribution warehouse tracking", action: function(){ document.getElementById('modal-report5').showModal(); } },
    { type: "Report", title: "Evaluation of Early Warning Systems", tags: "early warning sensors rain gauges sirens", action: function(){ document.getElementById('modal-report6').showModal(); } },

    { type: "Article", title: "Evolution of Disaster Laws in the Philippines", tags: "history executive order 335 quezon", action: function(){ openArticle('modal-article1'); } },
    { type: "Article", title: "Developing Governance Framework on DRRM", tags: "governance drrm conference coa 2013", action: function(){ openArticle('modal-article2'); } },
    { type: "Article", title: "Why do we need an Accounting Guide?", tags: "policy ra 10121 accounting guide", action: function(){ openArticle('modal-article3'); } },
    { type: "Article", title: "Field Perspectives on DRRM Governance", tags: "governance field auditors barangay", action: function(){ openArticle('modal-article4'); } },
    { type: "Article", title: "Auditing Emergency Procurement Rules", tags: "procurement emergency negotiated purchase", action: function(){ openArticle('modal-article5'); } },
    { type: "Article", title: "Tracing Donor Fund Reconciliation", tags: "finance donor fund reconciliation international aid", action: function(){ openArticle('modal-article6'); } },
    { type: "Article", title: "Inside the Citizen Participatory Audit", tags: "cpa citizen participatory audit volunteers", action: function(){ openArticle('modal-article7'); } },
    { type: "Article", title: "Lessons From Typhoon Yolanda Recovery", tags: "tacloban typhoon yolanda recovery resettlement", action: function(){ openArticle('modal-article8'); } },

    { type: "Gallery", title: "DRRM Seminar — Commissioner Mendoza @ GACPA Convention", tags: "drrm seminar mendoza gacpa gallery", action: function(){ document.getElementById('modal-library-gallery').showModal(); } },
    { type: "Gallery", title: "DSWD — Relief Operations for the victims of typhoon yolanda", tags: "dswd relief operations yolanda gallery", action: function(){ document.getElementById('modal-library-gallery').showModal(); } },
    { type: "Gallery", title: "COA/DRR — Briefing for COA Auditors of about DRR", tags: "coa drr briefing auditors gallery", action: function(){ document.getElementById('modal-library-gallery').showModal(); } }
  ];

  function runSiteSearch() {
    var input = document.getElementById('site-search-input');
    var resultsBox = document.getElementById('site-search-results');
    var query = (input.value || "").trim().toLowerCase();

    resultsBox.innerHTML = "";

    if (query.length === 0) {
      resultsBox.style.display = "none";
      return;
    }

    var matches = siteSearchIndex.filter(function (item) {
      var haystack = (item.title + " " + item.tags + " " + item.type).toLowerCase();
      return haystack.indexOf(query) !== -1;
    });

    var table = document.createElement("table");
    table.setAttribute("width", "100%");
    table.setAttribute("cellpadding", "8");
    table.setAttribute("cellspacing", "0");
    table.setAttribute("border", "1");

    if (matches.length === 0) {
      var emptyRow = table.insertRow();
      var emptyCell = emptyRow.insertCell();
      emptyCell.innerHTML = "<font size='2' color='#777777'>No results found for \"" + query.replace(/</g, "&lt;") + "\".</font>";
    } else {
      matches.forEach(function (item, idx) {
        var row = table.insertRow();
        var cell = row.insertCell();
        cell.style.cursor = "pointer";
        cell.innerHTML =
          "<font color='#6B1E23' size='1'><b>" + item.type + "</b></font><br>" +
          "<font size='2' color='#333333'>" + item.title + "</font>";
        cell.onclick = (function (matchedItem) {
          return function () {
            document.getElementById('site-search-results').style.display = "none";
            document.getElementById('site-search-input').value = "";
            matchedItem.action();
          };
        })(item);
      });
    }

    resultsBox.appendChild(table);
    resultsBox.style.display = "block";
  }




  function openArticle(id) {
    var dlg = document.getElementById(id);
    if (!dlg) return;
    dlg.showModal();

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        dlg.style.transform = 'translateX(0)';
      });
    });
  }

  function closeArticlePanel(id) {
    var dlg = document.getElementById(id);
    if (!dlg) return;
    dlg.style.transform = 'translateX(100%)';
    setTimeout(function () {
      dlg.close();
    }, 350);
  }


  document.addEventListener('DOMContentLoaded', function () {
    var panels = document.querySelectorAll('.article-panel');
    panels.forEach(function (dlg) {
      dlg.addEventListener('click', function (event) {
        if (event.target === dlg) {
          closeArticlePanel(dlg.id);
        }
      });
      dlg.addEventListener('close', function () {
        dlg.style.transform = 'translateX(100%)';
      });
    });
  });




  (function () {
    const select = document.getElementById('language-select');
    if (!select) return;

    const phrases = {
      "Reports ▼": "Mga Ulat ▼",
      "Gallery": "Galerya",
      "Articles": "Mga Artikulo",
      "Contacts": "Mga Kontak",
      "Home": "Bahay",
      "Contact Support": "Kontakin ang Suporta",
      "Get started": "Magsimula na",
      "REPUBLIC OF THE PHILIPPINES": "REPUBLIKA NG PILIPINAS",
      "Ensuring every single peso allocated for calamity response, mitigation, and national relief reaches its true intended purpose through rigorous, citizen-transparent tracking.": "Tinitiyak na ang bawat piso na inilaan para sa pagtugon sa sakuna, pag-iwas, at pambansang tulong ay nakararating sa tunay nitong layunin sa pamamagitan ng masusing pagsubaybay na malinaw sa mamamayan.",
      "Search tracking numbers, disaster allocations, or regional reports...": "Maghanap ng mga numero ng pagsubaybay, alokasyon sa sakuna, o mga ulat sa rehiyon...",
      "LIVE ALLOCATION MONITOR (SIMULATION)": "LIVE NA MONITOR NG ALOKASYON (SIMULASYON)",
      "Processed 4 mins ago": "Naiproseso 4 minuto ang nakalipas",
      "Processed 1 hour ago": "Naiproseso 1 oras ang nakalipas",
      "Processed 3 hours ago": "Naiproseso 3 oras ang nakalipas",
      "Response Teams Tracked": "Mga Pangkat ng Tugon na Na-track",
      "WELCOME TO DISASTER AUDIT": "MALIGAYANG PAGDATING SA DISASTER AUDIT",
      "The project is an attempt to improve accountability over disaster funds.": "Ang proyekto ay isang pagtatangka upang mapabuti ang pananagutan sa pondo ng sakuna.",
      "Read more →": "Magbasa pa →",
      "Close": "Isara",
      "Download Full Report": "I-download ang Buong Ulat",
      "MORE REPORTS": "HIGIT PANG MGA ULAT",
      "All available reports": "Lahat ng available na ulat",
      "Pick a report to open it:": "Pumili ulat para buksan ito:",
      "DOCUMENTATION LIBRARY": "AKLATAN NG DOKUMENTASYON",
      "Visual documentation of Commission on Audit's disaster response audits, field operations, and rehabilitation assessments — ensuring transparency and fiscal accountability where it matters most.": "Biswal na dokumentasyon ng mga pag-audit sa pagtugon sa sakuna ng Commission on Audit, mga operasyon sa field, at mga pagtatasa sa rehabilitasyon — na tinitiyak ang transparency at pananagutan sa pananalapi kung saan ito pinakamahalaga.",
      "ALL": "LAHAT",
      "View More..": "Tingnan pa..",
      "Full Photo Gallery": "Buong Koleksyon ng Larawan",
      "Commission on Audit": "Komisyon sa Pag-audit",
      "Product": "Produkto",
      "Resources": "Mga Mapagkukunan",
      "Community": "Komunidad",
      "Company": "Kumpanya",
      "Support": "Suporta",
      "Features": "Mga Tampok",
      "Pricing": "Presyo",
      "Blog": "Blog",
      "User guides": "Mga gabay ng user",
      "Webinars": "Mga webinar",
      "Developers": "Mga developer",
      "Users": "Mga user",
      "About": "Tungkol sa",
      "Join us": "Sumali sa amin",
      "Help center": "Sentro ng tulong",
      "Chat support": "Suporta sa chat",
      "Privacy": "Pribasiya",
      "Terms": "Mga Tuntunin",
      "Quezon City": "Lungsod ng Quezon"
    };

    const textNodes = [];
    const originalTexts = new Map();

    function collectTextNodes(node) {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue && node.nodeValue.trim()) {
        textNodes.push(node);
        originalTexts.set(node, node.nodeValue);
      } else {
        for (let child = node.firstChild; child; child = child.nextSibling) {
          collectTextNodes(child);
        }
      }
    }

    collectTextNodes(document.body);

    function applyTranslation(language) {
      textNodes.forEach(function (node) {
        const original = originalTexts.get(node) || node.nodeValue;
        if (language === 'Filipino') {
          let translated = original;
          Object.keys(phrases).forEach(function (key) {
            translated = translated.split(key).join(phrases[key]);
          });
          node.nodeValue = translated;
        } else {
          node.nodeValue = original;
        }
      });
    }

    select.addEventListener('change', function () {
      applyTranslation(this.value);
    });
  })();


  
  
  
  
  
  
  function videoCarouselInit() {
    var player = document.getElementById('video-carousel-player');
    var source = document.getElementById('video-carousel-source');
    var kickerEl = document.getElementById('video-carousel-kicker');
    var titleEl = document.getElementById('video-carousel-title');
    var eyebrowEl = document.getElementById('map-eyebrow');
    var headingEl = document.getElementById('map-heading');
    var descEl = document.getElementById('map-desc');
    var mutedEl = document.getElementById('map-muted');
    var dots = Array.prototype.slice.call(document.querySelectorAll('.video-carousel__dot'));
    var prevBtn = document.getElementById('video-carousel-prev');
    var nextBtn = document.getElementById('video-carousel-next');

    
    var frame = document.querySelector('#videoCarousel .video-carousel__frame');
    var playBtn = document.getElementById('video-carousel-playpause');
    var muteBtn = document.getElementById('video-carousel-mute');
    var fullscreenBtn = document.getElementById('video-carousel-fullscreen');
    var scrubEl = document.getElementById('video-carousel-scrub');
    var progressEl = document.getElementById('video-carousel-progress');
    var timeEl = document.getElementById('video-carousel-time');
    var volumeSlider = document.getElementById('video-carousel-volume');
    var playIcon = playBtn ? playBtn.querySelector('.icon-play') : null;
    var pauseIcon = playBtn ? playBtn.querySelector('.icon-pause') : null;
    var volOnIcon = muteBtn ? muteBtn.querySelector('.icon-vol-on') : null;
    var volOffIcon = muteBtn ? muteBtn.querySelector('.icon-vol-off') : null;

    if (!player || !source || dots.length === 0) return;

    var currentIndex = Math.max(0, dots.findIndex(function (d) { return d.classList.contains('is-active'); }));

    function updateVolumeUI() {
      if (!volumeSlider) return;
      var pct = (player.muted ? 0 : (player.volume != null ? player.volume : 1)) * 100;
      volumeSlider.style.setProperty('--vol-pct', pct + '%');
    }

    function formatTime(sec) {
      if (!isFinite(sec) || sec < 0) sec = 0;
      var m = Math.floor(sec / 60);
      var s = Math.floor(sec % 60);
      return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function resetPlaybackUI() {
      if (playIcon) playIcon.hidden = false;
      if (pauseIcon) pauseIcon.hidden = true;
      if (progressEl) progressEl.style.setProperty('--progress', '0%');
      if (timeEl) timeEl.textContent = '0:00 / 0:00';
    }

    function goTo(index) {
      index = (index + dots.length) % dots.length;
      var direction = index === currentIndex ? 0 : (((index - currentIndex + dots.length) % dots.length) <= dots.length / 2 ? 1 : -1);
      currentIndex = index;
      var dot = dots[currentIndex];

      dots.forEach(function (d, i) {
        var isActive = i === currentIndex;
        d.classList.toggle('is-active', isActive);
        d.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      
      
      
      if (frame && direction !== 0) {
        frame.style.transition = 'transform .22s ease, opacity .22s ease';
        frame.style.transform = 'translateX(' + (direction * -26) + 'px)';
        frame.style.opacity = '0';
      }

      setTimeout(function () {
        player.pause();
        source.src = dot.dataset.src || '';
        if (dot.dataset.poster) player.setAttribute('poster', dot.dataset.poster);
        player.load();
        resetPlaybackUI();

        
        
        
        var playAttempt = player.play();
        if (playAttempt && playAttempt.then) {
          playAttempt.then(function () {
            if (playIcon) playIcon.hidden = true;
            if (pauseIcon) pauseIcon.hidden = false;
          }).catch(function () {});
        }

        if (kickerEl) kickerEl.textContent = dot.dataset.kicker || '';
        if (titleEl) titleEl.textContent = dot.dataset.title || '';

        if (frame && direction !== 0) {
          frame.style.transform = 'translateX(' + (direction * 26) + 'px)';
          requestAnimationFrame(function () {
            frame.style.transform = 'translateX(0)';
            frame.style.opacity = '1';
          });
        }
      }, direction !== 0 ? 200 : 0);

      var copyEls = [eyebrowEl, headingEl, descEl, mutedEl];
      copyEls.forEach(function (el) { if (el) el.style.opacity = '0'; });
      setTimeout(function () {
        if (eyebrowEl && dot.dataset.eyebrow) eyebrowEl.textContent = dot.dataset.eyebrow;
        if (headingEl && dot.dataset.heading) headingEl.textContent = dot.dataset.heading;
        if (descEl && dot.dataset.desc) descEl.textContent = dot.dataset.desc;
        if (mutedEl && dot.dataset.muted) mutedEl.textContent = dot.dataset.muted;
        copyEls.forEach(function (el) { if (el) el.style.opacity = '1'; });
      }, 180);
    }

    dots.forEach(function (dot, i) {
      dot.setAttribute('role', 'tab');
      dot.addEventListener('click', function () { goTo(i); });
    });
    if (prevBtn) prevBtn.addEventListener('click', function () { goTo(currentIndex - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { goTo(currentIndex + 1); });

    
    
    
    var barPrevBtns = Array.prototype.slice.call(document.querySelectorAll('[data-carousel-nav="prev"]'));
    var barNextBtns = Array.prototype.slice.call(document.querySelectorAll('[data-carousel-nav="next"]'));
    barPrevBtns.forEach(function (btn) { btn.addEventListener('click', function () { goTo(currentIndex - 1); }); });
    barNextBtns.forEach(function (btn) { btn.addEventListener('click', function () { goTo(currentIndex + 1); }); });

    if (playBtn) {
      playBtn.addEventListener('click', function () {
        if (player.paused) { player.play(); } else { player.pause(); }
      });
    }
    player.addEventListener('play', function () {
      if (playIcon) playIcon.hidden = true;
      if (pauseIcon) pauseIcon.hidden = false;
    });
    player.addEventListener('pause', function () {
      if (playIcon) playIcon.hidden = false;
      if (pauseIcon) pauseIcon.hidden = true;
    });
    
    
    
    var syncPlayIcon = function () {
      if (playIcon) playIcon.hidden = !player.paused;
      if (pauseIcon) pauseIcon.hidden = player.paused;
    };

    if (muteBtn) {
      muteBtn.addEventListener('click', function () {
        player.muted = !player.muted;
        if (volOnIcon) volOnIcon.hidden = player.muted;
        if (volOffIcon) volOffIcon.hidden = !player.muted;
        if (volumeSlider) volumeSlider.value = player.muted ? 0 : (player.volume || 1);
        updateVolumeUI();
      });
    }

    if (volumeSlider) {
      volumeSlider.addEventListener('input', function () {
        var vol = parseFloat(volumeSlider.value);
        player.volume = vol;
        player.muted = vol === 0;
        if (volOnIcon) volOnIcon.hidden = player.muted;
        if (volOffIcon) volOffIcon.hidden = !player.muted;
        updateVolumeUI();
      });
    }

    
    
    
    player.muted = true;
    if (volOnIcon) volOnIcon.hidden = true;
    if (volOffIcon) volOffIcon.hidden = false;
    if (volumeSlider) volumeSlider.value = 0;
    updateVolumeUI();

    
    
    player.addEventListener('ended', function () {
      goTo(currentIndex + 1);
    });

    player.addEventListener('timeupdate', function () {
      if (progressEl && player.duration) {
        progressEl.style.setProperty('--progress', (player.currentTime / player.duration * 100) + '%');
      }
      if (timeEl) timeEl.textContent = formatTime(player.currentTime) + ' / ' + formatTime(player.duration);
    });
    player.addEventListener('loadedmetadata', function () {
      if (timeEl) timeEl.textContent = formatTime(player.currentTime) + ' / ' + formatTime(player.duration);
    });

    if (scrubEl) {
      scrubEl.addEventListener('click', function (e) {
        if (!player.duration) return;
        var rect = scrubEl.getBoundingClientRect();
        var ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        player.currentTime = ratio * player.duration;
      });
    }

    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', function () {
        if (frame.requestFullscreen) frame.requestFullscreen();
        else if (frame.webkitRequestFullscreen) frame.webkitRequestFullscreen();
      });
    }

    
    
    
    if (frame) {
      var IDLE_DELAY = 2200;
      var idleTimer = null;

      var wake = function () {
        frame.classList.remove('is-idle');
        syncPlayIcon();
        clearTimeout(idleTimer);
        idleTimer = setTimeout(function () {
          if (!player.paused) frame.classList.add('is-idle');
        }, IDLE_DELAY);
      };

      frame.addEventListener('mouseenter', wake);
      frame.addEventListener('mousemove', wake);
      frame.addEventListener('click', wake);
      frame.addEventListener('touchstart', wake, { passive: true });
      frame.addEventListener('mouseleave', function () {
        clearTimeout(idleTimer);
        if (!player.paused) frame.classList.add('is-idle');
      });
      player.addEventListener('pause', function () {
        clearTimeout(idleTimer);
        frame.classList.remove('is-idle');
      });
      player.addEventListener('play', wake);
    }

    goTo(currentIndex);
  }

  document.addEventListener('DOMContentLoaded', videoCarouselInit);

  
  
  
  
  function videoCarouselSwipeInit() {
    var carousel = document.getElementById('videoCarousel');
    if (!carousel || carousel.getAttribute('data-swipe') !== 'true') return;
    var frame = carousel.querySelector('.video-carousel__frame');
    var prevBtn = document.getElementById('video-carousel-prev');
    var nextBtn = document.getElementById('video-carousel-next');
    if (!frame || !prevBtn || !nextBtn) return;

    var SWIPE_THRESHOLD = 60;  
    var dragging = false;
    var pointerId = null;
    var startX = 0, startY = 0, deltaX = 0;
    
    
    
    
    
    var CHROME_SELECTOR = '.video-carousel__controls, .video-carousel__scrub, .video-carousel__caption';

    function onPointerDown(e) {
      if (e.target.closest && e.target.closest(CHROME_SELECTOR)) return;
      dragging = true;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      deltaX = 0;
      frame.classList.add('is-dragging');
      
      
      
      if (frame.setPointerCapture) {
        try { frame.setPointerCapture(pointerId); } catch (err) {  }
      }
    }

    function onPointerMove(e) {
      if (!dragging || e.pointerId !== pointerId) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (Math.abs(dx) < Math.abs(dy)) return; 
      deltaX = dx;
      var damped = Math.max(-80, Math.min(80, dx * 0.35));
      frame.style.transform = 'translateX(' + damped + 'px)';
    }

    function endDrag(e) {
      if (!dragging || (e && e.pointerId !== pointerId)) return;
      dragging = false;
      if (frame.releasePointerCapture && pointerId !== null) {
        try { frame.releasePointerCapture(pointerId); } catch (err) {  }
      }
      pointerId = null;
      frame.classList.remove('is-dragging');
      frame.style.transform = '';
      if (deltaX <= -SWIPE_THRESHOLD) {
        nextBtn.click();
      } else if (deltaX >= SWIPE_THRESHOLD) {
        prevBtn.click();
      }
      deltaX = 0;
    }

    frame.addEventListener('pointerdown', onPointerDown);
    frame.addEventListener('pointermove', onPointerMove);
    frame.addEventListener('pointerup', endDrag);
    frame.addEventListener('pointerleave', endDrag);
    frame.addEventListener('pointercancel', endDrag);
  }

  document.addEventListener('DOMContentLoaded', videoCarouselSwipeInit);



document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.getElementById('reports-toggle');
  var dropdown = document.getElementById('reports-dropdown');
  if (!toggle || !dropdown) return;


  toggle.addEventListener('click', function (event) {
    event.stopPropagation();
    dropdown.style.display = (dropdown.style.display === 'block') ? 'none' : 'block';
  });


  var items = dropdown.querySelectorAll('.reports-dropdown-item');
  items.forEach(function (item) {
    item.addEventListener('click', function () {
      dropdown.style.display = 'none';
      var modal = document.getElementById(this.getAttribute('data-modal'));
      if (modal) modal.showModal();
    });
  });


  document.addEventListener('click', function (event) {
    if (dropdown.style.display !== 'block') return;
    var clickedInsideMenu = dropdown.contains(event.target);
    var clickedToggle = toggle.contains(event.target);
    if (!clickedInsideMenu && !clickedToggle) {
      dropdown.style.display = 'none';
    }
  });
});

(function () {
  
  
  var lightbox = document.createElement('dialog');
  lightbox.id = 'image-lightbox';

  lightbox.innerHTML =
    '<button type="button" id="lightbox-close" class="lightbox-close" aria-label="Close">&#10005;</button>' +
    '<div class="lightbox-body">' +
      '<div class="lightbox-thumbs" id="lightbox-thumbs"></div>' +
      '<div class="lightbox-stage">' +
        '<button type="button" id="lightbox-prev" class="lightbox-nav lightbox-nav--prev" aria-label="Previous photo">&#8249;</button>' +
        '<div class="lightbox-frame">' +
          '<img id="lightbox-img" src="" alt="">' +
          '<div class="lightbox-caption" id="lightbox-caption">' +
            '<p class="lightbox-caption__kicker" id="lightbox-caption-kicker"></p>' +
            '<h4 class="lightbox-caption__title" id="lightbox-caption-title"></h4>' +
            '<time class="lightbox-caption__time" id="lightbox-caption-time"></time>' +
            '<button type="button" class="lightbox-caption__read" id="lightbox-caption-read">Read the full article <span>&#8594;</span></button>' +
          '</div>' +
        '</div>' +
        '<button type="button" id="lightbox-next" class="lightbox-nav lightbox-nav--next" aria-label="Next photo">&#8250;</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(lightbox);

  
  
  var ARTICLE_TITLE_TO_ID = {
    'Evolution of Disaster Laws in the Philippines': 'article-1',
    'Developing a Governance Framework on DRRM': 'article-2',
    'Why Do We Need an Accounting Guide?': 'article-3',
    'Field Perspectives on DRRM Governance': 'article-4',
    'Auditing Emergency Procurement Rules': 'article-5',
    'Tracing Donor Fund Reconciliation': 'article-6',
    'Inside the Citizen Participatory Audit': 'article-7',
    'Lessons From Typhoon Yolanda Recovery': 'article-8',
    'Understanding the Quick Response Fund': 'article-9',
    'How Barangays Access Calamity Funds': 'article-10',
    'Auditing Post-Disaster Needs Assessments': 'article-11',
    'The Role of LGUs in Disaster Fund Utilization': 'article-12',
    'Transparency Tools: Open Data for Disaster Spending': 'article-13',
    'Case Study: Typhoon Odette Fund Tracking': 'article-14',
    'Building Resilience: Infrastructure Audit Standards': 'article-15'
  };

  var lightboxImg = document.getElementById('lightbox-img');
  var lightboxThumbs = document.getElementById('lightbox-thumbs');
  var kickerEl = document.getElementById('lightbox-caption-kicker');
  var titleEl = document.getElementById('lightbox-caption-title');
  var timeEl = document.getElementById('lightbox-caption-time');
  var readBtn = document.getElementById('lightbox-caption-read');
  var currentGalleryImages = [];
  var currentIndex = 0;

  readBtn.addEventListener('click', function () {
    var articleId = readBtn.getAttribute('data-article-id');
    if (!articleId) return;
    closeLightbox();
    setTimeout(function () { openArticle(articleId); }, 200);
  });

  
  
  
  function getCaptionData(img) {
    var scope = img.closest('figure, article') || img.parentElement;
    var kicker = scope ? scope.querySelector('.card__kicker') : null;
    var title = scope ? scope.querySelector('h4') : null;
    var time = scope ? scope.querySelector('time') : null;
    return {
      kicker: kicker ? kicker.textContent.trim() : '',
      title: title ? title.textContent.trim() : (img.getAttribute('alt') || ''),
      time: time ? time.textContent.trim() : ''
    };
  }

  function setActiveThumb(index) {
    var thumbs = lightboxThumbs.querySelectorAll('.lightbox-thumb');
    thumbs.forEach(function (t, i) {
      t.classList.toggle('is-active', i === index);
    });
    var activeThumb = thumbs[index];
    if (activeThumb && activeThumb.scrollIntoView) {
      activeThumb.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function showImageAt(index) {
    if (!currentGalleryImages.length) return;
    currentIndex = (index + currentGalleryImages.length) % currentGalleryImages.length;
    var img = currentGalleryImages[currentIndex];
    var data = getCaptionData(img);
    lightboxImg.classList.remove('img-fallback');
    delete lightboxImg.dataset.fallbackApplied;
    lightboxImg.src = img.getAttribute('src');
    lightboxImg.alt = data.title;
    kickerEl.textContent = data.kicker;
    kickerEl.style.display = data.kicker ? '' : 'none';
    titleEl.textContent = data.title;
    timeEl.textContent = data.time;
    timeEl.style.display = data.time ? '' : 'none';

    var articleId = ARTICLE_TITLE_TO_ID[data.title];
    if (articleId) {
      readBtn.setAttribute('data-article-id', articleId);
      readBtn.style.display = 'inline-flex';
    } else {
      readBtn.removeAttribute('data-article-id');
      readBtn.style.display = 'none';
    }

    setActiveThumb(currentIndex);
  }

  function buildThumbs(imgGroup) {
    lightboxThumbs.innerHTML = '';
    imgGroup.forEach(function (img, i) {
      var thumb = document.createElement('button');
      thumb.type = 'button';
      thumb.className = 'lightbox-thumb';
      thumb.setAttribute('aria-label', 'Show photo ' + (i + 1) + ' of ' + imgGroup.length);
      var thumbImg = document.createElement('img');
      thumbImg.src = img.getAttribute('src');
      thumbImg.alt = '';
      thumbImg.loading = 'lazy';
      thumb.appendChild(thumbImg);
      thumb.addEventListener('click', function () { showImageAt(i); });
      lightboxThumbs.appendChild(thumb);
    });
  }

  function openLightbox(clickedImg, imgGroup) {
    currentGalleryImages = imgGroup;
    buildThumbs(imgGroup);
    showImageAt(imgGroup.indexOf(clickedImg));
    lightbox.showModal();
  }

  function closeLightbox() {
    lightbox.close();
  }

  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('lightbox-prev').addEventListener('click', function () { showImageAt(currentIndex - 1); });
  document.getElementById('lightbox-next').addEventListener('click', function () { showImageAt(currentIndex + 1); });

  lightbox.addEventListener('click', function (event) {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', function (event) {
    if (!lightbox.open) return;
    if (event.key === 'ArrowLeft') showImageAt(currentIndex - 1);
    if (event.key === 'ArrowRight') showImageAt(currentIndex + 1);
    if (event.key === 'Escape') closeLightbox();
  });

  function attachLightboxToContainer(containerSelector) {
    var container = document.querySelector(containerSelector);
    if (!container) return;
    var imgs = Array.prototype.slice.call(container.querySelectorAll('img'));
    imgs.forEach(function (img) {
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', function (event) {
        event.stopPropagation();
        openLightbox(img, imgs);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    attachLightboxToContainer('#library-grid-fallback');
    attachLightboxToContainer('#modal-articles-gallery');
  });

  
  
  
  
  
  function newsCarouselInit() {
    var track = document.getElementById('newsCarouselTrack');
    var prevBtn = document.getElementById('newsCarouselPrev');
    var nextBtn = document.getElementById('newsCarouselNext');
    var dotsWrap = document.getElementById('newsCarouselDots');
    if (!track || !prevBtn || !nextBtn || !dotsWrap) return;

    var slides = Array.prototype.slice.call(track.querySelectorAll('.article-carousel__slide'));
    if (!slides.length) return;

    var SCALE_MAX = 1.08;   
    var SCALE_MIN = 0.82;   
    var OPACITY_MIN = 0.45;

    
    
    var DOT_COUNT = Math.min(5, slides.length);
    dotsWrap.innerHTML = '';
    var dots = [];
    for (var d = 0; d < DOT_COUNT; d++) {
      (function (dotIndex) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'article-carousel__dot';
        dot.setAttribute('aria-label', 'Go to group ' + (dotIndex + 1));
        dot.addEventListener('click', function () {
          scrollToSlide(slideIndexForDot(dotIndex));
        });
        dotsWrap.appendChild(dot);
        dots.push(dot);
      })(d);
    }

    
    function dotIndexForSlide(i) {
      if (DOT_COUNT <= 1) return 0;
      return Math.min(DOT_COUNT - 1, Math.floor(i * DOT_COUNT / slides.length));
    }
    
    function slideIndexForDot(dotIndex) {
      if (slides.length <= 1) return 0;
      return Math.round(dotIndex * (slides.length - 1) / (DOT_COUNT - 1 || 1));
    }

    
    
    function distances() {
      var trackRect = track.getBoundingClientRect();
      var trackCenter = trackRect.left + trackRect.width / 2;
      return slides.map(function (slide) {
        var r = slide.getBoundingClientRect();
        return (r.left + r.width / 2) - trackCenter;
      });
    }

    function nearestIndex(dists) {
      var best = 0, bestAbs = Infinity;
      dists.forEach(function (d, i) {
        var abs = Math.abs(d);
        if (abs < bestAbs) { bestAbs = abs; best = i; }
      });
      return best;
    }

    function scrollToSlide(i, offsetPx) {
      offsetPx = offsetPx || 0;
      i = Math.max(0, Math.min(i, slides.length - 1));
      var trackRect = track.getBoundingClientRect();
      var slideRect = slides[i].getBoundingClientRect();
      var slideCenter = (slideRect.left - trackRect.left) + track.scrollLeft + slideRect.width / 2;
      track.scrollTo({ left: slideCenter - track.clientWidth / 2 - offsetPx, behavior: 'smooth' });
    }

    function paintFrame() {
      var trackRect = track.getBoundingClientRect();
      var halfWidth = trackRect.width / 2 || 1;
      var dists = distances();
      var active = nearestIndex(dists);

      slides.forEach(function (slide, i) {
        var norm = Math.min(1, Math.abs(dists[i]) / halfWidth);
        var scale = SCALE_MAX - norm * (SCALE_MAX - SCALE_MIN);
        var opacity = 1 - norm * (1 - OPACITY_MIN);
        slide.style.transform = 'scale(' + scale.toFixed(3) + ')';
        slide.style.opacity = opacity.toFixed(3);
        slide.classList.toggle('is-active', i === active);
      });

      var activeDot = dotIndexForSlide(active);
      dots.forEach(function (dot, i) { dot.classList.toggle('is-active', i === activeDot); });
      prevBtn.disabled = track.scrollLeft <= 4;
      nextBtn.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 4;
    }

    prevBtn.addEventListener('click', function () { scrollToSlide(nearestIndex(distances()) - 1); });
    nextBtn.addEventListener('click', function () { scrollToSlide(nearestIndex(distances()) + 1); });

    var ticking = false;
    track.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(function () { paintFrame(); ticking = false; });
        ticking = true;
      }
    }, { passive: true });

    window.addEventListener('resize', paintFrame);

    
    
    requestAnimationFrame(function () {
      scrollToSlide(Math.min(1, slides.length - 1));
      paintFrame();
    });
  }

  document.addEventListener('DOMContentLoaded', newsCarouselInit);
})();


(function () {
  // ---- voyage-style slider driven by the article list ----
  function articleFanInit() {
    var stage = document.getElementById('articleFanStage');
    var dataSource = document.getElementById('vslDataSource');
    if (!stage || !dataSource) return;

    var articles = Array.prototype.slice.call(dataSource.querySelectorAll('.article-fan__card')).map(function (card) {
      var img = card.querySelector('img');
      var h4 = card.querySelector('h4');
      var p = card.querySelector('p');
      var kicker = card.closest ? null : null;
      return {
        id: card.getAttribute('data-article-id') || '',
        img: img ? img.getAttribute('src') : '',
        alt: img ? img.getAttribute('alt') : '',
        title: h4 ? h4.textContent : '',
        desc: p ? p.textContent : ''
      };
    });
    var len = articles.length;
    if (!len) return;

    var slideNodes = Array.prototype.slice.call(document.querySelectorAll('#vslSlides > .vsl-slide'));
    var infoNodes = Array.prototype.slice.call(document.querySelectorAll('#vslInfos > .vsl-slide-info'));
    var dotsWrap = document.getElementById('articleFanDots');
    var prevBtn = document.getElementById('articleFanPrev');
    var nextBtn = document.getElementById('articleFanNext');
    var openBtn = document.getElementById('articleFanOpen');
    if (slideNodes.length < 3 || infoNodes.length < 3) return;

    var active = 0;
    var dots = [];

    function wrap(n) { return ((n % len) + len) % len; }

    function fillSlide(node, article, index) {
      var img = node.querySelector('.vsl-slide-image');
      if (img) {
        if (img.getAttribute('src') !== article.img) img.setAttribute('src', article.img);
        img.setAttribute('alt', article.alt || article.title);
      }
      var inner = node.querySelector('.vsl-slide__inner');
      if (inner) {
        inner.style.setProperty('--rotX', '0deg');
        inner.style.setProperty('--rotY', '0deg');
        inner.style.setProperty('--bgPosX', '0%');
        inner.style.setProperty('--bgPosY', '0%');
      }
      var kicker = node.querySelector('[data-kicker]');
      var title = node.querySelector('[data-title]');
      var desc = node.querySelector('[data-description]');
      if (kicker) kicker.textContent = 'Article ' + (index + 1) + ' of ' + len;
      if (title) title.textContent = article.title;
      if (desc) desc.textContent = article.desc;
      node.setAttribute('data-article-id', article.id);
    }

    function fillInfo(node, article, index) {
      var kicker = node.querySelector('[data-kicker] span');
      var title = node.querySelector('[data-title] span');
      var desc = node.querySelector('[data-description] span');
      if (kicker) kicker.textContent = 'Article ' + (index + 1) + ' of ' + len;
      if (title) title.textContent = article.title;
      if (desc) desc.textContent = article.desc;
    }

    function render() {
      var nextIdx = wrap(active + 1);
      var prevIdx = wrap(active - 1);

      [
        [active, 'data-current', slideNodes[0], infoNodes[0]],
        [nextIdx, 'data-next', slideNodes[1], infoNodes[1]],
        [prevIdx, 'data-previous', slideNodes[2], infoNodes[2]]
      ].forEach(function (entry) {
        var idx = entry[0], attr = entry[1], slideNode = entry[2], infoNode = entry[3];
        var article = articles[idx];

        ['data-current', 'data-next', 'data-previous'].forEach(function (a) {
          slideNode.removeAttribute(a);
          infoNode.removeAttribute(a);
        });
        slideNode.setAttribute(attr, '');
        infoNode.setAttribute(attr, '');

        fillSlide(slideNode, article, idx);
        fillInfo(infoNode, article, idx);
      });

      if (openBtn) openBtn.setAttribute('data-article-id', articles[active].id);

      dots.forEach(function (dot, i) {
        var on = i === active;
        dot.classList.toggle('is-active', on);
        dot.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }

    function setActive(i) {
      active = wrap(i);
      render();
    }

    window.__articleFanSetActiveById = function (id) {
      var idx = articles.findIndex(function (a) { return a.id === id; });
      if (idx > -1) setActive(idx);
    };

    function buildDots() {
      if (!dotsWrap) return;
      dotsWrap.innerHTML = '';
      dots = articles.map(function (article, i) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'article-carousel__dot';
        dot.setAttribute('role', 'tab');
        dot.setAttribute('aria-label', 'Show article ' + (i + 1));
        dot.addEventListener('click', function () { setActive(i); restartAutoplay(); });
        dotsWrap.appendChild(dot);
        return dot;
      });
    }

    slideNodes.forEach(function (node) {
      node.addEventListener('click', function () {
        if (node.hasAttribute('data-current')) {
          var id = node.getAttribute('data-article-id');
          if (id && typeof openArticle === 'function') openArticle(id);
        } else if (node.hasAttribute('data-next')) {
          setActive(active + 1);
          restartAutoplay();
        } else if (node.hasAttribute('data-previous')) {
          setActive(active - 1);
          restartAutoplay();
        }
      });
    });

    if (prevBtn) prevBtn.addEventListener('click', function () { setActive(active - 1); restartAutoplay(); });
    if (nextBtn) nextBtn.addEventListener('click', function () { setActive(active + 1); restartAutoplay(); });
    if (openBtn) {
      openBtn.addEventListener('click', function () {
        var id = openBtn.getAttribute('data-article-id');
        if (id && typeof openArticle === 'function') openArticle(id);
      });
    }

    var AUTOPLAY_DELAY = 4000;
    var autoplayTimer = null;

    function stopAutoplay() {
      if (autoplayTimer) {
        clearInterval(autoplayTimer);
        autoplayTimer = null;
      }
    }

    function startAutoplay() {
      stopAutoplay();
      autoplayTimer = setInterval(function () { setActive(active + 1); }, AUTOPLAY_DELAY);
    }

    function restartAutoplay() {
      if (autoplayTimer) startAutoplay();
    }

    var stage = document.getElementById('articleFanStage');
    if (stage) {
      stage.addEventListener('mouseenter', stopAutoplay);
      stage.addEventListener('mouseleave', startAutoplay);
      stage.addEventListener('focusin', stopAutoplay);
      stage.addEventListener('focusout', startAutoplay);
    }

    dotsWrap && dotsWrap.addEventListener('click', restartAutoplay);

    window.__articleFanRefresh = render;
    window.__articleFanStartAutoplay = startAutoplay;
    window.__articleFanStopAutoplay = stopAutoplay;

    buildDots();
    render();
    startAutoplay();
  }

  document.addEventListener('DOMContentLoaded', articleFanInit);
})();


(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.getElementById('cardNav');
    var content = document.getElementById('cardNavContent');
    var toggle = document.getElementById('hamburgerToggle');
    if (!nav || !content || !toggle || typeof gsap === 'undefined') return;

    var cards = Array.prototype.slice.call(content.querySelectorAll('.nav-card'));
    var isExpanded = false;
    var tl = null;
    var ease = 'power3.out';

    function calculateHeight() {
      var isMobile = window.matchMedia('(max-width: 768px)').matches;
      if (isMobile) {
        var wasVisibility = content.style.visibility;
        var wasPointerEvents = content.style.pointerEvents;
        var wasPosition = content.style.position;
        var wasHeight = content.style.height;

        content.style.visibility = 'visible';
        content.style.pointerEvents = 'auto';
        content.style.position = 'static';
        content.style.height = 'auto';

        
        void content.offsetHeight;

        var topBar = 60;
        var padding = 16;
        var contentHeight = content.scrollHeight;

        content.style.visibility = wasVisibility;
        content.style.pointerEvents = wasPointerEvents;
        content.style.position = wasPosition;
        content.style.height = wasHeight;

        return topBar + contentHeight + padding;
      }
      return 260;
    }

    function createTimeline() {
      gsap.set(nav, { height: 60, overflow: 'hidden' });
      gsap.set(cards, { y: 50, opacity: 0 });

      var timeline = gsap.timeline({ paused: true });

      timeline.to(nav, {
        height: calculateHeight,
        duration: 0.4,
        ease: ease
      });

      timeline.to(cards, { y: 0, opacity: 1, duration: 0.4, ease: ease, stagger: 0.08 }, '-=0.1');

      return timeline;
    }

    tl = createTimeline();

    function toggleMenu() {
      if (!tl) return;
      if (!isExpanded) {
        isExpanded = true;
        toggle.classList.add('open');
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-label', 'Close menu');
        nav.classList.add('open');
        content.setAttribute('aria-hidden', 'false');
        tl.play(0);
      } else {
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
        tl.eventCallback('onReverseComplete', function () {
          isExpanded = false;
          nav.classList.remove('open');
          content.setAttribute('aria-hidden', 'true');
        });
        tl.reverse();
      }
    }

    toggle.addEventListener('click', toggleMenu);
    toggle.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleMenu();
      }
    });

    window.addEventListener('resize', function () {
      if (!tl) return;

      if (isExpanded) {
        var newHeight = calculateHeight();
        gsap.set(nav, { height: newHeight });

        tl.kill();
        var newTl = createTimeline();
        if (newTl) {
          newTl.progress(1);
          tl = newTl;
        }
      } else {
        tl.kill();
        var freshTl = createTimeline();
        if (freshTl) tl = freshTl;
      }
    });
  });
})();


document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('cardSwap');
  if (!container || typeof gsap === 'undefined') return;

  const CARD_DISTANCE = 45;
  const VERTICAL_DISTANCE = 50;
  const SKEW_AMOUNT = 5;
  const DELAY = 3500;
  const EASING = 'elastic';

  const config = EASING === 'elastic'
    ? {
        ease: 'elastic.out(0.6,0.9)',
        durDrop: 1.6,
        durMove: 1.6,
        durReturn: 1.6,
        promoteOverlap: 0.85,
        returnDelay: 0.05
      }
    : {
        ease: 'power1.inOut',
        durDrop: 0.8,
        durMove: 0.8,
        durReturn: 0.8,
        promoteOverlap: 0.45,
        returnDelay: 0.2
      };

  const cards = Array.from(container.querySelectorAll('.card'));
  const total = cards.length;
  let order = cards.map((_, i) => i);
  let intervalId = null;
  let currentTl = null;
  let focusedCardIndex = null;

  const makeSlot = (i, distX, distY, totalCount) => ({
    x: i * distX,
    y: -i * distY,
    z: -i * distX * 1.5,
    zIndex: totalCount - i
  });

  const placeNow = (el, slot, skew) => {
    gsap.set(el, {
      x: slot.x,
      y: slot.y,
      z: slot.z,
      xPercent: -50,
      yPercent: -50,
      skewY: skew,
      transformOrigin: 'center center',
      zIndex: slot.zIndex,
      force3D: true
    });
  };

  cards.forEach((card, i) => {
    placeNow(card, makeSlot(i, CARD_DISTANCE, VERTICAL_DISTANCE, total), SKEW_AMOUNT);
  });

  const swap = () => {
    if (order.length < 2 || focusedCardIndex !== null) return;

    const [front, ...rest] = order;
    const elFront = cards[front];
    const tl = gsap.timeline();
    currentTl = tl;

    tl.to(elFront, {
      y: '+=450',
      duration: config.durDrop,
      ease: config.ease
    });

    tl.addLabel('promote', `-=${config.durDrop * config.promoteOverlap}`);
    rest.forEach((idx, i) => {
      const el = cards[idx];
      const slot = makeSlot(i, CARD_DISTANCE, VERTICAL_DISTANCE, total);
      tl.set(el, { zIndex: slot.zIndex }, 'promote');
      tl.to(el, {
        x: slot.x,
        y: slot.y,
        z: slot.z,
        duration: config.durMove,
        ease: config.ease
      }, `promote+=${i * 0.12}`);
    });

    const backSlot = makeSlot(total - 1, CARD_DISTANCE, VERTICAL_DISTANCE, total);
    tl.addLabel('return', `promote+=${config.durMove * config.returnDelay}`);

    tl.call(() => {
      gsap.set(elFront, { zIndex: backSlot.zIndex });
    }, null, 'return');

    tl.to(elFront, {
      x: backSlot.x,
      y: backSlot.y,
      z: backSlot.z,
      duration: config.durReturn,
      ease: config.ease
    }, 'return');

    tl.call(() => {
      order = [...rest, front];
    });
  };

  const startAutoSwap = () => {
    if (!intervalId && focusedCardIndex === null) {
      intervalId = setInterval(swap, DELAY);
    }
  };

  const stopAutoSwap = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  cards.forEach((card, cardIdx) => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      if (focusedCardIndex === cardIdx) {
        unfocusCards();
        return;
      }
      focusCard(cardIdx);
    });
  });

  const focusCard = (index) => {
    stopAutoSwap();
    if (currentTl) currentTl.pause();

    focusedCardIndex = index;

    cards.forEach((el, i) => {
      if (i === index) {
        el.classList.add('focused');
        gsap.to(el, {
          x: 0,
          y: 0,
          z: 100,
          skewY: 0,
          zIndex: 999,
          duration: 1.2,
          ease: 'power3.out'
        });
      } else {
        el.classList.remove('focused');
        const slotPos = order.indexOf(i);
        const slot = makeSlot(slotPos, CARD_DISTANCE, VERTICAL_DISTANCE, total);
        gsap.to(el, {
          x: slot.x,
          y: slot.y,
          z: slot.z - 50,
          skewY: SKEW_AMOUNT,
          zIndex: slot.zIndex,
          duration: 0.8,
          ease: 'power2.out'
        });
      }
    });
  };

  const unfocusCards = () => {
    focusedCardIndex = null;
    cards.forEach((el, i) => {
      el.classList.remove('focused');
      const slotPos = order.indexOf(i);
      const slot = makeSlot(slotPos, CARD_DISTANCE, VERTICAL_DISTANCE, total);
      gsap.to(el, {
        x: slot.x,
        y: slot.y,
        z: slot.z,
        skewY: SKEW_AMOUNT,
        zIndex: slot.zIndex,
        duration: 1,
        ease: 'power3.out'
      });
    });
    startAutoSwap();
  };

  document.body.addEventListener('click', () => {
    if (focusedCardIndex !== null) unfocusCards();
  });

  requestAnimationFrame(() => {
    startAutoSwap();
  });
});


document.addEventListener('DOMContentLoaded', function () {
  var wrap = document.getElementById('reportsCarousel');
  var track = document.getElementById('reports-grid');
  var row = document.getElementById('reports-filter-row');
  if (!wrap || !track) return;

  var prevBtn = wrap.querySelector('.carousel__arrow--prev');
  var nextBtn = wrap.querySelector('.carousel__arrow--next');
  var allItems = Array.prototype.slice.call(track.querySelectorAll('.carousel__item'));
  var moreItem = track.querySelector('.carousel__item--more');

  function activeItems() {
    return allItems.filter(function (item) { return item.style.display !== 'none'; });
  }

  function stepSize() {
    var items = activeItems();
    if (!items.length) return track.clientWidth;
    var gap = parseFloat(getComputedStyle(track).gap) || 0;
    return items[0].getBoundingClientRect().width + gap;
  }

  function updateArrows() {
    var maxScroll = track.scrollWidth - track.clientWidth - 1;
    prevBtn.disabled = track.scrollLeft <= 0;
    nextBtn.disabled = track.scrollLeft >= maxScroll;
  }

  prevBtn.addEventListener('click', function () {
    track.scrollBy({ left: -stepSize(), behavior: 'smooth' });
  });
  nextBtn.addEventListener('click', function () {
    track.scrollBy({ left: stepSize(), behavior: 'smooth' });
  });
  track.addEventListener('scroll', updateArrows, { passive: true });
  window.addEventListener('resize', updateArrows);

  if (row) {
    var chips = Array.prototype.slice.call(row.querySelectorAll('.filter-chip'));
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        chips.forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');

        var filter = chip.getAttribute('data-filter');
        allItems.forEach(function (item) {
          if (item === moreItem) return;
          var match = filter === 'all' || item.getAttribute('data-category') === filter;
          item.style.display = match ? '' : 'none';
        });
        track.scrollTo({ left: 0, behavior: 'smooth' });
        updateArrows();
      });
    });
  }

  updateArrows();
});


(function () {
  function distMetric(x, y, x2, y2) {
    const dx = x - x2, dy = y - y2;
    return dx * dx + dy * dy;
  }

  function findClosestEdge(mouseX, mouseY, width, height) {
    const topEdgeDist = distMetric(mouseX, mouseY, width / 2, 0);
    const bottomEdgeDist = distMetric(mouseX, mouseY, width / 2, height);
    return topEdgeDist < bottomEdgeDist ? 'top' : 'bottom';
  }

  function buildMarqueePart(text, image, marqueeTextColor) {
    const part = document.createElement('div');
    part.className = 'marquee__part';
    part.style.color = marqueeTextColor;

    const span = document.createElement('span');
    span.textContent = text;
    part.appendChild(span);

    if (image) {
      const img = document.createElement('div');
      img.className = 'marquee__img';
      img.style.backgroundImage = "url('" + image + "')";
      part.appendChild(img);
    }
    return part;
  }

  function buildSubpanel(item, opts) {
    const panel = document.createElement('div');
    panel.className = 'menu__subpanel';
    panel.style.borderColor = opts.borderColor;

    (item.items || []).forEach(function (sub) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'menu__subitem';
      row.style.color = opts.textColor;
      row.innerHTML = '<span>' + (sub.label || '') + '</span><span aria-hidden="true">&rarr;</span>';
      row.addEventListener('click', function (e) {
        e.stopPropagation();
        if (sub.modalId) {
          const dlg = document.getElementById(sub.modalId);
          if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
        } else if (sub.link) {
          window.location.href = sub.link;
        }
      });
      panel.appendChild(row);
    });

    return panel;
  }

  function setupMenuItem(item, opts) {
    const link = item.link || '#';
    const text = item.text || '';
    const image = item.image || '';
    const hasSubitems = !!(item.items && item.items.length);

    const itemEl = document.createElement('div');
    itemEl.className = 'menu__item';
    itemEl.style.borderColor = opts.borderColor;

    const a = document.createElement('a');
    a.className = 'menu__item-link';
    a.href = link;
    a.style.color = opts.textColor;
    a.textContent = text;
    itemEl.appendChild(a);

    const marquee = document.createElement('div');
    marquee.className = 'marquee';
    marquee.style.backgroundColor = opts.marqueeBgColor;

    const innerWrap = document.createElement('div');
    innerWrap.className = 'marquee__inner-wrap';

    const inner = document.createElement('div');
    inner.className = 'marquee__inner';
    inner.setAttribute('aria-hidden', 'true');

    innerWrap.appendChild(inner);
    marquee.appendChild(innerWrap);
    itemEl.appendChild(marquee);

    function renderRepetitions() {
      inner.innerHTML = '';
      const ref = buildMarqueePart(text, image, opts.marqueeTextColor);
      inner.appendChild(ref);
      const contentWidth = ref.offsetWidth || 200;
      const viewportWidth = window.innerWidth;
      const needed = Math.ceil(viewportWidth / Math.max(contentWidth, 1)) + 2;
      const repetitions = Math.max(4, needed);

      inner.innerHTML = '';
      for (let i = 0; i < repetitions; i++) {
        inner.appendChild(buildMarqueePart(text, image, opts.marqueeTextColor));
      }
      startMarquee(contentWidth);
    }

    function startMarquee(contentWidth) {
      if (!contentWidth) return;
      inner.style.setProperty('--marquee-shift', '-' + contentWidth + 'px');
      inner.style.setProperty('--marquee-duration', opts.speed + 's');
      inner.classList.add('marquee__inner--anim');
    }

    renderRepetitions();
    window.addEventListener('resize', renderRepetitions);

    a.addEventListener('mouseenter', function (ev) {
      const rect = itemEl.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const edge = findClosestEdge(x, y, rect.width, rect.height);

      marquee.style.transition = 'none';
      innerWrap.style.transition = 'none';
      marquee.style.transform = 'translate3d(0,' + (edge === 'top' ? '-101%' : '101%') + ',0)';
      innerWrap.style.transform = 'translate3d(0,' + (edge === 'top' ? '101%' : '-101%') + ',0)';

      // force reflow so the browser registers the start position before transitioning
      void marquee.offsetHeight;

      marquee.style.transition = '';
      innerWrap.style.transition = '';
      marquee.style.transform = 'translate3d(0,0%,0)';
      innerWrap.style.transform = 'translate3d(0,0%,0)';
    });

    a.addEventListener('mouseleave', function (ev) {
      const rect = itemEl.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const edge = findClosestEdge(x, y, rect.width, rect.height);

      marquee.style.transform = 'translate3d(0,' + (edge === 'top' ? '-101%' : '101%') + ',0)';
      innerWrap.style.transform = 'translate3d(0,' + (edge === 'top' ? '101%' : '-101%') + ',0)';
    });

    if (hasSubitems) {
      a.setAttribute('aria-expanded', 'false');
      const subpanel = buildSubpanel(item, opts);
      a.addEventListener('click', function (e) {
        e.preventDefault();
        const willOpen = !itemEl.classList.contains('is-open');
        const nav = itemEl.closest('.menu');
        if (nav) {
          nav.querySelectorAll('.menu__item.is-open').forEach(function (openItem) {
            if (openItem !== itemEl) {
              openItem.classList.remove('is-open');
              const openLink = openItem.querySelector('.menu__item-link');
              if (openLink) openLink.setAttribute('aria-expanded', 'false');
            }
          });
        }
        itemEl.classList.toggle('is-open', willOpen);
        a.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });
      itemEl._subpanel = subpanel;
    }

    return itemEl;
  }

  window.createFlowingMenu = function (container, items, options) {
    if (!container) return;
    options = options || {};
    const opts = {
      speed: options.speed || 15,
      textColor: options.textColor || '#fff',
      bgColor: options.bgColor || '#120F17',
      marqueeBgColor: options.marqueeBgColor || '#fff',
      marqueeTextColor: options.marqueeTextColor || '#120F17',
      borderColor: options.borderColor || '#fff'
    };

    container.classList.add('menu-wrap');
    container.style.backgroundColor = opts.bgColor;

    const nav = document.createElement('nav');
    nav.className = 'menu';
    (items || []).forEach(function (item) {
      const itemEl = setupMenuItem(item, opts);
      nav.appendChild(itemEl);
      if (itemEl._subpanel) nav.appendChild(itemEl._subpanel);
    });

    container.innerHTML = '';
    container.appendChild(nav);
  };
})();


(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var isNarrow = window.matchMedia('(max-width: 780px)').matches;

  document.addEventListener('DOMContentLoaded', function () {
    if (!reduceMotion && !isNarrow) {
      initScrollParallax();
      if (isFinePointer) {
        initHeroCursorParallax();
        initTilt();
      }
    }
    initStaggerGrids();
  });

  
  function initScrollParallax() {
    var els = Array.prototype.slice.call(document.querySelectorAll('[data-parallax-speed]'));
    if (!els.length) return;

    var ticking = false;

    function update() {
      var vCenter = window.innerHeight / 2;
      els.forEach(function (el) {
        var speed = parseFloat(el.getAttribute('data-parallax-speed')) || 0;
        var rect = el.getBoundingClientRect();
        var elCenter = rect.top + rect.height / 2;
        var delta = (vCenter - elCenter) * speed;
        el.style.transform = 'translate3d(0,' + delta.toFixed(1) + 'px,0)';
      });
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  
  function initHeroCursorParallax() {
    var hero = document.querySelector('.hero');
    if (!hero) return;
    var layers = Array.prototype.slice.call(hero.querySelectorAll('[data-depth]'));
    if (!layers.length) return;

    var targetX = 0, targetY = 0, curX = 0, curY = 0, raf = null;

    function tick() {
      curX += (targetX - curX) * 0.08;
      curY += (targetY - curY) * 0.08;
      layers.forEach(function (layer) {
        var depth = parseFloat(layer.getAttribute('data-depth')) || 0;
        var dx = (curX * depth * 18).toFixed(1);
        var dy = (curY * depth * 12).toFixed(1);
        layer.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';
      });
      if (Math.abs(curX - targetX) > 0.001 || Math.abs(curY - targetY) > 0.001) {
        raf = window.requestAnimationFrame(tick);
      } else {
        raf = null;
      }
    }

    hero.addEventListener('pointermove', function (e) {
      var rect = hero.getBoundingClientRect();
      targetX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      targetY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      if (!raf) raf = window.requestAnimationFrame(tick);
    });
    hero.addEventListener('pointerleave', function () {
      targetX = 0; targetY = 0;
      if (!raf) raf = window.requestAnimationFrame(tick);
    });
  }

  
  function initTilt() {
    
    
    
    var selector = '#reports-grid .card, .gallery-card, .modal .article-card';
    var cards = Array.prototype.slice.call(document.querySelectorAll(selector));
    var MAX_DEG = 7;

    cards.forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var rect = card.getBoundingClientRect();
        var px = (e.clientX - rect.left) / rect.width;
        var py = (e.clientY - rect.top) / rect.height;
        var rotY = (px - 0.5) * MAX_DEG * 2;
        var rotX = (0.5 - py) * MAX_DEG * 2;
        card.setAttribute('data-tilt-active', '');
        card.style.transform =
          'perspective(900px) rotateX(' + rotX.toFixed(2) + 'deg) rotateY(' + rotY.toFixed(2) + 'deg) translateY(-4px) scale(1.015)';
      });
      card.addEventListener('pointerleave', function () {
        card.removeAttribute('data-tilt-active');
        card.style.transform = '';
      });
    });
  }

  
  function initStaggerGrids() {
    var grids = Array.prototype.slice.call(document.querySelectorAll('[data-stagger-grid]'));
    if (!grids.length) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

    grids.forEach(function (grid) { observer.observe(grid); });
  }
})();


var ARTICLES = {
  'article-1': {
    kicker: 'History',
    title: 'Evolution of Disaster Laws in the Philippines',
    hero: 'Resources\\article1.jpg',
    heroAlt: 'Archival photo of early disaster relief efforts',
    paragraphs: [
      "The Philippine disaster management system traces its origin to 1941, when President Manuel L. Quezon issued Executive Order No. 335, creating one of the country's earliest civil emergency structures. What began as a wartime coordination measure slowly evolved, over the following decades, into a standing framework for calamity response.",
      "Successive laws expanded that early foundation: the creation of the National Disaster Coordinating Council, and eventually the passage of Republic Act No. 10121 in 2010, which shifted the national posture from pure response toward risk reduction and long-term resilience planning.",
      "Understanding this legal lineage matters for audit work, since each layer of legislation left behind its own funding mechanism and reporting requirement — many of which auditors still have to reconcile against each other when tracing how a single peso moved from national allocation to local disbursement."
    ]
  },
  'article-2': {
    kicker: 'Governance',
    title: 'Developing a Governance Framework on DRRM',
    hero: 'Resources\\article 3.jpg',
    heroAlt: 'COA disaster risk reduction governance conference',
    paragraphs: [
      "The Commission on Audit conducted a disaster risk reduction conference on July 30, 2013, at the COA Professional Development Center, bringing together auditors, local government finance officers, and DRRM council representatives to align on shared reporting standards.",
      "Discussions centered on a recurring problem: local disaster funds are managed by hundreds of separate LGUs, each with its own record-keeping conventions, making it difficult to build a single, comparable national picture of calamity spending.",
      "The conference produced a working governance framework intended to standardize how DRRM funds are budgeted, utilized, and reported, laying groundwork that later audits would build on when assessing local-level compliance."
    ]
  },
  'article-3': {
    kicker: 'Policy',
    title: 'Why Do We Need an Accounting Guide?',
    hero: 'Resources\\article 4.jpg',
    heroAlt: 'Disaster scene illustrating need for accounting guide',
    paragraphs: [
      "Republic Act No. 10121, better known as the Philippine Disaster Risk Reduction and Management Act of 2010, requires every province, city, and municipality to set aside a Local Disaster Risk Reduction and Management Fund — but the law itself does not specify a uniform chart of accounts for tracking it.",
      "Without a common accounting guide, similar transactions were being booked under different line items from one LGU to the next, making consolidated national reporting error-prone and slowing down audit verification.",
      "A dedicated accounting guide addresses this gap directly: standardizing account codes for calamity-fund receipts, quick-response releases, and mitigation projects so that an auditor reviewing any LGU's books can trace a transaction the same way, everywhere in the country."
    ]
  },
  'article-4': {
    kicker: 'Field notes',
    title: 'Field Perspectives on DRRM Governance',
    hero: 'Resources/art5.jpg',
    heroAlt: 'Aerial photo of disaster-affected community',
    paragraphs: [
      "On-the-ground notes from the Commission on Audit's 2013 disaster risk reduction conference series capture a gap between how DRRM policy reads on paper and how it plays out during an actual local emergency response.",
      "Municipal auditors described the pressure of verifying rapid, negotiated purchases in the days immediately following a calamity declaration, when normal procurement timelines are deliberately compressed to get relief moving.",
      "Their feedback fed directly into later guidance on documentation shortcuts that preserve auditability without slowing down emergency response — a balance the Commission continues to refine with every major disaster."
    ]
  },
  'article-5': {
    kicker: 'Procurement',
    title: 'Auditing Emergency Procurement Rules',
    hero: 'Resources/art6.jpg',
    heroAlt: 'Auditing emergency procurement',
    paragraphs: [
      "Once a state of calamity is declared, government units are allowed to bypass competitive bidding in favor of negotiated procurement, so relief goods and services can reach affected communities without delay.",
      "That flexibility is exactly why it draws close audit attention: negotiated purchases still need supporting canvass sheets, a justification for the chosen supplier, and proof that prices were reasonable given prevailing market conditions at the time.",
      "This article walks through the specific documentary requirements auditors check first, and the red flags — repeat suppliers, round-number pricing, missing delivery receipts — that typically trigger a deeper review."
    ]
  },
  'article-6': {
    kicker: 'Finance',
    title: 'Tracing Donor Fund Reconciliation',
    hero: 'Resources/art7.jpg',
    heroAlt: 'Tracing donor fund reconciliation',
    paragraphs: [
      "International aid pledges announced in the news rarely arrive as a single lump-sum transfer. They tend to move in tranches, sometimes as cash, sometimes as in-kind goods or contracted services delivered directly by the donor organization.",
      "This article looks at how auditors reconcile donor commitments with actual bank transfers, in-kind deliveries, and program reports, and why gaps between a pledge announced in the news and the assistance that is formally recorded do not always mean funds went missing, but do need to be explained.",
      "Clear reconciliation also protects donor relationships: partner agencies are more likely to commit future assistance when they can see, transparently, how prior contributions were used and accounted for."
    ]
  },
  'article-7': {
    kicker: 'CPA',
    title: 'Inside the Citizen Participatory Audit',
    hero: 'Resources/art8.jpg',
    heroAlt: 'Inside the citizen participatory audit',
    paragraphs: [
      "The Citizen Participatory Audit program pairs COA auditors with trained community volunteers, giving ordinary residents a direct role in verifying whether a disaster-recovery project on the ground matches what was reported on paper.",
      "Volunteers walk project sites, photograph completed work, and compare it against engineering specifications and disbursement vouchers — often catching discrepancies, like under-delivered materials or incomplete works, well before a formal audit team arrives.",
      "Beyond catching irregularities early, the program builds public trust: communities that helped verify a project are far more invested in holding it, and future ones, to account."
    ]
  },
  'article-8': {
    kicker: 'Tacloban',
    title: 'Lessons From Typhoon Yolanda Recovery',
    hero: 'Resources/art9.jpg',
    heroAlt: 'Lessons from Typhoon Yolanda recovery',
    paragraphs: [
      "More than a decade after Typhoon Yolanda made landfall, resettlement sites around Tacloban remain one of the most closely audited rehabilitation efforts in Philippine history, precisely because of the scale of funding involved.",
      "Reviews of the recovery period highlighted delays between fund release and actual housing turnover, driven by land titling issues and shifting contractor timelines — problems that have since informed how later calamity-housing programs structure their milestones and fund releases.",
      "The recovery also left behind a clearer audit trail for future disasters: standardized resettlement fund codes and a stronger expectation that housing units be inspected before being marked as delivered in official reports."
    ]
  },
  'article-9': {
    kicker: 'Quick Response Fund',
    title: 'Understanding the Quick Response Fund',
    hero: 'Resources/10.jpg',
    heroAlt: 'Quick response fund explainer',
    paragraphs: [
      "The Quick Response Fund, or QRF, is a standby fund carried by key national agencies specifically for the first days after a calamity is declared — before slower, longer-term rehabilitation budgets can be mobilized.",
      "Because it is meant to move fast, the QRF is released against a lighter documentary threshold than ordinary appropriations, which makes swift reconciliation afterward especially important: agencies are expected to file utilization reports within a set window once the immediate response phase ends.",
      "This article breaks down how a QRF release is triggered, who can access it, and how auditors later match utilization reports back against actual relief distribution records."
    ]
  },
  'article-10': {
    kicker: 'Local government',
    title: 'How Barangays Access Calamity Funds',
    hero: 'Resources/art11.jpg',
    heroAlt: 'Barangay officials reviewing calamity fund documents',
    paragraphs: [
      "National calamity allocations do not go directly to barangays. Funds are first released to the province, city, or municipality, which in turn programs a share for barangay-level disaster preparedness and response activities.",
      "That extra hop in the chain is where a lot of confusion tends to start: residents sometimes assume a national relief announcement means money has already reached their barangay, when in practice it may still be moving through LGU-level budgeting and liquidation steps.",
      "This article traces that full paper trail, from the national allocation letter down to the barangay disaster fund utilization report, so readers can see exactly where in the process a given tranche of assistance currently sits."
    ]
  },
  'article-11': {
    kicker: 'Assessment',
    title: 'Auditing Post-Disaster Needs Assessments',
    hero: 'Resources/art12.jpg',
    heroAlt: 'Auditors reviewing a post-disaster needs assessment',
    paragraphs: [
      "Before a single peso of rehabilitation funding is programmed, agencies conduct a post-disaster needs assessment to estimate the scale of damage — to housing, infrastructure, agriculture, and livelihoods — across the affected area.",
      "Because every subsequent rehabilitation budget is sized against that early estimate, an inflated or understated assessment can distort how much funding a community ultimately receives, long before any construction begins.",
      "Auditors treat the needs assessment itself as an audit subject: checking the methodology used, the sampling of affected sites, and whether the final figures were revised as more accurate ground data came in."
    ]
  },
  'article-12': {
    kicker: 'Governance',
    title: 'The Role of LGUs in Disaster Fund Utilization',
    hero: 'Resources/art13.jpg',
    heroAlt: 'Local government unit disaster fund meeting',
    paragraphs: [
      "Local government units carry most of the day-to-day discretion over how disaster funds are actually spent — deciding which barangays get priority, which projects move first, and how mitigation versus response spending is balanced within their local fund.",
      "That discretion is deliberate: local officials are best positioned to know their own community's needs. But it also means oversight has to work at two levels at once — national policy setting the rules, and local audit teams checking that LGU decisions stayed inside them.",
      "This article outlines where that line between local discretion and national audit oversight is drawn, and the specific reports LGUs are required to file to keep that oversight possible."
    ]
  },
  'article-13': {
    kicker: 'Transparency',
    title: 'Transparency Tools: Open Data for Disaster Spending',
    hero: 'Resources/artmissingpic1.jpg',
    heroAlt: 'Open data dashboard for disaster spending',
    paragraphs: [
      "Alongside formal audit reports, the Commission publishes open datasets covering calamity-fund allocations, releases, and utilization, letting researchers, journalists, and ordinary citizens query the numbers directly rather than waiting for a published report.",
      "These datasets are what power the live tracking figures featured elsewhere on this site — the same underlying records auditors use, made available in a format anyone can filter by region, fund source, or reporting period.",
      "This article walks through what each published dataset actually contains, how frequently it is updated, and how to trace a disaster peso from the national dataset down to a specific region or project."
    ]
  },
  'article-14': {
    kicker: 'Case study',
    title: 'Case Study: Typhoon Odette Fund Tracking',
    hero: 'Resources/art15.jpg',
    heroAlt: 'Typhoon Odette fund tracking case study',
    paragraphs: [
      "Typhoon Odette cut a wide path across the Visayas and parts of Mindanao, triggering calamity declarations in dozens of provinces at once and testing how well the country's post-Yolanda fund-tracking reforms actually held up under a large, multi-region response.",
      "This case study breaks the response down region by region, comparing how quickly relief and rehabilitation funds moved in areas with stronger pre-existing local audit capacity versus areas that had to build tracking processes from scratch during the response itself.",
      "The comparison points to a clear lesson for future storms: regions that already had standardized fund-tracking templates in place before Odette hit were able to reconcile spending noticeably faster once the immediate response phase ended."
    ]
  },
  'article-15': {
    kicker: 'Standards',
    title: 'Building Resilience: Infrastructure Audit Standards',
    hero: 'Resources/art15.jpg',
    heroAlt: 'Engineers inspecting resilient infrastructure',
    paragraphs: [
      "Flood control and other mitigation infrastructure is meant to reduce damage from the next disaster, which makes it especially important that these projects are actually built to the specifications they were funded under — not just completed on paper.",
      "This article walks through the technical checklist auditors use during site inspections: verifying material specifications, structural dimensions against approved plans, and drainage capacity against the design flow rates the project was supposed to handle.",
      "Projects that fail these checks are flagged for further review well before the next storm season arrives, giving implementing agencies a window to correct deficiencies rather than discovering them the hard way."
    ]
  }
};

function renderArticleContent(id) {
  var data = ARTICLES[id];
  if (!data) return false;

  var heroEl = document.getElementById('articlePanelHero');
  var kickerEl = document.getElementById('articlePanelKicker');
  var titleEl = document.getElementById('articlePanelTitle');
  var textEl = document.getElementById('articlePanelText');
  var scrollEl = document.getElementById('articlePanelScroll');

  if (heroEl) { heroEl.src = data.hero; heroEl.alt = data.heroAlt || data.title; }
  if (kickerEl) kickerEl.textContent = data.kicker;
  if (titleEl) titleEl.textContent = data.title;
  if (textEl) {
    textEl.innerHTML = data.paragraphs.map(function (p) {
      return '<p>' + p + '</p>';
    }).join('');
  }
  if (scrollEl) scrollEl.scrollTop = 0;

  return true;
}

function openArticle(id) {
  if (!ARTICLES[id]) return;
  var dlg = document.getElementById('articlePanel');
  if (!dlg) return;

  renderArticleContent(id);
  if (typeof window.__articleFanSetActiveById === 'function') {
    window.__articleFanSetActiveById(id);
  }

  if (!dlg.open) {
    dlg.showModal();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        dlg.style.transform = 'translateX(0)';
        if (typeof window.__articleFanRefresh === 'function') window.__articleFanRefresh();
        if (typeof window.__articleFanStartAutoplay === 'function') window.__articleFanStartAutoplay();
      });
    });
  } else if (typeof window.__articleFanRefresh === 'function') {
    window.__articleFanRefresh();
    if (typeof window.__articleFanStartAutoplay === 'function') window.__articleFanStartAutoplay();
  }
}

function closeArticlePanel() {
  var dlg = document.getElementById('articlePanel');
  if (!dlg) return;
  dlg.style.transform = 'translateX(100%)';
  if (typeof window.__articleFanStopAutoplay === 'function') window.__articleFanStopAutoplay();
  setTimeout(function () {
    dlg.close();
  }, 380);
}

document.addEventListener('DOMContentLoaded', function () {
  var panels = document.querySelectorAll('.article-panel');
  panels.forEach(function (dlg) {
    dlg.addEventListener('close', function () {
      dlg.style.transform = 'translateX(100%)';
      if (typeof window.__articleFanStopAutoplay === 'function') window.__articleFanStopAutoplay();
    });
  });
});


(function () {
  var REDUCE_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DURATION = 320;
  var EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

  function collapsedHeight(details, summary) {
    var cs = getComputedStyle(details);
    return summary.offsetHeight + parseFloat(cs.paddingTop || 0) + parseFloat(cs.paddingBottom || 0);
  }

  function initAccordionItem(details) {
    var summary = details.querySelector('summary');
    if (!summary || REDUCE_MOTION) return;

    var animation = null;
    var isClosing = false;
    var isExpanding = false;

    summary.addEventListener('click', function (e) {
      e.preventDefault();
      details.style.overflow = 'hidden';
      if (isClosing || !details.open) {
        expand();
      } else if (isExpanding || details.open) {
        shrink();
      }
    });

    function shrink() {
      isClosing = true;
      var startHeight = details.offsetHeight + 'px';
      var endHeight = collapsedHeight(details, summary) + 'px';
      if (animation) animation.cancel();
      animation = details.animate(
        { height: [startHeight, endHeight] },
        { duration: DURATION, easing: EASING }
      );
      animation.onfinish = function () { onFinish(false); };
      animation.oncancel = function () { isClosing = false; };
    }

    function expand() {
      details.style.height = details.offsetHeight + 'px';
      details.open = true;
      window.requestAnimationFrame(function () { grow(); });
    }

    function grow() {
      isExpanding = true;
      var startHeight = details.offsetHeight + 'px';
      var endHeight = details.scrollHeight + 'px';
      if (animation) animation.cancel();
      animation = details.animate(
        { height: [startHeight, endHeight] },
        { duration: DURATION, easing: EASING }
      );
      animation.onfinish = function () { onFinish(true); };
      animation.oncancel = function () { isExpanding = false; };
    }

    function onFinish(isOpen) {
      details.open = isOpen;
      animation = null;
      isClosing = false;
      isExpanding = false;
      details.style.height = '';
      details.style.overflow = '';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.accordion__item').forEach(initAccordionItem);
  });
})();


(function () {
  var PLACEHOLDER_SRC = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">' +
    '<rect width="400" height="300" fill="#f2ece7"/>' +
    '<g fill="none" stroke="#8a3a3f" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.35">' +
    '<rect x="55" y="55" width="290" height="190" rx="12"/>' +
    '<circle cx="135" cy="115" r="20"/>' +
    '<path d="M55 205 L155 125 L225 185 L285 135 L345 205"/>' +
    '</g>' +
    '</svg>'
  );

  document.addEventListener('error', function (event) {
    var img = event.target;
    if (!img || img.tagName !== 'IMG' || img.dataset.fallbackApplied) return;
    img.dataset.fallbackApplied = 'true';
    img.src = PLACEHOLDER_SRC;
    img.classList.add('img-fallback');
  }, true);
})();