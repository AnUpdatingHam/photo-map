/* ===== 主地图：高德 JS API ===== */
var map = new AMap.Map('map', {
    zoom: 12,
    center: [116.397428, 39.90923],
    viewMode: '2D'
});
map.addControl(new AMap.ToolBar());
map.addControl(new AMap.Scale());

var infoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -20) });

function popupTemplate(photo) {
    var src = photo.thumbnail || photo.url;
    var viewer = photo.nondes || photo.url;
    var mediaHtml = photo.video
        ? '<video controls width="300"><source src="' + photo.video + '" type="video/mp4"/></video>'
        : '<img src="' + src + '" viewer-src="' + viewer + '" style="max-width:300px;">';
    return '<div id="layer-photos-map" style="max-width:320px;">' +
        mediaHtml +
        '<div style="padding:10px 0 5px 0">' +
        '<img src="' + photo.avatar + '" style="width:30px;border-radius:50%;vertical-align:bottom;">' +
        '<span class="address">' + photo.name + '</span>' +
        '</div>' +
        '<div class="mianshutext">' + (photo.event || '') + '</div>' +
        '<p class="address">' + photo.address + '<br>(' + photo.data_time + ')</p>' +
        '<a href="javascript:;" onclick="delPhoto(' + photo.id + ')">抹掉此足迹</a>&nbsp;&nbsp;' +
        '<a href="javascript:;" onclick="miaoShu(this,' + photo.id + ')" data-content="' + (photo.event || '') + '">文字描述</a>&nbsp;&nbsp;' +
        '<a href="' + photo.url + '" download>下载</a>' +
        '</div>';
}

var bounds = [];

function addPhotoMarker(photo) {
    var lng = parseFloat(photo.lng), lat = parseFloat(photo.lat);
    if (!lng || !lat) return null;
    var src = photo.thumbnail || photo.url;
    var cap = photo.event ? '<div style="max-width:120px;margin-top:3px;padding:2px 6px;background:rgba(0,0,0,.65);color:#fff;border-radius:4px;font-size:11px;line-height:1.4;white-space:normal;">' + photo.event + '</div>' : '';
    var chip = '<div style="display:flex;flex-direction:column;align-items:center;">' +
        '<div style="width:52px;height:52px;border-radius:8px;overflow:hidden;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);background:#fff;">' +
        '<img src="' + src + '" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.opacity=0"></div>' +
        cap + '</div>';
    var marker = new AMap.Marker({
        position: [lng, lat],
        content: chip,
        anchor: 'bottom-center'
    });
    marker.setMap(map);
    bounds.push(new AMap.LngLat(lng, lat));
    marker.on('click', function () {
        infoWindow.setContent(popupTemplate(photo));
        infoWindow.open(map, [lng, lat]);
    });
    return marker;
}

(data.rows || []).forEach(function (photo) { addPhotoMarker(photo); });
if (bounds.length) {
    map.setFitView(null, false, [60, 60, 60, 60]);
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

function addPhoto() {
    var loc = window.__pick || {};
    layui.use('layer', function () {
        layui.layer.open({
            type: 1,
            area: ['560px', '560px'],
            title: '在这里加一张照片',
            shade: 0.4,
            anim: 1,
            content: '<div style="padding:16px;">' +
                '<div style="margin-bottom:12px;color:#333;"><b>' + (loc.name || '所选位置') + '</b>' +
                '<div style="color:#888;font-size:12px;margin-top:2px;">' + (loc.address || '') + '</div></div>' +
                '<div id="dropZone" style="border:2px dashed #ccd6e0;border-radius:8px;padding:36px;text-align:center;color:#999;cursor:pointer;background:#fafafa;">点击选择图片，或把图片拖到这里<br><span style="font-size:12px">支持 jpg/png/gif，可多选</span></div>' +
                '<input type="file" id="fileInput" multiple accept="image/jpeg,image/png,image/gif" style="display:none;">' +
                '<div id="previewList" style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;"></div>' +
                '<textarea id="caption" class="layui-textarea" placeholder="写点什么…（可选）" style="margin-top:12px;height:70px;"></textarea>' +
                '<div style="margin-top:12px;text-align:right;"><button class="layui-btn" id="uploadBtn">开始上传</button></div>' +
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

    zone.onclick = function () { input.click(); };
    zone.ondragover = function (e) { e.preventDefault(); zone.style.background = '#eef6ff'; };
    zone.ondragleave = function () { zone.style.background = '#fafafa'; };
    zone.ondrop = function (e) {
        e.preventDefault();
        zone.style.background = '#fafafa';
        addFiles(e.dataTransfer.files);
    };
    input.onchange = function () { addFiles(input.files); input.value = ''; };

    function addFiles(fs) {
        [].forEach.call(fs, function (f) {
            if (!/^image\//.test(f.type)) return;
            pendingFiles.push(f);
            var url = URL.createObjectURL(f);
            var box = document.createElement('div');
            box.style.cssText = 'position:relative;width:72px;height:72px;';
            box.innerHTML = '<img src="' + url + '" style="width:72px;height:72px;object-fit:cover;border-radius:6px;">' +
                '<span style="position:absolute;top:-7px;right:-7px;cursor:pointer;background:#FF5722;color:#fff;border-radius:50%;width:18px;height:18px;line-height:18px;text-align:center;font-size:12px;">×</span>';
            box.querySelector('span').onclick = function () {
                pendingFiles = pendingFiles.filter(function (x) { return x !== f; });
                box.remove();
            };
            list.appendChild(box);
        });
    }

    document.getElementById('uploadBtn').onclick = function () {
        if (!pendingFiles.length) { layui.layer.msg('先选图片'); return; }
        var btn = document.getElementById('uploadBtn');
        btn.disabled = true; btn.innerText = '上传中…';
        var caption = document.getElementById('caption').value;
        var total = pendingFiles.length, done = 0, failed = 0;
        var lastPoint = null;
        pendingFiles.forEach(function (f) {
            var fd = new FormData();
            fd.append('file', f);
            fd.append('lng-and-lat', (window.__pick && window.__pick.lnglat) || '');
            fd.append('caption', caption);
            axios.post('upload💕index', fd).then(function (res) {
                done++;
                if (res.data && res.data.code == 200 && res.data.data) {
                    var photo = res.data.data;
                    addPhotoMarker(photo);
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
            btn.disabled = false; btn.innerText = '开始上传';
            if (failed === 0) {
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

function delPhoto(fid) {
    layui.use('layer', function () {
        layui.layer.open({
            title: '确定删除?', content: '<img width="180" src="/images/wuwu.gif">',
            btn: ['删除', '取消'],
            yes: function (idx) {
                axios.post('/index💕delete', { fid: fid }).then(function (res) {
                    layui.layer.msg(res.data.msg, function () { location.reload(); });
                });
            }
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
