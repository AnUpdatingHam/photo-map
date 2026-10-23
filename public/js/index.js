/* ===== 主地图：高德 JS API ===== */
var map = new AMap.Map('map', {
    zoom: 12,
    center: [116.397428, 39.90923],
    viewMode: '2D'
});
map.addControl(new AMap.ToolBar());
map.addControl(new AMap.Scale());

var infoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -20) });

/* ===== 照片分组 / 点位轮播 / 灯箱 ===== */
var bounds = [];
var groups = {};
var timeline = [];   // 全量照片（供时间轨迹与时光轴面板）
// 缩放收拢：默认开启，地图缩小到阈值以下时照片收成大头钉
var imgHideOnZoom = true;
var compactMode = false;
var ZOOM_PIN_THRESHOLD = 13;

function parseTime(p) {
    var s = p.start_time || p.data_time || '';
    if (!s) return 0;
    var d = new Date(String(s).replace(' ', 'T'));
    return isNaN(d.getTime()) ? 0 : d.getTime();
}
function dwellMin(p) {
    var a = parseTime(p);
    var b = p.end_time ? new Date(String(p.end_time).replace(' ', 'T')).getTime() : 0;
    if (!a || !b || b <= a) return 0;
    return (b - a) / 60000;
}

function photoCaption(p) {
    return (p.caption && String(p.caption).trim()) ? p.caption : (p.event || '');
}

function ensureGroup(lng, lat) {
    var key = lng.toFixed(4) + ',' + lat.toFixed(4);
    if (!groups[key]) {
        groups[key] = { key: key, lng: lng, lat: lat, photos: [], idx: 0, timer: null, marker: null };
    }
    return groups[key];
}

// 缩小视图时的大头钉（针尖正好落在经纬度点上）
function renderPin(g) {
    var n = g.photos.length;
    g.marker.setContent(
        '<div style="position:relative;display:flex;flex-direction:column;align-items:center;">' +
        '<div style="width:30px;height:30px;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);background:linear-gradient(135deg,#7c5cff,#e08a9b);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;">' +
        '<span style="transform:rotate(45deg);color:#fff;font-size:12px;font-weight:700;line-height:1;">' + (n > 1 ? n : '✦') + '</span></div>' +
        '<div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid #7c5cff;margin-top:-1px;"></div>' +
        '</div>'
    );
}

function renderChip(g) {
    if (compactMode) { renderPin(g); return; }
    var p = g.photos[g.idx];
    var src = p.thumbnail || p.url;
    var n = g.photos.length;
    var badge = n > 1
        ? '<span style="position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 4px;background:#1e88e5;color:#fff;border-radius:9px;font-size:11px;line-height:18px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.3);">' + n + '</span>' : '';
    var cap = photoCaption(p);
    var capHtml = cap ? '<div style="max-width:120px;margin-top:3px;padding:2px 6px;background:rgba(0,0,0,.65);color:#fff;border-radius:4px;font-size:11px;line-height:1.4;">' + cap + '</div>' : '';
    // 图片/角标/签名包在相对容器里，针尖固定在最底部并落在经纬度点（anchor bottom-center）
    g.marker.setContent(
        '<div style="display:flex;flex-direction:column;align-items:center;">' +
        '<div style="position:relative;">' +
        '<div style="position:relative;width:52px;height:52px;border-radius:10px;overflow:hidden;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);background:#eef1f4;">' +
        '<div class="gm-spin" style="position:absolute;left:50%;top:50%;margin:-9px 0 0 -9px;"></div>' +
        '<img src="' + src + '" style="width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .35s;" onload="this.style.opacity=1;var s=this.parentNode.querySelector(\'.gm-spin\');if(s)s.remove()" onerror="var s=this.parentNode.querySelector(\'.gm-spin\');if(s)s.remove()">' +
        '</div>' + badge + capHtml +
        '</div>' +
        '<div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:9px solid #fff;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3));margin-top:-1px;"></div>' +
        '</div>'
    );
}

function applyZoomStyle() {
    compactMode = imgHideOnZoom && map.getZoom() < ZOOM_PIN_THRESHOLD;
    Object.keys(groups).forEach(function (k) { renderChip(groups[k]); });
}

function startCarousel(g) {
    if (g.timer) clearInterval(g.timer);
    if (g.photos.length < 2) return;
    g.timer = setInterval(function () {
        g.idx = (g.idx + 1) % g.photos.length;
        renderChip(g);
    }, 2600);
}

