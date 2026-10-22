<?php
namespace models;
class Upload extends Base{
    public function insert($sql){
       $ok = self::$pdo->exec($sql);
       return $ok ? self::$pdo->lastInsertId() : false;
    }
}
