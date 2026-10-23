<?php

namespace controllers;

use models\User;
use models\File;

class IndexController extends Controller
{
    public function index()
    {
        $info = $_COOKIE["map-info"] ?? '';
        if ($info) {
            $info = explode('-', $info);
            $qq = encryption($info[0], 1);
            $password = encryption($info[1], 1);
            $user = new User;
            $userinfo = $user->CookiegetUserInfo($qq, $password);
            if ($userinfo) {
                $_SESSION['id'] = $userinfo['u_id'];
                $_SESSION['name'] = $userinfo['u_name'];
                $_SESSION['avatar'] = $userinfo['u_avatar'];
                $_SESSION['qq'] = $userinfo['u_qq'];
                $_SESSION['love_code'] = $userinfo['u_code'];
                $file = new File;
                $data = $file->getFiles($_SESSION['id']);
                $rows = count($data);
                foreach ($data as $v => $k) {
                    $data[$v]['lat'] = floatval($data[$v]['lat']);
                    $data[$v]['lng'] = floatval($data[$v]['lng']);
                    if($data[$v]['event']==null){
                        $data[$v]['event']='';
                    }
                    if($data[$v]['batch']===null){
                        $data[$v]['batch']='';
                    }
                    if($data[$v]['mood']===null){
                        $data[$v]['mood']='';
                    }
                }
                $files = [
                    "rows" => $data,
                    'time' => 0.03,
                    "fields" => [
                        "lat" => [
                            "type" => "number"
                        ],
                        "lng" => [
                            "type" => "number"
                        ],
                        "thumbnail" => [
                            "type" => "string"
                        ],
                        "nodes" => [
                            "type" => "string"
                        ],
                        "url" => [
                            "type" => "string"
                        ],
                        "video" => [
                            "type" => "string"
                        ],
                        "caption" => [
                            "type" => "string"
                        ],
                        "name" => [
                            "type" => "string"
                        ],
                        "avatar" => [
                            "type" => "string"
                        ]
                    ],
                    "total_rows" => $rows
                ];
                $files = json_encode($files);
                $id = $userinfo['u_id'];
                $love_id = $user->getLoveId($id);
                $love_data='';
                if($love_id){
                   $love_info =  $user->getLoveInfo($love_id);
                   $love_data = $love_info['u_name'].','.$love_info['u_avatar'].','.$love_info['u_love_time'];
//                   dd($love_info);
                }
//                dd($love_id);
                view('index.index', [
                    'files' => $files,
                    'love_data'=>$love_data
                ]);
            } else {
                redirect('/user💕login');
            }
        } else {
            redirect('/user💕login');
        }
    }

    public function delete()
    {
        $data = $this->request();
        $fid = $data['fid'];
        $file = new File;
        $status = $file->del($fid);
        if ($status) {
            return $this->response('删除成功',200);
        }else {
            return $this->response('文件不存在或已删除',400);
        }
    }
    
    public function addmiaoshu()
    {
        $data = $this->request();
        $fid = $data['fid'];
        // $content = e($data['content']);
        $content = $data['content'];
        if ($fid && $content) {
            $file = new File;
            $status = $file->addMiaoShu($fid, $content);
            if ($status) {
                return $this->response('描述修改或添加成功',200);
            } else {
                return $this->response('描述内容未变化或错误',400);
            }
        }
    }

    public function addcaption()
    {
        if (empty($_SESSION['id'])) return $this->response('未登录', 401);
        $data = $this->request();
        $fid = (int)($data['fid'] ?? 0);
        $content = trim((string)($data['content'] ?? ''));
        if (!$fid) return $this->response('参数错误', 400);
        $file = new File;
        $status = $file->addCaption($fid, $content);
        if ($status) {
            return $this->response('签名已保存', 200);
        } else {
            return $this->response('保存失败或无变化', 400);
        }
    }

    // 编辑一次提交：共用事件文案 / 起止时间 / 心情（整组 fids）
    public function editrecord()
    {
        if (empty($_SESSION['id'])) return $this->response('未登录', 401);
        $data = $this->request();
        $fids = $data['fids'] ?? [];
        if (!is_array($fids)) $fids = [$fids];
        $fids = array_filter(array_map('intval', $fids));
        if (!$fids) return $this->response('参数错误', 400);
        $event = trim((string)($data['event'] ?? ''));
        $start = trim((string)($data['start_time'] ?? ''));
        $end = trim((string)($data['end_time'] ?? ''));
        $mood = trim((string)($data['mood'] ?? ''));
        $file = new File;
        $status = $file->editRecord($fids, $event, $start, $end, $mood);
        if ($status) {
            return $this->response('已保存', 200);
        } else {
            return $this->response('保存失败或无变化', 400);
        }
    }
}