function addPhotoToMap(photo) {
    var lng = parseFloat(photo.lng), lat = parseFloat(photo.lat);
    if (!lng || !lat) return;
    var g = ensureGroup(lng, lat);
    g.photos.push(photo);
    timeline.push(photo);
    scheduleTrail();
    if (!g.marker) {
        g.marker = new AMap.Marker({
            position: [lng, lat],
            content: '<div class="gm-spin" style="width:52px;height:52px;border-radius:8px;background:#eef1f4;display:flex;align-items:center;justify-content:center;"></div>',
            anchor: 'bottom-center'
        });
        g.marker.setMap(map);
        bounds.push(new AMap.LngLat(lng, lat));
        g.marker.on('click', function () { openCard(g, 0); });
    }
    g.idx = g.photos.length - 1;
    renderChip(g);
    startCarousel(g);
}

(data.rows || []).forEach(function (photo) { addPhotoToMap(photo); });
if (bounds.length) {
    map.setFitView(null, false, [60, 60, 60, 60]);
}
map.on('zoomchange', applyZoomStyle);
applyZoomStyle();

/* ===== 彩色时间轨迹链（可开关，停留越久节点越亮） ===== */
var trailLayers = [];
var trailOn = true;
var trailTimer = null;

function sortedTimeline() {
    return timeline.slice().filter(function (p) { return p.lng && p.lat; })
        .sort(function (a, b) { return parseTime(a) - parseTime(b); });
}

/* 流光：沿轨迹循环流动的光点，示意先后顺序与走向 */
var flowMarker = null, flowTimer = null, flowSegs = [];
function stopFlow() {
    if (flowTimer) { clearInterval(flowTimer); flowTimer = null; }
    if (flowMarker) { flowMarker.setMap(null); flowMarker = null; }
}
function startFlow() {
    stopFlow();
    if (!trailOn || !flowSegs.length) return;
    var total = flowSegs.reduce(function (s, x) { return s + x.len; }, 0);
    var head = 0, speed = total / 4200;   // 约 4.2s 循环一圈
    flowMarker = new AMap.Marker({
        anchor: 'center', zIndex: 70,
        content: '<div style="width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 0 14px 5px rgba(255,255,255,.85);"></div>',
        map: map
    });
    flowTimer = setInterval(function () {
        head += speed * 0.04;
        if (head > total) head = 0;
        var acc = 0, pos = null;
        for (var k = 0; k < flowSegs.length; k++) {
            var s = flowSegs[k];
            if (head <= acc + s.len) {
                var f = s.len ? (head - acc) / s.len : 0;
                pos = [s.a[0] + (s.b[0] - s.a[0]) * f, s.a[1] + (s.b[1] - s.a[1]) * f];
                break;
            }
            acc += s.len;
        }
        if (!pos) pos = flowSegs[0].a;
        flowMarker.setPosition(pos);
    }, 40);
}

function buildTrajectory() {
    stopFlow();
    trailLayers.forEach(function (l) { l.setMap(null); });
    trailLayers = [];
    var pts = sortedTimeline();
    if (pts.length < 2) return;
    var n = pts.length;
    flowSegs = [];
    for (var i = 0; i < n - 1; i++) {
        var hue = Math.round(i / (n - 1) * 300);
        var col = 'hsl(' + hue + ',80%,68%)';
        var a = [+pts[i].lng, +pts[i].lat], b = [+pts[i + 1].lng, +pts[i + 1].lat];
        flowSegs.push({ a: a, b: b, len: AMap.GeometryUtil.distance(a, b) });
        // 柔和发光底轨
        trailLayers.push(new AMap.Polyline({
            path: [a, b], strokeColor: col, strokeWeight: 10, strokeOpacity: 0.18,
            lineJoin: 'round', lineCap: 'round', map: trailOn ? map : null
        }));
        // 虚线主轨（留白节奏，显得轻盈）
        trailLayers.push(new AMap.Polyline({
            path: [a, b], strokeColor: col, strokeWeight: 2.8, strokeOpacity: 0.95,
            lineJoin: 'round', lineCap: 'round', strokeDashArray: [1, 10],
            map: trailOn ? map : null
        }));
    }
    // 序号节点（悬浮在点上方，不压住照片）；停留越久外圈光晕越柔越亮
    pts.forEach(function (p, i) {
        var hue = Math.round(i / (n - 1) * 300);
        var t = Math.min(1, dwellMin(p) / 120);
        if (t > 0) {
            trailLayers.push(new AMap.CircleMarker({
                position: [+p.lng, +p.lat], radius: 14 + t * 16,
                fillColor: 'hsla(' + hue + ',90%,70%,.12)', strokeWeight: 0,
                map: trailOn ? map : null
            }));
        }
        trailLayers.push(new AMap.Marker({
            position: [+p.lng, +p.lat], anchor: 'center', zIndex: 60,
            offset: new AMap.Pixel(0, -30),
            content: '<div style="width:22px;height:22px;border-radius:50%;background:hsl(' + hue + ',85%,62%);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35);">' + (i + 1) + '</div>',
            map: trailOn ? map : null
        }));
    });
    if (trailOn) startFlow();
}

function scheduleTrail() {
    if (trailTimer) clearTimeout(trailTimer);
    trailTimer = setTimeout(buildTrajectory, 300);
}

