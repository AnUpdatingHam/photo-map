<?php
namespace controllers;

use models\User;

class UserController extends Controller
{
    public function login()
    {
        $bgimg = '/images/bgimg/'.mt_rand(1,10).'.jpg';
        view('index.login',[
            'bgimg'=>$bgimg,
        ]);
    }

    public function register()
    {

        if(!config('reg_switch')){
            return view('close.index');
        }
        $bgimg = '/images/bgimg/'.mt_rand(1,10).'.jpg';
        view('index.register',[
            'bgimg'=>$bgimg,
        ]);
    }

    public function dologin()
    {
        $data = $this->request();
        $name = trim($data['name'] ?? '');
        if($name === ''){
            return $this->response('请输入昵称',401);
        }
        $user = new User;
        $user_info = $user->getUserByName($name);
        if($user_info){
            setcookie("map-info",encryption($user_info['u_qq']).'-'.encryption($user_info['u_password']),time()+7*24*3600);
            return $this->response('登录成功',200);
        }else{
            return $this->response('昵称不存在，请先注册',401);
        }
    }

    public function doregister()
    {
        if(!config('reg_switch')){
            return $this->response('很抱歉-地图相册现已关闭注册',500);
        }
        $data = $this->request();
        $name = trim($data['name'] ?? '');
        if($name === ''){
            return $this->response('请输入昵称',401);
        }
        // 邀请码可选：配置里留空则不校验；填了就必须与配置一致
        $invite = trim($data['code'] ?? '');
        $expected = (string)config('encryption_value_code');
        if($expected !== '' && $invite !== $expected){
            return $this->response('邀请码错误', 401);
        }
        $user_model = new User();
        if($user_model->findByName($name)){
            return $this->response('这个昵称已经被使用了',401);
        }
        $avatar = '/images/avatar/Fruit-'.random_int(1,10).'.png';
        $res = $user_model->insert([
            'u_qq'     => $name,
            'u_name'   => $name,
            'u_avatar' => $avatar,
            'u_email'  => '',
            'u_code'   => 'love'.encryption($name),
        ]);
        if($res){
            return $this->response('注册成功',200);
        }else{
            return $this->response('服务器内部错误',500);
        }
    }

    public function out()
    {
        setcookie('map-info', NULL);
        session_destroy();
        redirect('/user💕login');
    }

    public function bind()
    {
        $data = $this->request();
        $user = new User;
        $my_info = $user->getCodeInfo($data['my_code']);
        $to_info = $user->getCodeInfo($data['to_code']);
        if($my_info && $to_info){
            if(!$my_info['u_love_uid']==0 ||!$to_info['u_love_uid']==0){
                return $this->response('你们两个好像其中一个有关联关系哦',400);
            }
            $time = date('Y-m-d H:i:s');
            $res1 = $user->bindLove($my_info['u_id'],$to_info['u_id'],$data['to_code'],$time);
            if($res1){
                $res2 = $user->bindLove($to_info['u_id'],$my_info['u_id'],$data['my_code'],$time);
                if($res2){
                    return $this->response('关联成功',200);
                }else{
                    return $this->response('数据库好像出问题了',500);
                }
            }else{
                return $this->response('数据库好像出问题了',500);
                
            }
        }else{
            return $this->response('请求数据好像出了问题呢',400);
        }    
    }
}
