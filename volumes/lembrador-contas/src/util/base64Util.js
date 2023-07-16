var atob = require('atob');

module.exports = {
    base64ToBin: function (base64str) {
        var text = base64ToText(base64str);
        var len = text.length;         // get binary length
        var buffer = new ArrayBuffer(len);         // create ArrayBuffer with binary length
        var view = new Uint8Array(buffer);         // create 8-bit Array

        // save unicode of binary data into 8-bit Array
        for (var i = 0; i < len; i++)
            view[i] = binary.charCodeAt(i);

        return view;
    },
    fixBase64: function (base64String) {
        var base64 = (base64String).replace(/_/g, '/'); //Replace this characters 
        base64 = base64.replace(/-/g, '+');
        return base64;
    },
    base64ToText: function (base64String) {
        return atob(base64String.replace(/\s/g, ''));// decode base64 string, remove space for IE compatibility
    }
}