function toggleTrail() {
    trailOn = !trailOn;
    trailLayers.forEach(function (l) { l.setMap(trailOn ? map : null); });
    if (trailOn) startFlow(); else stopFlow();
    var btn = document.getElementById('trailBtn');
    if (btn) {
        btn.style.background = trailOn ? '#7c5cff' : '#fff';
        btn.style.color = trailOn ? '#fff' : '#666';
        btn.innerText = trailOn ? '✦ 轨迹 开' : '✦ 轨迹 关';
    }
}

// 轨迹开关按钮（右下角，与定位按钮上下排列）
(function () {
    var btn = document.createElement('div');
    btn.id = 'trailBtn';
    btn.innerText = '✦ 轨迹 开';
    btn.style.cssText = 'position:absolute;right:14px;bottom:78px;z-index:200;padding:8px 12px;background:#7c5cff;color:#fff;border-radius:20px;box-shadow:0 2px 10px rgba(124,92,255,.45);cursor:pointer;font-size:13px;';
    btn.onclick = toggleTrail;
    document.getElementById('map').appendChild(btn);
    scheduleTrail();
})();

// 缩小时自动收成大头钉（默认开）；关闭后任意缩放都保留照片图
(function () {
    var btn = document.createElement('div');
    btn.id = 'pinBtn';
    btn.innerText = '📌 缩小收图钉 开';
    btn.style.cssText = 'position:absolute;right:14px;bottom:174px;z-index:200;padding:8px 12px;background:#7c5cff;color:#fff;border-radius:20px;box-shadow:0 2px 10px rgba(124,92,255,.45);cursor:pointer;font-size:13px;';
    btn.onclick = function () {
        imgHideOnZoom = !imgHideOnZoom;
        btn.style.background = imgHideOnZoom ? '#7c5cff' : '#fff';
        btn.style.color = imgHideOnZoom ? '#fff' : '#666';
        btn.innerText = '📌 缩小收图钉 ' + (imgHideOnZoom ? '开' : '关');
        applyZoomStyle();
    };
    document.getElementById('map').appendChild(btn);
})();

/* ===== 无底图「时光长河」面板：按时间排序，左右滑动的华丽卡片集 ===== */
function fmtTime(p) {
    var t = parseTime(p);
    if (!t) return p.data_time || '未定时间';
    var d = new Date(t), q = function (x) { return String(x).padStart(2, '0'); };
    return d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate()) + ' ' + q(d.getHours()) + ':' + q(d.getMinutes());
}

