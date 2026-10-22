layui.use(['form', 'layer'], function() {
    var form = layui.form,
        layer = layui.layer;

    form.verify({
        name: function(value) {
            if (!value || value.trim().length === 0) {
                return '起个昵称吧◉‿◉';
            }
            if (value.trim().length < 2) {
                return '昵称至少2个字符哦';
            }
            if (value.trim().length > 30) {
                return '昵称最长30个字符哦';
            }
        }
    });

    form.on('submit(register)', function(data) {
        data = data.field;
        axios.post('/user💕doregister', {
            name: data.name.trim(),
            code: (data.code || '').trim()
        })
        .then(function(response) {
            if (response.data.code == 200) {
                layer.msg(response.data.msg + '要牢记你的昵称哦', { icon: 1, anim: 1 }, function() {
                    window.location.href = "/user💕login";
                });
            } else {
                layer.msg(response.data.msg, { icon: 5, anim: 6 });
            }
        });
        return false;
    });
});
