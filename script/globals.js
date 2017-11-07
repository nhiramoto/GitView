const $ = require('jquery');

module.exports = {
    "showMessage": (title, message, callback) => {
        $('#message #msgtitle').text(title);
        $('#message #msgbody').text(message);
        $('#message').addClass('visible');
        setTimeout(() => {
            $('#message').removeClass('visible');
            if (callback !== undefined) {
                callback();
            }
        }, 3000);
    },
    "showError": (title, message, callback) => {
        $('#message').addClass('error');
        $('#message #msgtitle').text(title);
        $('#message #msgbody').text(message);
        $('#message').addClass('visible');
        setTimeout(() => {
            $('#message').removeClass('visible');
            $('#message').removeClass('error');
            if (callback !== undefined) {
                callback();
            }
        }, 3000);
    }
};