function openTimelinePanel() {
    var pts = sortedTimeline();
    var old = document.getElementById('tlPanel');
    if (old) old.remove();
    var el = document.createElement('div');
    el.id = 'tlPanel';
    el.style.cssText = 'position:fixed;inset:0;z-index:3000;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;' +
        'background:linear-gradient(160deg,#1b1640 0%,#3a2a6d 32%,#7a4d9e 58%,#e08a9b 82%,#f6c99b 100%);';
    var cardsHtml = pts.map(function (p, i) {
        var hue = Math.round(i / Math.max(1, pts.length - 1) * 300);
        var cap = photoCaption(p);
        return '<div class="tl-card" data-i="' + i + '" style="flex:0 0 300px;margin:0 14px;border-radius:22px;overflow:hidden;background:rgba(255,255,255,.14);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.25);box-shadow:0 18px 50px rgba(0,0,0,.35);">' +
            '<div style="height:210px;position:relative;background:#000;"><img src="' + (p.nondes || p.thumbnail || p.url) + '" style="width:100%;height:100%;object-fit:cover;display:block;">' +
            '<span style="position:absolute;left:12px;top:12px;padding:4px 12px;border-radius:14px;background:hsla(' + hue + ',90%,65%,.85);color:#fff;font-size:12px;">' + fmtTime(p) + '</span></div>' +
            '<div style="padding:16px 18px 18px;color:#fff;">' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><img src="' + p.avatar + '" style="width:24px;height:24px;border-radius:50%;"><span style="font-size:13px;font-weight:600;">' + p.name + '</span></div>' +
                (cap ? '<div style="font-size:14px;line-height:1.6;min-height:44px;">“' + cap + '”</div>' : '<div style="font-size:13px;color:rgba(255,255,255,.6);min-height:44px;">一段尚未写下的回忆</div>') +
                '<div style="margin-top:8px;font-size:12px;color:rgba(255,255,255,.75);">📍 ' + (p.address || '') + '</div>' +
            '</div></div>';
    }).join('');

    el.innerHTML =
        '<div style="position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.5) 1px,transparent 1px);background-size:34px 34px;opacity:.18;pointer-events:none;"></div>' +
        '<div style="position:relative;padding:46px 30px 20px;text-align:center;color:#fff;">' +
            '<div style="font-size:26px;font-weight:700;letter-spacing:2px;text-shadow:0 2px 18px rgba(255,255,255,.4);">✦ 时光长河 ✦</div>' +
            '<div style="font-size:13px;opacity:.8;margin-top:6px;">沿着时间，回到每一个闪光的瞬间 · 共 ' + pts.length + ' 段记忆</div>' +
        '</div>' +
        '<button id="tlClose" style="position:absolute;right:22px;top:22px;width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.15);color:#fff;font-size:18px;cursor:pointer;">×</button>' +
        '<div id="tlViewport" style="position:relative;margin-top:10px;height:380px;display:flex;align-items:center;overflow:hidden;cursor:grab;">' +
            '<div id="tlTrack" style="display:flex;align-items:center;transition:transform .45s cubic-bezier(.22,.8,.3,1);padding:0 calc(50vw - 150px);">' + cardsHtml + '</div>' +
        '</div>' +
        '<button id="tlPrev" style="position:absolute;left:24px;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.18);color:#fff;font-size:22px;cursor:pointer;">‹</button>' +
        '<button id="tlNext" style="position:absolute;right:24px;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.18);color:#fff;font-size:22px;cursor:pointer;">›</button>' +
        '<div id="tlDots" style="position:absolute;bottom:26px;left:0;right:0;display:flex;gap:8px;justify-content:center;"></div>';
    document.body.appendChild(el);

    var idx = 0, count = pts.length;
    var track = el.querySelector('#tlTrack'), dots = el.querySelector('#tlDots');
    function go(i) {
        idx = Math.max(0, Math.min(count - 1, i));
        var cardW = 300 + 28;
        track.style.transform = 'translateX(' + (-idx * cardW) + 'px)';
        dots.querySelectorAll('span').forEach(function (d, k) {
            d.style.background = k === idx ? '#fff' : 'rgba(255,255,255,.35)';
            d.style.width = k === idx ? '20px' : '8px';
        });
    }
    for (var d = 0; d < count; d++) {
        var s = document.createElement('span');
        s.style.cssText = 'height:8px;width:8px;border-radius:50%;background:rgba(255,255,255,.35);transition:.3s;display:inline-block;';
        dots.appendChild(s);
    }
    el.querySelector('#tlPrev').onclick = function () { go(idx - 1); };
    el.querySelector('#tlNext').onclick = function () { go(idx + 1); };
    el.querySelector('#tlClose').onclick = function () { el.remove(); };
    // 拖拽/触摸滑动
    var startX = 0, dragging = false;
    var vp = el.querySelector('#tlViewport');
    vp.addEventListener('pointerdown', function (e) { dragging = true; startX = e.clientX; track.style.transition = 'none'; });
    window.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var cardW = 328, dx = e.clientX - startX;
        track.style.transform = 'translateX(' + (-idx * cardW + dx) + 'px)';
    });
    window.addEventListener('pointerup', function (e) {
        if (!dragging) return;
        dragging = false; track.style.transition = '';
        var dx = e.clientX - startX;
        if (dx < -50) go(idx + 1); else if (dx > 50) go(idx - 1); else go(idx);
    });
    go(0);
}

// 时光轴入口按钮
(function () {
    var btn = document.createElement('div');
    btn.innerText = '🌌 时光轴';
    btn.style.cssText = 'position:absolute;right:14px;bottom:126px;z-index:200;padding:8px 12px;background:rgba(255,255,255,.92);color:#6a4bd8;border-radius:20px;box-shadow:0 2px 10px rgba(0,0,0,.2);cursor:pointer;font-size:13px;font-weight:600;';
    btn.onclick = openTimelinePanel;
    document.getElementById('map').appendChild(btn);
})();

/* 加载转圈样式（占位 + 上传按钮） */
var styleEl = document.createElement('style');
styleEl.textContent =
    '.gm-spin{width:18px;height:18px;border:2px solid #d5dde5;border-top-color:#1e88e5;border-radius:50%;animation:gmrot .8s linear infinite;}' +
    '@keyframes gmrot{to{transform:rotate(360deg);}}';
document.head.appendChild(styleEl);

/* ===== 精致小弹框（非全屏）：翻页 / 改签名 / 下载 / 删除 ===== */
var activeGroup = null, activeIdx = 0;

