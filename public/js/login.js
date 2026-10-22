layui.use(['form', 'layer'], function() {
    var form = layui.form,
        layer = layui.layer;

    form.verify({
        name: function(value) {
            if (!value || value.trim().length === 0) {
                return '请输入昵称';
            }
            if (value.trim().length > 30) {
                return '昵称最长30个字符哦';
            }
        }
    });

    form.on('submit(login)', function(data) {
        data = data.field;
        axios.post('/user💕dologin', {
            name: data.name.trim()
        })
        .then(function(response) {
            if (response.data.code == 200) {
                layer.msg(response.data.msg, { icon: 1, anim: 1 }, function() {
                    window.location.href = "/index💕index";
                });
            } else {
                layer.msg(response.data.msg, { icon: 5, anim: 6 });
            }
        });
        return false;
    });
});
