<?php
namespace models;
class User extends Base{
    // 按昵称查重
    public function findByName($name){
        $stmt = self::$pdo->prepare("SELECT u_id FROM `m_users` WHERE u_name = ?");
        $stmt->execute([$name]);
        return $stmt->fetch(\PDO::FETCH_NUM);
    }

    // 按昵称取用户（昵称即登录账号）
    public function getUserByName($name){
        $stmt = self::$pdo->prepare("SELECT * FROM `m_users` WHERE u_name = ?");
        $stmt->execute([$name]);
        return $stmt->fetch(\PDO::FETCH_ASSOC);
    }

    public function insert($data){
        $sql = "INSERT INTO m_users(u_qq,u_password,u_google_auth,u_name,u_avatar,u_email,u_code) VALUES(?,?,?,?,?,?,?)";
        $stmt = self::$pdo->prepare($sql);
        return $stmt->execute([
            $data['u_qq'],
            '',
            '',
            $data['u_name'],
            $data['u_avatar'],
            $data['u_email'],
            $data['u_code'],
        ]);
     }

     public function getUserInfo($qq,$password){
        $stmt = self::$pdo->prepare("SELECT * FROM `m_users` WHERE u_qq = ? and u_password = ?");
        $stmt->execute([$qq,$password]);
        return $stmt->fetch(\PDO::FETCH_ASSOC);
     }


    public function getLoveInfo($id){
        $sql = "SELECT * FROM `m_users` WHERE u_id ='$id' ";
        $stmt = self::$pdo->query($sql);
        $data = $stmt->fetch(\PDO::FETCH_ASSOC );
        return $data;
    }

     public function CookiegetUserInfo($qq,$password){
      $stmt = self::$pdo->prepare("SELECT * FROM `m_users` WHERE u_qq = ? AND u_password = ?");
      $stmt->execute([$qq,$password]);
      $data = $stmt->fetch(\PDO::FETCH_ASSOC );
      return $data;
   }
   //关联相关先关掉
   // public function getFriendInfo($name){
   //    $info = self::$pdo->query("SELECT u_id,u_avatar FROM `m_users` WHERE u_name = '$name' ")->fetch(); 
   //    return $info;
   // }
   // public function getFriend($id){
   //    $my = self::$pdo->query("SELECT f.*,u.u_id,u.u_name,u.u_avatar FROM m_friend f lEFT JOIN m_users u ON u.u_id = f.f_fid WHERE f.f_mid = $id")->fetch();
   //    $you = self::$pdo->query("SELECT f.*,u.u_id,u.u_name,u.u_avatar FROM m_friend f lEFT JOIN m_users u ON u.u_id = f.f_fid WHERE f.f_fid = $id")->fetch();
   //    $info = [
   //       'my'=>$my,
   //       'you'=>$you
   //    ];
   //    return $info;
   // }
    public function getLoveId($id){
        return self::$pdo->query("SELECT u_love_uid FROM `m_users` WHERE u_id = '$id' ")->fetch()['u_love_uid'];
    }

    public function getCodeInfo($code){
        $sql = "SELECT * FROM `m_users` WHERE u_code ='$code'";
        $stmt = self::$pdo->query($sql);    
        $data = $stmt->fetch(\PDO::FETCH_ASSOC );
        return $data;
    }

    public function bindLove($my_id,$love_to_id,$love_to_code,$love_to_time){
        $sql = "UPDATE m_users SET u_love_code= '$love_to_code',u_love_uid = '$love_to_id',u_love_time='$love_to_time' WHERE u_id= $my_id";
        $sta = self::$pdo->exec($sql);
        return $sta;
    }

    //修改关联信息
}