function photoCardHtml(g, i) {
    var p = g.photos[i];
    var src = p.thumbnail || p.url;
    var multi = g.photos.length > 1;
    var cap = photoCaption(p);
    var arrows = multi
        ? '<button onclick="cardNav(-1)" style="position:absolute;left:6px;top:72px;width:30px;height:30px;border:none;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;font-size:20px;line-height:30px;cursor:pointer;">‹</button>' +
          '<button onclick="cardNav(1)" style="position:absolute;right:6px;top:72px;width:30px;height:30px;border:none;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;font-size:20px;line-height:30px;cursor:pointer;">›</button>'
        : '';
    var counter = multi
        ? '<span style="position:absolute;right:8px;top:8px;background:rgba(0,0,0,.55);color:#fff;font-size:11px;padding:2px 9px;border-radius:10px;">' + (i + 1) + ' / ' + g.photos.length + '</span>'
        : '';
    var capLine = cap
        ? '<div style="font-size:13px;color:#333;line-height:1.5;margin:8px 0 4px;">“' + cap + '”</div>'
        : '<div style="font-size:12px;color:#bbb;margin:8px 0 4px;">还没写签名，点下面“签名”补一句</div>';
    return '<div style="width:300px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.18);font-family:-apple-system,BlinkMacSystemFont,\'PingFang SC\',sans-serif;">' +
        '<div style="position:relative;">' +
            '<img src="' + src + '" style="width:100%;height:180px;object-fit:cover;display:block;background:#f2f3f5;">' +
            arrows + counter +
        '</div>' +
        '<div style="padding:12px 14px 14px;">' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
                '<img src="' + p.avatar + '" style="width:26px;height:26px;border-radius:50%;object-fit:cover;">' +
                '<span style="font-size:13px;font-weight:600;color:#222;">' + p.name + '</span>' +
            '</div>' +
            capLine +
            '<div style="display:flex;align-items:flex-start;gap:5px;font-size:12px;color:#8a8f99;line-height:1.5;">' +
                '<span style="flex:none;">📍</span><span>' + (p.address || '') + '</span>' +
            '</div>' +
            '<div style="height:1px;background:#f0f1f3;margin:11px 0;"></div>' +
            '<div style="display:flex;gap:8px;">' +
                '<button onclick="cardEditCaption()" style="flex:1;padding:7px 0;border:none;border-radius:18px;background:#eef4fb;color:#1e88e5;font-size:12px;cursor:pointer;">✎ 签名</button>' +
                '<a href="' + p.url + '" download style="flex:1;text-align:center;padding:7px 0;border-radius:18px;background:#f2f5f8;color:#1e88e5;font-size:12px;text-decoration:none;">下载</a>' +
                '<button onclick="cardDel()" style="padding:7px 12px;border:none;border-radius:18px;background:#fff0f0;color:#e53935;font-size:12px;cursor:pointer;">删除</button>' +
            '</div>' +
        '</div>' +
        '</div>';
}

function openCard(g, i) {
    activeGroup = g; activeIdx = i;
    infoWindow.setContent(photoCardHtml(g, i));
    infoWindow.open(map, [g.lng, g.lat]);
}

function cardNav(d) {
    if (!activeGroup) return;
    activeIdx = (activeIdx + d + activeGroup.photos.length) % activeGroup.photos.length;
    infoWindow.setContent(photoCardHtml(activeGroup, activeIdx));
}

function cardEditCaption() {
    var p = activeGroup.photos[activeIdx];
    layui.use('layer', function () {
        var layer = layui.layer;
        layer.open({
            title: '修改这张的签名',
            area: ['420px', '300px'],
            content: '<div style="padding:14px;"><textarea id="capIn" class="layui-textarea" style="height:160px;">' + (p.caption || '') + '</textarea></div>',
            btn: ['保存'],
            yes: function (idx) {
                var content = (document.getElementById('capIn').value || '').trim();
                var btn = document.querySelector('#layui-layer' + idx + ' .layui-layer-btn a');
                if (btn) { btn.disabled = true; btn.innerText = '保存中…'; }
                axios.post('/index💕addcaption', { fid: p.id, content: content }).then(function (res) {
                    if (res.data && res.data.code == 200) {
                        p.caption = content;
                        layer.close(idx);
                        infoWindow.setContent(photoCardHtml(activeGroup, activeIdx));
                        renderChip(activeGroup);
                        layer.msg('签名已保存');
                    } else {
                        if (btn) { btn.disabled = false; btn.innerText = '保存'; }
                        layer.msg((res.data && res.data.msg) || '保存失败');
                    }
                }).catch(function () {
                    if (btn) { btn.disabled = false; btn.innerText = '保存'; }
                    layer.msg('网络错误，未保存');
                });
            }
        });
    });
}

function cardDel() {
    var p = activeGroup.photos[activeIdx];
    delPhoto(p.id, function () {
        activeGroup.photos.splice(activeIdx, 1);
        if (!activeGroup.photos.length) {
            if (activeGroup.marker) activeGroup.marker.setMap(null);
            infoWindow.close();
        } else {
            activeIdx = Math.min(activeIdx, activeGroup.photos.length - 1);
            renderChip(activeGroup);
            infoWindow.setContent(photoCardHtml(activeGroup, activeIdx));
        }
    });
}

// 点击主地图：先出地点信息卡片（POI 名或逆地理地址），卡片上再有“添加图片”按钮
var pendingPick = null;   // 当前选中待上传的点
var locateMarker = null;

