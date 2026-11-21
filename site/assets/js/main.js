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

  // 安装包换成带版本号的文件名：固定名 latest 容易被浏览器/运营商缓存成旧包
  fetch('/app/version.json', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (v) {
      if (!v || !v.version) return;
      var url = '/apk/sicau-pocket-' + v.version + '.apk';
      var links = document.querySelectorAll('[data-dl], a[href$="/apk/sicau-pocket-latest.apk"]');
      // 服务器可能只传了 latest（SKIP_APK=1 或还没跑新脚本），先探一下带版本号的文件在不在
      fetch(url, { method: 'HEAD', cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) return;
          links.forEach(function (el) {
            el.setAttribute('href', url);
          });
        })
        .catch(function () { /* 探测失败就保持 latest */ });
      document.querySelectorAll('[data-app-version]').forEach(function (el) {
        el.textContent = 'v' + v.version;
      });
      var size = document.querySelectorAll('[data-app-size]');
      if (v.size) {
        size.forEach(function (el) {
          el.textContent = '约 ' + Math.round(v.size / 1048576) + ' MB';
        });
      }
    })
    .catch(function () { /* 拿不到版本号就用 latest 兜底 */ });

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

