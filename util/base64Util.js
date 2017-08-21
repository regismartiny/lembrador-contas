var atob = require('atob');

module.exports = {
    base64ToBin: function (binaryData) {
        var base64str = binaryData// base64 string from  thr response of server
        var binary = atob(base64str.replace(/\s/g, ''));// decode base64 string, remove space for IE compatibility
        var len = binary.length;         // get binary length
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
    }
}