function cardHtml(title, addr) {
    return '<div style="padding:8px 10px;min-width:220px;max-width:280px;">' +
        '<div style="font-weight:600;font-size:14px;">' + (title || '所选位置') + '</div>' +
        '<div style="color:#777;font-size:12px;margin:4px 0 8px;">' + (addr || '定位中…') + '</div>' +
        '<button onclick="openAddPhoto()" class="layui-btn layui-btn-sm layui-btn-normal">＋ 添加图片</button>' +
        '</div>';
}

function showLocationCard(lng, lat, poiName) {
    pendingPick = [lng, lat];
    window.__pick = { lnglat: lng.toFixed(6) + ',' + lat.toFixed(6), name: poiName || '所选位置', address: '' };
    infoWindow.setContent(cardHtml(poiName || '所选位置', ''));
    infoWindow.open(map, [lng, lat]);

    // 逆地理同时返回周边 POI：命中最近的景点/楼宇就显示它的名字，否则显示路名
    axios.get('/upload💕regeo', { params: { lng: lng, lat: lat } }).then(function (res) {
        if (!res.data || res.data.code != 200) return;
        var pois = res.data.pois || [];
        var near = pois[0];
        var title = poiName || '所选位置', addr = res.data.address || '';
        if (near && near.distance <= 20) {
            title = near.name;
            addr = near.address || res.data.address;
        }
        window.__pick.name = title;
        window.__pick.address = addr;
        infoWindow.setContent(cardHtml(title, addr));
    });
}

map.on('click', function (e) {
    // 点到景点/地标时 e.data.name 是 POI 名，否则显示逆地理地址
    var poiName = (e.data && e.data.name) ? e.data.name : '';
    showLocationCard(e.lnglat.getLng(), e.lnglat.getLat(), poiName);
});

// wgs84(浏览器定位) -> gcj02(高德坐标)
function wgs84togcj02(lng, lat) {
    var a = 6378245.0, ee = 0.00669342162296594323;
    function tlat(x, y) {
        var r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
        r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
        r += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
        r += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2 / 3;
        return r;
    }
    function tlng(x, y) {
        var r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
        r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
        r += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
        r += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 12 * Math.PI)) * 2 / 3;
        return r;
    }
    var dlat = tlat(lng - 105, lat - 35), dlng = tlng(lng - 105, lat - 35);
    var rad = lat / 180 * Math.PI, magic = Math.sin(rad);
    magic = 1 - ee * magic * magic;
    var sq = Math.sqrt(magic);
    dlat = (dlat * 180) / ((a * (1 - ee)) / (magic * sq) * Math.PI);
    dlng = (dlng * 180) / (a / sq * Math.cos(rad) * Math.PI);
    return [lng + dlng, lat + dlat];
}

function locateMe(showCard) {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(function (pos) {
        var g = wgs84togcj02(pos.coords.longitude, pos.coords.latitude);
        // 已有照片足迹时按 setBounds 取景，不强行把视图拉到当前位置/北京
        if (!bounds.length) map.setZoomAndCenter(16, g);
        if (!locateMarker) {
            locateMarker = new AMap.Marker({
                content: '<div style="width:16px;height:16px;border:3px solid #1e88e5;border-radius:50%;background:#fff;"></div>',
                anchor: 'center'
            });
        }
        locateMarker.setPosition(g);
        locateMarker.setMap(map);
        if (showCard) showLocationCard(g[0], g[1], '我的位置');
    }, function () {}, { enableHighAccuracy: true, timeout: 8000 });
}

// 进页面静默定位：只放蓝点/必要时居中，不弹交互卡片
locateMe(false);

// 右下角定位按钮
(function () {
    var btn = document.createElement('div');
    btn.innerHTML = '⊚';
    btn.title = '定位到我的位置';
    btn.style.cssText = 'position:absolute;right:14px;bottom:30px;z-index:200;width:38px;height:38px;line-height:38px;text-align:center;background:#fff;border-radius:6px;box-shadow:0 1px 6px rgba(0,0,0,.3);cursor:pointer;font-size:18px;color:#1e88e5;';
    btn.onclick = function () { locateMe(true); };
    document.getElementById('map').appendChild(btn);
})();

function openAddPhoto() {
    if (!pendingPick) return;
    addPhoto();
}

/* ===== 上传：内嵌选点地图（逆地理/搜索走服务端 web key） ===== */
var pendingFiles = [];
var capMode = 'shared';

