<?php
namespace controllers;

use models\Upload;
use libs\CoordTransform;
use WebPConvert\WebPConvert;

class UploadController extends Controller
{
    // 前端选点：服务端用 web key 逆地理，绕开 JS key 的 scode 限制
    public function regeo()
    {
        $lng = $_GET['lng'] ?? '';
        $lat = $_GET['lat'] ?? '';
        if ($lng === '' || $lat === '') $this->response('参数缺失', 400);
        $g = getGpsInfo($lng, $lat);
        if (!empty($g['status'])) {
            $pois = [];
            if (!empty($g['regeocode']['pois'])) {
                foreach ($g['regeocode']['pois'] as $p) {
                    $pois[] = [
                        'name' => $p['name'],
                        'address' => $p['address'] ?: '',
                        'distance' => (int) $p['distance']
                    ];
                }
                usort($pois, function ($a, $b) { return $a['distance'] - $b['distance']; });
            }
            echo json_encode([
                'code' => 200,
                'address' => $g['regeocode']['formatted_address'],
                'towncode' => $g['regeocode']['addressComponent']['towncode'],
                'pois' => array_slice($pois, 0, 6)
            ]);
        } else {
            $this->response('定位失败', 407);
        }
    }

    // 前端选点：服务端用 web key 搜索地点
    public function search()
    {
        $kw = trim($_GET['kw'] ?? '');
        if ($kw === '') $this->response('关键词为空', 400);
        $url = 'https://restapi.amap.com/v3/place/text?keywords=' . urlencode($kw)
            . '&offset=6&page=1&extensions=base&key=' . config('map-key');
        $r = json_decode(file_get_contents($url), 1);
        if (!empty($r['status']) && !empty($r['pois'])) {
            $list = [];
            foreach ($r['pois'] as $p) {
                $loc = explode(',', $p['location']);
                $list[] = [
                    'name' => $p['name'],
                    'address' => $p['address'] ?: $p['pname'] . $p['cityname'] . $p['adname'],
                    'lng' => $loc[0],
                    'lat' => $loc[1]
                ];
            }
            echo json_encode(['code' => 200, 'pois' => $list]);
        } else {
            $this->response('未找到结果', 404);
        }
    }

    // 主地图点选：查落点附近的 POI（景点/楼宇等），命中近点就显示 POI 名
    public function around()
    {
        $lng = $_GET['lng'] ?? '';
        $lat = $_GET['lat'] ?? '';
        if ($lng === '' || $lat === '') $this->response('参数缺失', 400);
        $url = 'https://restapi.amap.com/v3/place/around?location=' . $lng . ',' . $lat
            . '&radius=200&offset=8&page=1&extensions=base&key=' . config('map-key');
        $r = json_decode(file_get_contents($url), 1);
        if (!empty($r['status']) && !empty($r['pois'])) {
            $list = [];
            foreach ($r['pois'] as $p) {
                $loc = explode(',', $p['location']);
                $list[] = [
                    'name' => $p['name'],
                    'address' => $p['address'] ?: '',
                    'lng' => $loc[0],
                    'lat' => $loc[1],
                    'distance' => (int) $p['distance']
                ];
            }
            echo json_encode(['code' => 200, 'pois' => $list]);
        } else {
            echo json_encode(['code' => 200, 'pois' => []]);
        }
    }

