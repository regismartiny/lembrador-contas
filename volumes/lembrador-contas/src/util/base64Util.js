export default {
    base64ToBin: function (base64str) {
        const text = base64ToText(base64str);
        const len = text.length;
        const buffer = new ArrayBuffer(len);
        const view = new Uint8Array(buffer);

        for (let i = 0; i < len; i++)
            view[i] = text.charCodeAt(i);

        return view;
    },
    fixBase64: function (base64String) {
        let base64 = (base64String).replace(/_/g, '/'); //Replace this characters
        base64 = base64.replace(/-/g, '+');
        return base64;
    },
    base64ToText: function (base64String) {
        return atob(base64String.replace(/\s/g, ''));// decode base64 string, remove space for IE compatibility
    }
}