function addPhoto() {
    var loc = window.__pick || {};
    layui.use('layer', function () {
        layui.layer.open({
            type: 1,
            area: ['600px', '620px'],
            title: '在这里加照片',
            shade: 0.4,
            anim: 1,
            content: '<div style="padding:16px;max-height:82vh;overflow:auto;">' +
                '<div style="margin-bottom:12px;color:#333;"><b>' + (loc.name || '所选位置') + '</b>' +
                '<div style="color:#888;font-size:12px;margin-top:2px;">' + (loc.address || '') + '</div></div>' +
                '<div id="dropZone" style="border:2px dashed #ccd6e0;border-radius:10px;padding:30px;text-align:center;color:#999;cursor:pointer;background:#fafafa;transition:.2s;">点击选择图片，或把图片拖到这里<br><span style="font-size:12px">支持 jpg/png/gif/webp/bmp，可多选</span></div>' +
                '<input type="file" id="fileInput" multiple accept="image/*" style="display:none;">' +
                '<div style="margin:12px 0;display:flex;gap:10px;align-items:center;font-size:12px;color:#555;flex-wrap:wrap;">' +
                    '<span>起止时间</span>' +
                    '<input type="datetime-local" id="startTime" style="flex:1;padding:6px 8px;border:1px solid #dde3e9;border-radius:8px;font-size:12px;min-width:150px;">' +
                    '<span style="color:#999;">至</span>' +
                    '<input type="datetime-local" id="endTime" style="flex:1;padding:6px 8px;border:1px solid #dde3e9;border-radius:8px;font-size:12px;min-width:150px;">' +
                '</div>' +
                '<div style="margin:14px 0 8px;display:inline-flex;border:1px solid #dde3e9;border-radius:18px;overflow:hidden;font-size:12px;">' +
                    '<button type="button" data-mode="shared" class="mode-btn" style="padding:6px 14px;border:none;background:#1e88e5;color:#fff;cursor:pointer;">共用一条文案</button>' +
                    '<button type="button" data-mode="per" class="mode-btn" style="padding:6px 14px;border:none;background:#fff;color:#555;cursor:pointer;">每张单独写</button>' +
                '</div>' +
                '<div id="sharedCap"><textarea id="caption" class="layui-textarea" placeholder="所有图片共用这条文案（可选）" style="height:60px;"></textarea></div>' +
                '<div id="perCap" style="display:none;color:#888;font-size:12px;margin-bottom:6px;">为每张图分别写一句</div>' +
                '<div id="previewList" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:10px;"></div>' +
                '<div style="margin-top:14px;text-align:right;"><button class="layui-btn" id="uploadBtn">开始上传</button></div>' +
                '</div>',
            success: bindUploadUI
        });
    });
}