    public function index()
    {
        // 以 map-info cookie 为准解析当前用户，避免旧会话里 qq/id 类型异常
        $uid = 0;
        $uqq = '';
        $uinfo = null;
        $rawCaption = trim($_POST['caption'] ?? '');
        $raw = $_COOKIE['map-info'] ?? '';
        if ($raw) {
            $parts = explode('-', $raw);
            $user = new \models\User;
            $info = $user->CookiegetUserInfo(encryption($parts[0] ?? '', 1), encryption($parts[1] ?? '', 1));
            if ($info) {
                $uid = (int) $info['u_id'];
                $uqq = (string) $info['u_qq'];
                $uinfo = $info;
            }
        }
        if (!$uid && !empty($_SESSION['id']) && is_scalar($_SESSION['qq'] ?? null)) {
            $uid = (int) $_SESSION['id'];
            $uqq = (string) $_SESSION['qq'];
        }
        if (!$uid) $this->response('未登录，请先登录', 401);
        $_SESSION['id'] = $uid;
        $_SESSION['qq'] = $uqq;

        //接受表单传递过来的数据
        $file = $_FILES['file'];
        if (empty($file['tmp_name']) || !empty($file['error'])) {
            $this->response('图片接收失败：可能超过大小限制(当前50M)或文件损坏', 413);
        }
        @$lngAndLat = $_POST['lng-and-lat'];
        @$time = $_POST['time'];
        $caption = addslashes(trim($_POST['caption'] ?? ''));        // 共用文案 → f_event
        $perCaption = addslashes(trim($_POST['per-caption'] ?? '')); // 单张文案 → f_caption
        $batch = addslashes(trim($_POST['batch'] ?? ''));             // 一次多选提交的批次号
        // 起止时间：datetime-local 形如 2026-10-23T18:30，统一存为 YYYY-MM-DD HH:mm
        $startTime = addslashes(str_replace('T', ' ', trim($_POST['start-time'] ?? '')));
        $endTime = addslashes(str_replace('T', ' ', trim($_POST['end-time'] ?? '')));
        $img = $file['tmp_name'];
        makeDir(UPURL.'photos/'.$uqq);
        $dbsave_dir = 'photos/'.$uqq.'/'.$file['name'];
        $saveDir = UPURL.'photos/'.$uqq.'/'.$file['name'];
        $isTemp = move_uploaded_file($img,$saveDir);
        if($isTemp){
            if($lngAndLat){
                //获取定位信息
                list($lngs,$lats)=explode(',',$lngAndLat);
                $gps_data = getGpsInfo($lngs,$lats);
                if($gps_data['status']){
                    //获取区号用于文件移入路径
                    $towncode = $gps_data['regeocode']['addressComponent']['towncode'] ?? '';
                    if (!is_string($towncode) || $towncode === '') $towncode = 'other';
                    //获取具体地点
                    $address = $gps_data['regeocode']['formatted_address'];
                        //创建目录，移动文件
                        // 注意：$dir 是给数据库/URL 用的相对路径，落盘必须拼 UPURL，否则会写到仓库根目录
                        $dir = "photos/$uqq/{$towncode}";
                        makeDir(UPURL.$dir);
                        $url = $dir."/".$file['name'];
                        $slurl = $dir.'/'.thumb_name($file['name']);
                        $wsysurl = UPURL.$dir.'/WEBP'.$file['name'].".webp";
                        $dbwsysurl = $dir.'/WEBP'.$file['name'].".webp";
                        // 图片压缩/缩略失败不应阻断上传，失败则回退用原图
                        try {
                            WebPConvert::convert($saveDir, $wsysurl, []);
                        } catch (\Throwable $e) {
                            $dbwsysurl = $dbsave_dir;
                        }
                        try {
                            suolue($saveDir, UPURL.$slurl);
                            if (!file_exists(UPURL.$slurl)) $slurl = $dbsave_dir;
                        } catch (\Throwable $e) {
                            $slurl = $dbsave_dir;
                        }
                        $id = $uid;
                        $upload = new Upload;
                        $sql = "INSERT INTO m_files(f_uid,f_lng,f_lat,f_url,f_slurl,f_wsysurl,f_date_time,f_start_time,f_end_time,f_towncode,f_address,f_event,f_caption,f_batch) VALUES($id,'$lngs','$lats','$dbsave_dir','$slurl','$dbwsysurl','$time','$startTime','$endTime','$towncode', '$address','$caption','$perCaption','$batch')";
                        $newId = $upload->insert($sql);
                        if($newId){
                            echo json_encode([
                                'code'=>200,
                                'msg'=>'上传成功',
                                'address'=>$address,
                                'data'=>[
                                    'id'=>(int)$newId,
                                    'lng'=>$lngs,
                                    'lat'=>$lats,
                                    'url'=>$dbsave_dir,
                                    'thumbnail'=>$slurl,
                                    'nondes'=>$dbwsysurl,
                                    'event'=>$rawCaption,
                                    'caption'=>trim($_POST['per-caption'] ?? ''),
                                    'start_time'=>$startTime,
                                    'end_time'=>$endTime,
                                    'batch'=>$batch,
                                    'address'=>$address,
                                    'name'=>$uinfo['u_name'] ?? '',
                                    'avatar'=>$uinfo['u_avatar'] ?? ''
                                ]
                        ]);
                        }
                }else{
                    return $this->response('定位信息错误',407);
                }
           }else{
               try{
                   //图片存在exif信息
                   @$exif = exif_read_data($saveDir,'IFD0',false);
                   $image = imagecreatefromstring(file_get_contents($saveDir));
                   //获取经度
                   @$lngs = getGps($exif["GPSLongitude"], $exif['GPSLongitudeRef']);
                   //获取纬度
                   @$lats = getGps($exif["GPSLatitude"], $exif['GPSLatitudeRef']);
                   if(!$lngs && !$lats){
                       return $this->response('没有获取到图片的定位信息',400);
                   }else{
                        $coordtransform = new CoordTransform();
                        $GPS = $coordtransform->wgs84togcj02($lngs,$lats);
                        $lngs = $GPS[0];
                        $lats = $GPS[1];
                       //获取拍摄时间
                       $time = getDateTime($exif);
                        //获取定位信息
                       $gps_data = getGpsInfo($lngs,$lats);
                       //获取区号用于保存路径
                       $towncode = $gps_data['regeocode']['addressComponent']['towncode'] ?? '';
                    if (!is_string($towncode) || $towncode === '') $towncode = 'other';
                       //获取具体地点
                       $address = $gps_data['regeocode']['formatted_address'];
                       //创建目录，移动文件
                       // 同样：$dir 只用于数据库/URL，落盘统一走 UPURL
                       $dir = "photos/$uqq/{$towncode}";
                       makeDir(UPURL.$dir);
                       //图片翻转
                       switch($exif['Orientation']) {
                           case 8:
                               $image = imagerotate($image,90,0);
                               break;
                           case 3:
                               $image = imagerotate($image,180,0);
                               break;
                           case 6:
                               $image = imagerotate($image,-90,0);
                               break;
                       }
                       $absRotated = UPURL.$dir.'/'.$file['name'];
                       imagejpeg($image, $absRotated);
                       imagedestroy($image);
                       $url = $dir."/".$file['name'];
                       $slurl = $dir.'/'.thumb_name($file['name']);
                       $wsysurl =  UPURL.$dir.'/WEBP'.$file['name'].".webp";//保存图片的文件名
                       $dbwsysurl = $dir.'/WEBP'.$file['name'].".webp";
                       //缩略图/压缩失败不阻断上传，回退用原图
                       try {
                           suolue($absRotated, UPURL.$slurl);
                           if (!file_exists(UPURL.$slurl)) $slurl = $dbsave_dir;
                       } catch (\Throwable $e) {
                           $slurl = $dbsave_dir;
                       }
                       try {
                           WebPConvert::convert($absRotated, $wsysurl, []);
                       } catch (\Throwable $e) {
                           $dbwsysurl = $dbsave_dir;
                       }
                       @unlink($absRotated);
                        $id = $uid;
                        $upload = new Upload;
                        $sql = "INSERT INTO m_files(f_uid,f_lng,f_lat,f_url,f_slurl,f_wsysurl,f_date_time,f_start_time,f_end_time,f_towncode,f_address,f_event,f_caption,f_batch) VALUES($id,'$lngs','$lats','$dbsave_dir','$slurl','$dbwsysurl','$time','$startTime','$endTime','$towncode', '$address','$caption','$perCaption','$batch')";
                        $isUp = $upload->insert($sql);
                        if($isUp){
                            echo json_encode([
                                'code'=>200,
                                'msg'=>'上传成功',
                                'address'=>$address
                            ]);
                        }
                   }
               }catch(Exception $e){
                   echo $e->getMessage();
               }    
           }   
        }else{
            echo json_encode([
                'code'=>404,
                'msg'=>'这张图片貌似出了问题，暂已屏蔽上传'
            ]);
        }
    }
}


