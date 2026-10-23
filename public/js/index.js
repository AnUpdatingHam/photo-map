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

// 心情选项：DB 只存 ASCII key，emoji 在前端映射（兼容 utf8mb3 连接）；提前定义供初始渲染使用
var MOODS = [
    { k: 'sun', e: '☀️' }, { k: 'happy', e: '😊' }, { k: 'calm', e: '😌' }, { k: 'joy', e: '🥳' },
    { k: 'love', e: '❤️' }, { k: 'wow', e: '😮' }, { k: 'sad', e: '😢' }, { k: 'rain', e: '🌧️' }
];
function moodEmoji(k) { if (!k || !MOODS) return ''; var f = MOODS.find(function (m) { return m.k === k; }); return f ? f.e : ''; }
function toLocalInput(s) { return s ? String(s).replace(' ', 'T').slice(0, 16) : ''; }

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
    var cap = photoCaption(p);
    var mood = moodEmoji(p.mood);
    var moodBadge = mood ? '<span style="position:absolute;right:2px;top:2px;width:18px;height:18px;line-height:18px;text-align:center;border-radius:50%;background:rgba(255,255,255,.92);font-size:12px;box-shadow:0 1px 4px rgba(0,0,0,.35);z-index:3;">' + mood + '</span>' : '';
    // 签名随内容收缩（最大128），绝对定位图片下方居中，两行省略号，不把图片挤偏
    var capHtml = cap ? '<div class="gm-cap" style="left:50%;top:58px;transform:translateX(-50%);">' + cap + '</div>' : '';
    // 图片/角标/签名包在相对容器里，针尖固定在最底部并落在经纬度点（anchor bottom-center）
    g.marker.setContent(
        '<div style="display:flex;flex-direction:column;align-items:center;">' +
        '<div style="position:relative;width:52px;">' +
        '<div style="position:relative;width:52px;height:52px;border-radius:10px;overflow:hidden;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);background:#eef1f4;">' +
        '<div class="gm-spin" style="position:absolute;left:50%;top:50%;margin:-9px 0 0 -9px;"></div>' +
        '<img src="' + src + '" style="width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .35s;" onload="this.style.opacity=1;var s=this.parentNode.querySelector(\'.gm-spin\');if(s)s.remove()" onerror="var s=this.parentNode.querySelector(\'.gm-spin\');if(s)s.remove()">' +
        moodBadge +
        '</div>' + capHtml +
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

/* 动态光轨：彗星头 + 渐隐尾迹，沿轨迹循环流动，示意先后与走向 */
var comet = [], cometTimer = null, flowSegs = [];
function stopFlow() {
    if (cometTimer) { clearInterval(cometTimer); cometTimer = null; }
    comet.forEach(function (m) { m.setMap(null); });
    comet = [];
}
function pointAt(head) {
    var acc = 0;
    for (var k = 0; k < flowSegs.length; k++) {
        var s = flowSegs[k];
        if (head <= acc + s.len) {
            var f = s.len ? (head - acc) / s.len : 0;
            return [s.a[0] + (s.b[0] - s.a[0]) * f, s.a[1] + (s.b[1] - s.a[1]) * f];
        }
        acc += s.len;
    }
    return flowSegs[flowSegs.length - 1].b;
}
function startFlow() {
    stopFlow();
    if (!trailOn || !flowSegs.length) return;
    var total = flowSegs.reduce(function (s, x) { return s + x.len; }, 0);
    var head = 0, speed = total / 4200;   // 约 4.2s 循环一圈
    var TAIL = 6;
    for (var t = 0; t < TAIL; t++) {
        comet.push(new AMap.Marker({ anchor: 'center', zIndex: 70, map: map, content: '' }));
    }
    function renderTail() {
        for (var t = 0; t < TAIL; t++) {
            var d = head - t * (total / 45);
            d = ((d % total) + total) % total;
            var pos = pointAt(d);
            var size = t === 0 ? 14 : Math.max(4, 12 - t * 2);
            var op = t === 0 ? 1 : Math.max(.06, 1 - t * .2);
            var glow = t === 0 ? '0 0 18px 7px rgba(255,255,255,.9)' : '0 0 8px 2px rgba(255,255,255,.55)';
            comet[t].setContent('<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:#fff;opacity:' + op + ';box-shadow:' + glow + ';"></div>');
            comet[t].setPosition(pos);
        }
    }
    cometTimer = setInterval(function () {
        head += speed * 0.04;
        if (head > total) head = 0;
        renderTail();
    }, 40);
    renderTail();
}

// 按地点（分组）排序：一次提交/一个位置 = 一个编号，坐标与大头钉完全一致
function sortedGroups() {
    return Object.keys(groups).map(function (k) { return groups[k]; })
        .filter(function (g) { return g.lng && g.lat; })
        .map(function (g) {
            var t = Infinity;
            g.photos.forEach(function (p) { var pt = parseTime(p); if (pt && pt < t) t = pt; });
            g._t = (t === Infinity) ? 0 : t;
            return g;
        })
        .sort(function (a, b) { return a._t - b._t; });
}

function buildTrajectory() {
    stopFlow();
    trailLayers.forEach(function (l) { l.setMap(null); });
    trailLayers = [];
    var nodes = sortedGroups();
    if (nodes.length < 2) return;
    var n = nodes.length;
    flowSegs = [];
    for (var i = 0; i < n - 1; i++) {
        var hue = Math.round(i / (n - 1) * 300);
        var col = 'hsl(' + hue + ',85%,66%)';
        var a = [+nodes[i].lng, +nodes[i].lat], b = [+nodes[i + 1].lng, +nodes[i + 1].lat];
        flowSegs.push({ a: a, b: b, len: AMap.GeometryUtil.distance(a, b) });
        // 宽柔发光底轨
        trailLayers.push(new AMap.Polyline({
            path: [a, b], strokeColor: col, strokeWeight: 11, strokeOpacity: 0.16,
            lineJoin: 'round', lineCap: 'round', map: trailOn ? map : null
        }));
        // 虚线节奏主轨
        trailLayers.push(new AMap.Polyline({
            path: [a, b], strokeColor: col, strokeWeight: 3, strokeOpacity: 0.95,
            lineJoin: 'round', lineCap: 'round', strokeDashArray: [1, 11],
            map: trailOn ? map : null
        }));
        // 高亮内芯，让光轨有层次
        trailLayers.push(new AMap.Polyline({
            path: [a, b], strokeColor: '#ffffff', strokeWeight: 1, strokeOpacity: 0.7,
            lineJoin: 'round', lineCap: 'round', map: trailOn ? map : null
        }));
    }
    // 每个地点一枚序号节点（悬浮在点上方，不压住照片）；停留越久外圈光晕越柔越亮
    nodes.forEach(function (g, i) {
        var hue = Math.round(i / (n - 1) * 300);
        var dwell = 0;
        g.photos.forEach(function (p) { dwell = Math.max(dwell, dwellMin(p)); });
        var t = Math.min(1, dwell / 120);
        if (t > 0) {
            trailLayers.push(new AMap.CircleMarker({
                position: [+g.lng, +g.lat], radius: 14 + t * 18,
                fillColor: 'hsla(' + hue + ',90%,70%,.14)', strokeWeight: 0,
                map: trailOn ? map : null
            }));
        }
        trailLayers.push(new AMap.Marker({
            position: [+g.lng, +g.lat], anchor: 'center', zIndex: 90,
            offset: new AMap.Pixel(0, 0),
            content: '<div style="width:22px;height:22px;border-radius:50%;background:hsl(' + hue + ',85%,60%);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;border:1.5px solid #fff;box-shadow:0 0 12px hsla(' + hue + ',90%,65%,.9),0 2px 6px rgba(0,0,0,.35);">' + (i + 1) + '</div>',
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

// 按“一次提交记录”分组：同一 batch 为一条；旧数据回退到坐标+时间+共用文案
function buildRecords() {
    var arr = timeline.slice().filter(function (p) { return p.lng && p.lat; });
    var bag = {};
    arr.forEach(function (p) {
        var key = p.batch ? ('b:' + p.batch) : ('f:' + (+p.lng).toFixed(4) + ',' + (+p.lat).toFixed(4) + '|' + (p.start_time || '') + '|' + (p.event || ''));
        if (!bag[key]) {
            bag[key] = {
                lng: +p.lng, lat: +p.lat, photos: [],
                event: p.event || '', address: p.address || '', mood: p.mood || '',
                name: p.name, avatar: p.avatar,
                start_time: p.start_time, end_time: p.end_time, _t: parseTime(p) || Infinity
            };
        }
        var r = bag[key];
        r.photos.push(p);
        var pt = parseTime(p);
        if (pt && pt < r._t) r._t = pt;
        if (!r.event && p.event) r.event = p.event;
        if (!r.mood && p.mood) r.mood = p.mood;
        if (!r.address && p.address) r.address = p.address;
    });
    return Object.keys(bag).map(function (k) { return bag[k]; })
        .sort(function (a, b) { return a._t - b._t; });
}

function openTimelinePanel() {
    var records = buildRecords();
    var old = document.getElementById('tlPanel');
    if (old) old.remove();
    var el = document.createElement('div');
    el.id = 'tlPanel';
    // 复用全局唯一的主地图：面板只做半透渐变遮罩，不再新建第二幅地图
    el.style.cssText = 'position:fixed;inset:0;z-index:3000;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:linear-gradient(160deg,rgba(22,18,58,.86) 0%,rgba(51,37,107,.82) 30%,rgba(109,74,158,.78) 56%,rgba(217,138,160,.74) 80%,rgba(243,199,149,.8) 100%);';

    // 两侧迷你卡（可点击跳转）
    var minisHtml = records.map(function (r, i) {
        var first = r.photos[0];
        var hue = Math.round(i / Math.max(1, records.length - 1) * 300);
        return '<div class="tl-mini" data-i="' + i + '" style="position:absolute;left:50%;top:50%;width:150px;height:190px;margin:-95px 0 0 -75px;border-radius:18px;overflow:hidden;cursor:pointer;background:rgba(255,255,255,.12);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.28);box-shadow:0 14px 40px rgba(0,0,0,.4);transition:transform 1.15s cubic-bezier(.22,.8,.28,1),opacity .9s ease,box-shadow .3s;">' +
            '<div style="height:118px;position:relative;"><img src="' + (first.nondes || first.thumbnail || first.url) + '" style="width:100%;height:100%;object-fit:cover;display:block;">' +
            '<span style="position:absolute;left:8px;top:8px;padding:3px 9px;border-radius:12px;background:hsla(' + hue + ',90%,60%,.92);color:#fff;font-size:11px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + fmtTime(first) + '</span></div>' +
            '<div style="padding:9px 11px;color:#fff;"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + r.name + ' ' + moodEmoji(r.mood) + '</div>' +
            '<div style="font-size:11px;opacity:.75;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (r.event || r.address || '') + '</div></div>' +
            '</div>';
    }).join('');

    el.innerHTML =
        '<div style="position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.5) 1px,transparent 1px);background-size:34px 34px;opacity:.1;pointer-events:none;"></div>' +
        '<div style="position:relative;padding:38px 30px 0;text-align:center;color:#fff;z-index:5;">' +
            '<div style="font-size:28px;font-weight:700;letter-spacing:3px;text-shadow:0 2px 20px rgba(255,255,255,.45);">✦ 时光长河 ✦</div>' +
            '<div style="font-size:13px;opacity:.82;margin-top:6px;">首尾相连 · 按提交回到每一段闪光 · 共 ' + records.length + ' 次回忆</div>' +
        '</div>' +
        '<button id="tlPlay" style="position:absolute;right:72px;top:22px;width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.15);color:#fff;font-size:16px;cursor:pointer;z-index:30;">⏸</button>' +
        '<button id="tlClose" style="position:absolute;right:22px;top:22px;width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.15);color:#fff;font-size:18px;cursor:pointer;z-index:30;">×</button>' +
        '<div id="tlMinis" style="position:absolute;inset:0;z-index:8;">' + minisHtml + '</div>' +
        // 中心大卡：左图（大图+缩略条）右信息
        '<div id="tlFocus" style="position:absolute;left:50%;top:54%;transform:translate(-50%,-50%);z-index:20;width:min(820px,88vw);height:470px;border-radius:26px;overflow:hidden;display:flex;background:rgba(28,22,60,.66);backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,.32);box-shadow:0 30px 90px rgba(0,0,0,.55);"></div>' +
        '<button id="tlPrev" style="position:absolute;left:22px;top:54%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.16);color:#fff;font-size:24px;cursor:pointer;z-index:25;backdrop-filter:blur(6px);">‹</button>' +
        '<button id="tlNext" style="position:absolute;right:22px;top:54%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.16);color:#fff;font-size:24px;cursor:pointer;z-index:25;backdrop-filter:blur(6px);">›</button>' +
        '<div id="tlDots" style="position:absolute;bottom:28px;left:0;right:0;display:flex;gap:8px;justify-content:center;z-index:25;"></div>';
    document.body.appendChild(el);

    var idx = 0, sub = 0, count = records.length;
    var minis = Array.prototype.slice.call(el.querySelectorAll('.tl-mini'));
    var dots = el.querySelector('#tlDots');
    var focus = el.querySelector('#tlFocus');

    // 自动播放：当前卡内多图先逐张播完，再切下一个大卡；用户点击/滚轮即停
    var playTimer = null, PLAY_MS = 3500;
    var playBtn = el.querySelector('#tlPlay');
    function updatePlayBtn() { if (playBtn) playBtn.textContent = playTimer ? '⏸' : '▶'; }
    function stopAutoplay() { if (playTimer) { clearInterval(playTimer); playTimer = null; } updatePlayBtn(); }
    function startAutoplay() { stopAutoplay(); playTimer = setInterval(tick, PLAY_MS); updatePlayBtn(); }
    function tick() {
        var n = records[idx].photos.length;
        if (n > 1 && sub < n - 1) focusSub(sub + 1);
        else go(idx + 1);
    }
    if (playBtn) playBtn.onclick = function () { if (playTimer) stopAutoplay(); else startAutoplay(); };

    function wrap(d) { d = ((d % count) + count) % count; if (d > count / 2) d -= count; return d; }

    function focusHtml(r, s) {
        var p = r.photos[s];
        var big = p.nondes || p.thumbnail || p.url;
        var thumbs = r.photos.map(function (ph, k) {
            var t = ph.nondes || ph.thumbnail || ph.url;
            var on = k === s;
            return '<div class="tl-thumb" data-sub="' + k + '" style="flex:none;width:62px;height:62px;border-radius:12px;overflow:hidden;cursor:pointer;border:2px solid ' + (on ? '#fff' : 'transparent') + ';box-shadow:' + (on ? '0 0 0 2px #7c5cff' : 'none') + ';opacity:' + (on ? 1 : .6) + ';transition:opacity .25s,box-shadow .25s;"><img src="' + t + '" style="width:100%;height:100%;object-fit:cover;display:block;"></div>';
        }).join('');
        var cap = photoCaption(p);
        return '<div style="display:flex;width:100%;height:100%;">' +
          // 左：图片区
          '<div style="width:56%;padding:18px;display:flex;flex-direction:column;gap:12px;box-sizing:border-box;">' +
            '<div id="tlStageImg" style="position:relative;flex:1;border-radius:18px;overflow:hidden;background:#000;">' +
              '<img id="tlBig" src="' + big + '" style="width:100%;height:100%;object-fit:cover;display:block;opacity:1;transition:opacity .6s ease;">' +
              '<button class="tl-bignav" data-d="-1" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:34px;height:34px;border-radius:50%;border:none;background:rgba(0,0,0,.35);color:#fff;font-size:20px;cursor:pointer;opacity:0;transition:.25s;">‹</button>' +
              '<button class="tl-bignav" data-d="1" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);width:34px;height:34px;border-radius:50%;border:none;background:rgba(0,0,0,.35);color:#fff;font-size:20px;cursor:pointer;opacity:0;transition:.25s;">›</button>' +
              (r.photos.length > 1 ? '<span id="tlCnt" style="position:absolute;right:12px;bottom:12px;padding:3px 11px;border-radius:12px;background:rgba(0,0,0,.55);color:#fff;font-size:12px;">' + (s + 1) + ' / ' + r.photos.length + '</span>' : '') +
            '</div>' +
            (r.photos.length > 1 ? '<div id="tlThumbs" style="display:flex;gap:8px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:thin;">' + thumbs + '</div>' : '') +
          '</div>' +
          // 右：信息区
          '<div style="flex:1;padding:26px 22px;color:#fff;display:flex;flex-direction:column;gap:12px;overflow:hidden;">' +
            '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><span id="tlTime" style="padding:5px 13px;border-radius:15px;background:rgba(124,92,255,.55);font-size:12px;">🕒 ' + fmtTime(p) + '</span>' + (p.end_time ? '<span style="font-size:12px;opacity:.8;">→ ' + p.end_time + '</span>' : '') + '</div>' +
            '<div style="display:flex;align-items:center;gap:10px;"><img src="' + r.avatar + '" style="width:34px;height:34px;border-radius:50%;object-fit:cover;"><span style="font-size:15px;font-weight:600;">' + r.name + '</span>' + (r.mood ? '<span style="font-size:26px;margin-left:2px;" title="心情">' + moodEmoji(r.mood) + '</span>' : '') + '</div>' +
            '<div id="tlCap" style="font-size:16px;line-height:1.7;max-height:150px;overflow:auto;white-space:pre-wrap;word-break:break-word;">' + (cap || '<span style="opacity:.6;">一段尚未写下的回忆</span>') + '</div>' +
            '<div style="margin-top:auto;font-size:12.5px;color:rgba(255,255,255,.82);line-height:1.6;">📍 ' + (r.address || '') + '</div>' +
          '</div>' +
        '</div>';
    }

    var wheelLock = false;
    var focusTimer = null;
    function renderFocus() {
        var r = records[idx];
        focus.innerHTML = focusHtml(r, sub);
        bindFocus();
        // 串行编排：先让侧卡滑入（布局已在 layout() 触发），延迟片刻后居中卡再展开淡入，避免并发局促
        if (focusTimer) clearTimeout(focusTimer);
        focus.classList.remove('tl-fade');
        focus.style.animation = 'none';
        focus.style.opacity = 0;
        focusTimer = setTimeout(function () {
            focus.style.animation = '';
            focus.style.opacity = '';
            focus.classList.remove('tl-fade'); void focus.offsetWidth; focus.classList.add('tl-fade');
        }, 560);
    }

    // 局部更新当前记录内的第 s 张（淡入淡出，不重建整卡）
    function updateSub(r, s) {
        var p = r.photos[s];
        var big = focus.querySelector('#tlBig');
        var capEl = focus.querySelector('#tlCap');
        var timeEl = focus.querySelector('#tlTime');
        var cnt = focus.querySelector('#tlCnt');
        big.style.opacity = 0;
        setTimeout(function () {
            big.src = p.nondes || p.thumbnail || p.url;
            big.onload = function () { big.style.opacity = 1; };
            big.style.opacity = 1;
            if (cnt) cnt.textContent = (s + 1) + ' / ' + r.photos.length;
            if (capEl) { var c = photoCaption(p); capEl.innerHTML = c || '<span style="opacity:.6;">一段尚未写下的回忆</span>'; }
            if (timeEl) timeEl.innerHTML = '🕒 ' + fmtTime(p);
            focus.querySelectorAll('.tl-thumb').forEach(function (t) {
                var on = parseInt(t.dataset.sub, 10) === s;
                t.style.borderColor = on ? '#fff' : 'transparent';
                t.style.boxShadow = on ? '0 0 0 2px #7c5cff' : 'none';
                t.style.opacity = on ? 1 : .6;
            });
        }, 350);
    }

    function bindFocus() {
        focus.querySelectorAll('.tl-bignav').forEach(function (b) {
            b.onmouseenter = function () { b.style.opacity = 1; };
            b.onmouseleave = function () { b.style.opacity = 0; };
            b.onclick = function () { stopAutoplay(); focusSub(sub + parseInt(b.dataset.d, 10)); };
        });
        focus.querySelectorAll('.tl-thumb').forEach(function (t) {
            t.onclick = function () { stopAutoplay(); focusSub(parseInt(t.dataset.sub, 10)); };
        });
        // 滚轮（大图区/缩略条）直接切换上一张/下一张，带防抖
        var onWheel = function (e) {
            e.preventDefault();
            if (wheelLock) return;
            wheelLock = true;
            setTimeout(function () { wheelLock = false; }, 380);
            stopAutoplay();
            focusSub(sub + (e.deltaY > 0 ? 1 : -1));
        };
        var stageImg = focus.querySelector('#tlStageImg');
        if (stageImg) stageImg.addEventListener('wheel', onWheel, { passive: false });
        var strip = focus.querySelector('#tlThumbs');
        if (strip) strip.addEventListener('wheel', onWheel, { passive: false });
    }

    function focusSub(s) {
        var n = records[idx].photos.length;
        sub = ((s % n) + n) % n;
        updateSub(records[idx], sub);
    }

    function layout() {
        minis.forEach(function (c, k) {
            var d = wrap(k - idx);
            var ad = Math.abs(d);
            var show = ad === 1 || ad === 2;
            // 相邻卡放到中心大卡外沿，保证上一张/下一张露出可点；第二张更远更淡
            var x = ad === 1 ? d * 520 : d * 830;
            var scale = ad === 1 ? .82 : .55;
            var rise = ad === 1 ? 26 : 96;
            c.style.transform = 'translate(' + x + 'px,' + rise + 'px) scale(' + scale + ')';
            c.style.opacity = show ? (ad === 1 ? .98 : .45) : 0;
            c.style.zIndex = 10 - ad;
            c.style.pointerEvents = show ? 'auto' : 'none';
        });
        dots.querySelectorAll('span').forEach(function (s, k) {
            s.style.background = k === idx ? '#fff' : 'rgba(255,255,255,.35)';
            s.style.width = k === idx ? '20px' : '8px';
        });
    }

    function go(i) {
        idx = ((i % count) + count) % count;
        sub = 0;
        layout();
        renderFocus();
        // 复用主地图平滑平移到该记录点位
        if (window.map) map.panTo([records[idx].lng, records[idx].lat], { duration: 600 });
    }

    for (var d = 0; d < count; d++) {
        var s = document.createElement('span');
        s.style.cssText = 'height:8px;width:8px;border-radius:50%;background:rgba(255,255,255,.35);transition:.3s;display:inline-block;cursor:pointer;';
        s.onclick = function (k) { return function () { stopAutoplay(); go(k); }; }(d);
        dots.appendChild(s);
    }
    el.querySelector('#tlPrev').onclick = function () { stopAutoplay(); go(idx - 1); };
    el.querySelector('#tlNext').onclick = function () { stopAutoplay(); go(idx + 1); };
    el.querySelector('#tlClose').onclick = function () { stopAutoplay(); el.remove(); };

    // 两侧卡片可点击直接跳转
    minis.forEach(function (c, k) {
        c.onclick = function () { stopAutoplay(); go(k); };
    });

    go(0);
    startAutoplay();
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
    '@keyframes gmrot{to{transform:rotate(360deg);}}' +
    '.gm-cap{position:absolute;display:-webkit-box;width:max-content;max-width:128px;padding:2px 8px;background:rgba(0,0,0,.68);color:#fff;border-radius:6px;font-size:11px;line-height:1.4;text-align:center;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:break-word;word-break:normal;box-shadow:0 2px 8px rgba(0,0,0,.3);}' +
'@keyframes tlFade{from{opacity:.15;transform:translate(-50%,-50%) scale(.92);}to{opacity:1;transform:translate(-50%,-50%) scale(1);}}' +
'.tl-fade{animation:tlFade 1.15s cubic-bezier(.22,.8,.28,1) both;}';
document.head.appendChild(styleEl);

/* ===== 精致小弹框（非全屏）：翻页 / 改签名 / 下载 / 删除 ===== */
var activeGroup = null, activeIdx = 0;

function photoCardHtml(g, i) {
    var p = g.photos[i];
    var src = p.thumbnail || p.url;
    var multi = g.photos.length > 1;
    var cap = photoCaption(p);
    var ev = g.photos.map(function (x) { return x.event; }).filter(Boolean)[0] || '';
    var moodKey = g.photos.map(function (x) { return x.mood; }).filter(Boolean)[0] || '';
    var mood = moodEmoji(moodKey);
    var arrows = multi
        ? '<button onclick="cardNav(-1)" style="position:absolute;left:6px;top:72px;width:30px;height:30px;border:none;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;font-size:20px;line-height:30px;cursor:pointer;">‹</button>' +
          '<button onclick="cardNav(1)" style="position:absolute;right:6px;top:72px;width:30px;height:30px;border:none;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;font-size:20px;line-height:30px;cursor:pointer;">›</button>'
        : '';
    var counter = multi
        ? '<span style="position:absolute;right:8px;top:8px;background:rgba(0,0,0,.55);color:#fff;font-size:11px;padding:2px 9px;border-radius:10px;">' + (i + 1) + ' / ' + g.photos.length + '</span>'
        : '';
    var timeLine = (p.start_time || p.end_time)
        ? '<div style="display:flex;align-items:center;gap:5px;font-size:12px;color:#8a8f99;line-height:1.5;margin-top:6px;"><span>🕒</span><span>' + (p.start_time || '未定') + (p.end_time ? ' → ' + p.end_time : '') + '</span></div>'
        : '';
    var capLine = cap
        ? '<div style="font-size:13px;color:#333;line-height:1.6;margin:8px 0 2px;">“' + cap + '”</div>'
        : '';
    var evLine = ev
        ? '<div style="font-size:12px;color:#6a4bd8;line-height:1.5;margin-top:4px;">📖 ' + ev + '</div>'
        : '';
    var moodBadge = mood
        ? '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:12px;background:#fff3e6;color:#e8823a;font-size:12px;">' + mood + '</span>'
        : '';
    return '<div style="width:300px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.18);font-family:-apple-system,BlinkMacSystemFont,\'PingFang SC\',sans-serif;">' +
        '<div style="position:relative;">' +
            '<img src="' + src + '" style="width:100%;height:180px;object-fit:cover;display:block;background:#f2f3f5;">' +
            arrows + counter +
        '</div>' +
        '<div style="padding:12px 14px 14px;">' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
                '<img src="' + p.avatar + '" style="width:26px;height:26px;border-radius:50%;object-fit:cover;">' +
                '<span style="font-size:13px;font-weight:600;color:#222;">' + p.name + '</span>' +
                '<span style="margin-left:auto;">' + moodBadge + '</span>' +
            '</div>' +
            capLine + evLine + timeLine +
            '<div style="display:flex;align-items:flex-start;gap:5px;font-size:12px;color:#8a8f99;line-height:1.5;margin-top:4px;">' +
                '<span style="flex:none;">📍</span><span>' + (p.address || '') + '</span>' +
            '</div>' +
            '<div style="height:1px;background:#f0f1f3;margin:11px 0;"></div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                '<button onclick="cardEditRecord()" style="flex:1;padding:7px 0;border:none;border-radius:18px;background:#f1ecff;color:#6a4bd8;font-size:12px;cursor:pointer;">✎ 编辑回忆</button>' +
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

function cardEditRecord() {
    if (!activeGroup) return;
    var g = activeGroup;
    var base = g.photos[activeIdx];
    var ev = g.photos.map(function (x) { return x.event; }).filter(Boolean)[0] || '';
    var mood = g.photos.map(function (x) { return x.mood; }).filter(Boolean)[0] || '';
    var start = base.start_time || '', end = base.end_time || '';
    var moodHtml = MOODS.map(function (m) {
        var on = m.k === mood;
        return '<span data-mood="' + m.k + '" style="display:inline-flex;width:38px;height:38px;align-items:center;justify-content:center;font-size:20px;border-radius:50%;cursor:pointer;margin:3px;' + (on ? 'background:#6a4bd8;box-shadow:0 0 0 2px #fff,0 0 0 4px #6a4bd8;' : 'background:#f2f3f5;') + '">' + m.e + '</span>';
    }).join('');
    layui.use('layer', function () {
        var layer = layui.layer;
        layer.open({
            title: '编辑这段回忆',
            area: ['440px', '520px'],
            content:
                '<div style="padding:16px 18px;font-family:-apple-system,\'PingFang SC\',sans-serif;">' +
                '<div style="font-size:12px;color:#888;margin-bottom:4px;">事件 / 文案（整段共用）</div>' +
                '<textarea id="evIn" class="layui-textarea" style="height:64px;">' + ev + '</textarea>' +
                '<div style="font-size:12px;color:#888;margin:12px 0 4px;">这张的签名（可选，仅当前这张）</div>' +
                '<textarea id="capIn" class="layui-textarea" style="height:56px;">' + (base.caption || '') + '</textarea>' +
                '<div style="display:flex;gap:12px;margin-top:12px;">' +
                  '<div style="flex:1;"><div style="font-size:12px;color:#888;margin-bottom:4px;">开始时间</div>' +
                  '<input id="stIn" type="datetime-local" class="layui-input" value="' + toLocalInput(start) + '"></div>' +
                  '<div style="flex:1;"><div style="font-size:12px;color:#888;margin-bottom:4px;">结束时间</div>' +
                  '<input id="etIn" type="datetime-local" class="layui-input" value="' + toLocalInput(end) + '"></div>' +
                '</div>' +
                '<div style="font-size:12px;color:#888;margin:14px 0 2px;">此刻的心情</div>' +
                '<div id="moodRow" style="text-align:center;">' + moodHtml + '</div>' +
                '</div>',
            btn: ['保存'],
            success: function (idx) {
                var chosen = mood;
                layer.index = idx;
                document.getElementById('moodRow').addEventListener('click', function (e) {
                    var s = e.target.closest('[data-mood]');
                    if (!s) return;
                    chosen = s.dataset.mood;
                    document.querySelectorAll('#moodRow [data-mood]').forEach(function (el) {
                        var on = el.dataset.mood === chosen;
                        el.style.background = on ? '#6a4bd8' : '#f2f3f5';
                        el.style.boxShadow = on ? '0 0 0 2px #fff,0 0 0 4px #6a4bd8' : 'none';
                    });
                });
                layer._chosenMood = function () { return chosen; };
            },
            yes: function (idx) {
                var event = document.getElementById('evIn').value.trim();
                var cap = (document.getElementById('capIn').value || '').trim();
                var st = (document.getElementById('stIn').value || '').replace('T', ' ');
                var et = (document.getElementById('etIn').value || '').replace('T', ' ');
                var btn = document.querySelector('#layui-layer' + idx + ' .layui-layer-btn a');
                if (btn) { btn.disabled = true; btn.innerText = '保存中…'; }
                axios.post('/index💕editrecord', {
                    fids: g.photos.map(function (x) { return x.id; }),
                    event: event, start_time: st, end_time: et, mood: layer._chosenMood() || ''
                }).then(function (res) {
                    if (!(res.data && res.data.code == 200)) {
                        if (btn) { btn.disabled = false; btn.innerText = '保存'; }
                        layer.msg((res.data && res.data.msg) || '保存失败');
                        return;
                    }
                    // 同步保存当前这张的签名 f_caption（addcaption）
                    var saveCap = axios.post('/index💕addcaption', { fid: base.id, content: cap })
                        .catch(function () { return { data: { code: 400 } }; });
                    return saveCap.then(function () {
                        g.photos.forEach(function (x) { x.event = event; x.start_time = st; x.end_time = et; x.mood = layer._chosenMood() || ''; });
                        base.caption = cap;
                        layer.close(idx);
                        scheduleTrail();                       // 重算时间 → 重绘连接线与序号
                        infoWindow.setContent(photoCardHtml(g, activeIdx));
                        renderChip(g);
                        layer.msg('已保存');
                    });
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
                '<div style="margin:10px 0;font-size:12px;color:#555;">此刻心情' +
                  '<span id="moodRow" style="display:inline-flex;gap:4px;margin-left:8px;align-items:center;">' +
                  MOODS.map(function (m) {
                      return '<span data-mood="' + m.k + '" style="display:inline-flex;width:32px;height:32px;align-items:center;justify-content:center;font-size:18px;border-radius:50%;cursor:pointer;background:#f2f3f5;">' + m.e + '</span>';
                  }).join('') +
                  '</span></div>' +
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
    // 本次打开弹窗的所有图片属于同一提交批次
    var batchId = 'b' + Date.now().toString(36) + Math.random().toString(16).slice(2, 6);
    var chosenMood = '';
    var moodRow = document.getElementById('moodRow');
    if (moodRow) {
        moodRow.addEventListener('click', function (e) {
            var s = e.target.closest('[data-mood]');
            if (!s) return;
            chosenMood = s.dataset.mood;
            moodRow.querySelectorAll('[data-mood]').forEach(function (el) {
                var on = el.dataset.mood === chosenMood;
                el.style.background = on ? '#6a4bd8' : '#f2f3f5';
                el.style.boxShadow = on ? '0 0 0 2px #fff,0 0 0 4px #6a4bd8' : 'none';
            });
        });
    }

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
            fd.append('batch', batchId);
            fd.append('mood', chosenMood);
            axios.post('upload💕index', fd).then(function (res) {
                done++;
                if (res.data && res.data.code == 200 && res.data.data) {
                    var photo = res.data.data;
                    photo.batch = photo.batch || batchId;
                    photo.mood = photo.mood || chosenMood;
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