function bindUploadUI() {
    var zone = document.getElementById('dropZone'),
        input = document.getElementById('fileInput'),
        list = document.getElementById('previewList');
    pendingFiles = [];
    capMode = 'shared';

    // 起止时间默认当前时刻
    function localDT(d) {
        var p = function (n) { return String(n).padStart(2, '0'); };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    var now = new Date();
    var startEl = document.getElementById('startTime'), endEl = document.getElementById('endTime');
    if (startEl && !startEl.value) startEl.value = localDT(now);
    if (endEl && !endEl.value) endEl.value = localDT(new Date(now.getTime() + 3600000));

    zone.onclick = function () { input.click(); };
    zone.ondragover = function (e) { e.preventDefault(); zone.style.background = '#eef6ff'; };
    zone.ondragleave = function () { zone.style.background = '#fafafa'; };
    zone.ondrop = function (e) {
        e.preventDefault();
        zone.style.background = '#fafafa';
        addFiles(e.dataTransfer.files);
    };
    input.onchange = function () { addFiles(input.files); input.value = ''; };

    // 文案模式切换
    document.querySelectorAll('.mode-btn').forEach(function (btn) {
        btn.onclick = function () {
            capMode = btn.dataset.mode;
            document.querySelectorAll('.mode-btn').forEach(function (b) {
                var on = b === btn;
                b.style.background = on ? '#1e88e5' : '#fff';
                b.style.color = on ? '#fff' : '#555';
            });
            document.getElementById('sharedCap').style.display = capMode === 'shared' ? 'block' : 'none';
            document.getElementById('perCap').style.display = capMode === 'per' ? 'block' : 'none';
            refreshPerInputs();
        };
    });

    function addFiles(fs) {
        [].forEach.call(fs, function (f) {
            if (!/^image\//.test(f.type)) return;
            var url = URL.createObjectURL(f);
            var item = { file: f, url: url, box: null, captionInput: null };
            pendingFiles.push(item);
            var box = document.createElement('div');
            box.style.cssText = 'position:relative;width:86px;';
            box.innerHTML = '<img src="' + url + '" style="width:86px;height:86px;object-fit:cover;border-radius:8px;display:block;">' +
                '<span class="rm" style="position:absolute;top:-7px;right:-7px;cursor:pointer;background:#FF5722;color:#fff;border-radius:50%;width:18px;height:18px;line-height:18px;text-align:center;font-size:12px;">×</span>' +
                '<input class="per-inp" placeholder="这张的文案…" style="display:none;width:100%;margin-top:4px;padding:5px 6px;font-size:12px;border:1px solid #dde3e9;border-radius:6px;box-sizing:border-box;">';
            box.querySelector('.rm').onclick = function () {
                pendingFiles = pendingFiles.filter(function (x) { return x !== item; });
                box.remove();
            };
            item.box = box;
            item.captionInput = box.querySelector('.per-inp');
            list.appendChild(box);
            refreshPerInputs();
        });
    }

    function refreshPerInputs() {
        pendingFiles.forEach(function (it) {
            it.captionInput.style.display = capMode === 'per' ? 'block' : 'none';
        });
    }

    document.getElementById('uploadBtn').onclick = function () {
        if (!pendingFiles.length) { layui.layer.msg('先选图片'); return; }
        var btn = document.getElementById('uploadBtn');
        var shared = (document.getElementById('caption') || {}).value || '';
        btn.disabled = true;
        btn.innerHTML = '<span class="gm-spin" style="display:inline-block;vertical-align:middle;margin-right:6px;"></span>上传中…';
        var total = pendingFiles.length, done = 0, failed = 0;
        var lastPoint = null;
        pendingFiles.forEach(function (item) {
            var fd = new FormData();
            fd.append('file', item.file);
            fd.append('lng-and-lat', (window.__pick && window.__pick.lnglat) || '');
            fd.append('caption', shared);                       // 共用文案 → f_event
            fd.append('per-caption', capMode === 'per' ? (item.captionInput.value || '') : ''); // 单张 → f_caption
            fd.append('start-time', (document.getElementById('startTime') || {}).value || '');
            fd.append('end-time', (document.getElementById('endTime') || {}).value || '');
            axios.post('upload💕index', fd).then(function (res) {
                done++;
                if (res.data && res.data.code == 200 && res.data.data) {
                    var photo = res.data.data;
                    addPhotoToMap(photo);
                    lastPoint = [parseFloat(photo.lng), parseFloat(photo.lat)];
                } else {
                    failed++;
                    layui.layer.msg((res.data && res.data.msg) || '上传失败');
                }
                finish();
            }).catch(function () {
                done++; failed++;
                layui.layer.msg('网络错误，上传失败');
                finish();
            });
        });
        function finish() {
            if (done !== total) return;
            btn.disabled = false;
            btn.innerText = '开始上传';
            if (failed === 0) {
                infoWindow.close();              // 关闭选点信息卡片，避免遮挡新照片
                layui.layer.closeAll();
                if (lastPoint) map.setZoomAndCenter(16, lastPoint);
                layui.layer.msg('已添加到地图');
            }
        }
    };
}

layui.use('element', function () {});

function friend() {
    layui.use('layer', function () {
        var layer = layui.layer;
        var text = '', content = '';
        if (love_data !== '') {
            var love = love_data.split(',');
            text = '我亦飘零久，寻此同归人。偕度烂漫日,执手抚生尘。';
            content = '<div class="my"><img src="' + avatar + '"><span>💕</span><img src="' + love[1] + '"></div>';
        } else {
            text = '关联TA,只要告诉你，就证明想和你关联在一起';
            content = '<div style="margin-top:10px"><img src="' + avatar + '"><br>' +
                '<input value="你的关联密钥为:' + love_code + '"><br>' +
                '<input id="to_love" placeholder="请输入对方关联密钥">' +
                '<a href="javascript:;" onclick="bind()">关联TA</a></div>';
        }
        layer.open({ type: 1, area: ['600px', '450px'], title: text, content: content });
    });
}

function bind() {
    var to_love = document.querySelector('#to_love');
    if (!to_love.value) { layui.use('layer', function () { layer.msg('对方的关联密钥不能为空'); }); return; }
    axios.post('/user💕bind', { my_code: love_code, to_code: to_love.value })
        .then(function (res) {
            layui.use('layer', function () {
                layer.msg(res.data.msg, { icon: res.data.code == 200 ? 1 : 5 }, function () {
                    if (res.data.code == 200) location.reload();
                });
            });
        });
}

function delPhoto(fid, done) {
    axios.post('/index💕delete', { fid: fid }).then(function (res) {
        if (typeof done === 'function') { done(); return; }
        layui.use('layer', function () {
            layui.layer.msg(res.data.msg, function () { location.reload(); });
        });
    });
}

function miaoShu(el, id) {
    var content = el.getAttribute('data-content') || '';
    layui.use('layer', function () {
        layui.layer.open({
            title: '文字描述', area: ['600px', '450px'],
            content: '<textarea id="miaoshu" class="layui-textarea">' + content + '</textarea>' +
                '<button onclick="addMiaoShu(' + id + ')" class="layui-btn">提交</button>'
        });
    });
}

function addMiaoShu(id) {
    var content = document.querySelector('#miaoshu').value;
    axios.post('/index💕addmiaoshu', { fid: id, content: content }).then(function (res) {
        layui.layer.msg(res.data.msg, function () { layui.layer.closeAll(); });
    });
}
