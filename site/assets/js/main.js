/* 青禾小站官网 · 交互脚本（无第三方依赖） */
(function () {
  var APK = '/apk/sicau-pocket-latest.apk';

  // 页脚年份
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // 平台判断：安卓直接给下载，iOS 提示暂未上架
  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(ua);

  var iosHint = document.getElementById('ios-hint');
  var androidHint = document.getElementById('android-hint');
  if (isIOS && iosHint) iosHint.hidden = false;
  if (!isIOS && androidHint) androidHint.hidden = false;
  if (isIOS && iosHint) {
    var h = document.getElementById('hero-dl');
    if (h) {
      h.setAttribute('href', '#ios');
      h.removeAttribute('download');
    }
  }

  // 下载计数只在本地提示，不做任何埋点
  document.querySelectorAll('[data-dl]').forEach(function (el) {
    el.addEventListener('click', function () {
      if (isIOS) return;
      var tip = document.getElementById('dl-tip');
      if (tip) {
        tip.hidden = false;
        setTimeout(function () { tip.hidden = true; }, 4200);
      }
    });
  });

  // 复制链接（分享用）
  var copyBtn = document.getElementById('copy-link');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var text = location.origin + location.pathname;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
          copyBtn.textContent = '已复制';
          setTimeout(function () { copyBtn.textContent = '复制本页链接'; }, 1800);
        });
      }
    });
  }

  // 目录高亮（文档页）
  var toc = document.querySelectorAll('.toc a');
  if (toc.length && 'IntersectionObserver' in window) {
    var heads = document.querySelectorAll('.doc h2[id]');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        toc.forEach(function (a) {
          a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id);
        });
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    heads.forEach(function (h) { io.observe(h); });
  }
})();
